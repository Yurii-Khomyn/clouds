const path = require('path');
const crypto = require('crypto');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { pool, init } = require('./db');
const openapi = require('./openapi');
const cache = require('./cache');
const { validateItems, submitOrder } = require('./orders');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('./auth');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const tag = res.get('X-Cache') ? ` [${res.get('X-Cache')}]` : '';
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode}${tag} ${Date.now() - start}ms`);
  });
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/openapi.json', (req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Все для дому: API' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 100 ||
      typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254 ||
      typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'name, valid email and password (8+ chars) are required' });
  }
  try {
    const { rows: [user] } = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name',
      [name.trim(), email.trim().toLowerCase(), hashPassword(password)]
    );
    res.status(201).json({ token: signToken(user), name: user.name });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'email already registered' });
    throw err;
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const { rows: [user] } = await pool.query(
    'SELECT id, name, password_hash FROM users WHERE email = $1', [email.trim().toLowerCase()]
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: signToken(user), name: user.name });
});

app.get('/products', async (req, res) => {
  const rows = await cache.cached('products:all', async () => {
    const { rows } = await pool.query(
      'SELECT id, name, description, image_url, price_cents FROM products ORDER BY id'
    );
    return rows;
  }, res);
  res.json(rows);
});

app.get('/products/popular', async (req, res) => {
  const rows = await cache.cached('products:popular', async () => {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.price_cents, COALESCE(SUM(i.quantity), 0)::int AS sold
      FROM products p LEFT JOIN order_items i ON i.product_id = p.id
      GROUP BY p.id ORDER BY sold DESC, p.id LIMIT 5
    `);
    return rows;
  }, res);
  res.json(rows);
});

app.get('/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
  const product = await cache.cached(`products:${id}`, async () => {
    const { rows: [p] } = await pool.query(
      'SELECT id, name, description, image_url, price_cents FROM products WHERE id = $1', [id]
    );
    return p || null;
  }, res);
  if (!product) return res.status(404).json({ error: 'not found' });
  res.json(product);
});

app.get('/me', requireAuth, async (req, res) => {
  const { rows: [user] } = await pool.query(
    'SELECT id, name, email, created_at FROM users WHERE id = $1', [req.user.id]
  );
  res.json(user);
});

app.get('/orders/requests/:id', requireAuth, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'invalid id' });
  const { rows: [r] } = await pool.query(
    'SELECT id AS request_id, status, order_id, error FROM order_requests WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(r);
});

app.get('/orders/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows: [order] } = await pool.query(`
    SELECT o.id, o.customer_name, o.total_cents, o.created_at,
           json_agg(json_build_object('product_id', i.product_id, 'quantity', i.quantity)) AS items
    FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.id = $1 AND o.user_id = $2
    GROUP BY o.id
  `, [id, req.user.id]);
  if (!order) return res.status(404).json({ error: 'not found' });
  res.json(order);
});

app.get('/orders', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT o.id, o.customer_name, o.total_cents, o.created_at,
           json_agg(json_build_object('product_id', i.product_id, 'quantity', i.quantity)) AS items
    FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.user_id = $1
    GROUP BY o.id ORDER BY o.id DESC LIMIT 20
  `, [req.user.id]);
  res.json(rows);
});

app.post('/orders', requireAuth, async (req, res) => {
  const { items } = req.body || {};
  const invalid = validateItems(items);
  if (invalid) return res.status(400).json({ error: invalid });

  let idem = null;
  const header = req.get('Idempotency-Key');
  if (header) {
    if (header.length > 128) return res.status(400).json({ error: 'Idempotency-Key is too long' });
    idem = {
      key: `idem:${req.user.id}:${header}`,
      fp: crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex'),
    };
    const st = await cache.idemBegin(idem.key, idem.fp);
    if (st.state === 'replay') {
      res.set('Idempotent-Replay', 'true');
      return res.status(st.status).json(st.body);
    }
    if (st.state === 'busy') return res.status(409).json({ error: 'request with this key is in progress' });
    if (st.state === 'mismatch') {
      return res.status(422).json({ error: 'Idempotency-Key was already used with a different request' });
    }
  }

  try {
    const result = await submitOrder(req.user, items);
    if (idem) await cache.idemFinish(idem.key, idem.fp, result.status, result.body);
    res.status(result.status).json(result.body);
  } catch (err) {
    if (idem) await cache.idemAbort(idem.key);
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const port = process.env.PORT || 3000;

let server;

init()
  .then(() => {
    server = app.listen(port, () => console.log(`Listening on :${port}`));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  const done = async () => {
    await cache.close();
    await pool.end().catch(() => {});
    process.exit(0);
  };
  if (server) server.close(done); else done();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
