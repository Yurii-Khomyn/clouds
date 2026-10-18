const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { pool, init } = require('./db');
const openapi = require('./openapi');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('./auth');

const app = express();
app.use(express.json());

// Логуємо кожен запит у stdout: Container Apps передає його в Log Analytics.
// /health не логуємо, бо балансувальник кличе його кожні 15 секунд і це лише шум.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});
// Фронтенд (статичні файли) віддає той самий сервіс: один образ, один контейнер.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Документація API: Swagger UI за адресою /docs, сирий опис у /openapi.json.
app.get('/openapi.json', (req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Все для дому: API' }));

// Health check: його будуть смикати балансувальник і Container Apps.
// Навмисно НЕ ходить у базу: це перевірка, що процес живий.
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Автентифікація ---
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Тіло: { "name": "Ім'я", "email": "a@b.c", "password": "щонайменше 8 символів" }
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

// Тіло: { "email": "a@b.c", "password": "..." }
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const { rows: [user] } = await pool.query(
    'SELECT id, name, password_hash FROM users WHERE email = $1', [email.trim().toLowerCase()]
  );
  // Однакова відповідь для «немає такого email» і «хибний пароль»: не підказуємо, які email зареєстровані.
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: signToken(user), name: user.name });
});

app.get('/products', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, description, image_url, price_cents FROM products ORDER BY id'
  );
  res.json(rows);
});

// Власні замовлення користувача. Без токена повертає 401.
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

// Тіло: { "items": [ { "productId": 1, "quantity": 2 } ] }. Без токена повертає 401.
// Ім'я покупця беремо з токена, а не з тіла запиту: його не можна підробити.
app.post('/orders', requireAuth, async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'non-empty items are required' });
  }
  for (const it of items) {
    if (!Number.isInteger(it.productId) || !Number.isInteger(it.quantity) || it.quantity < 1) {
      return res.status(400).json({ error: 'invalid item' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ціну беремо з бази, а не від клієнта: інакше її можна підмінити.
    const ids = items.map((i) => i.productId);
    const { rows: prices } = await client.query(
      'SELECT id, price_cents FROM products WHERE id = ANY($1)', [ids]
    );
    const priceById = new Map(prices.map((p) => [p.id, p.price_cents]));
    if (ids.some((id) => !priceById.has(id))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'unknown product' });
    }
    const total = items.reduce((s, i) => s + priceById.get(i.productId) * i.quantity, 0);

    const { rows: [order] } = await client.query(
      'INSERT INTO orders (customer_name, total_cents, user_id) VALUES ($1, $2, $3) RETURNING id, created_at',
      [req.user.name, total, req.user.id]
    );
    for (const i of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)',
        [order.id, i.productId, i.quantity]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: order.id, total_cents: total, created_at: order.created_at });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  } finally {
    client.release();
  }
});

// Express 5 сам передає помилки з async-обробників сюди.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const port = process.env.PORT || 3000;

init()
  .then(() => app.listen(port, () => console.log(`Listening on :${port}`)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
