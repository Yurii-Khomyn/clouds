const path = require('path');
const express = require('express');
const { pool, init } = require('./db');

const app = express();
app.use(express.json());
// Фронтенд (статичні файли) віддає той самий сервіс: один образ, один контейнер.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check: його будуть смикати балансувальник і Container Apps.
// Навмисно НЕ ходить у базу: це перевірка, що процес живий.
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/products', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, description, image_url, price_cents FROM products ORDER BY id'
  );
  res.json(rows);
});

// Список замовлень: зручно показати на захисті, що дані реально лежать у базі.
app.get('/orders', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT o.id, o.customer_name, o.total_cents, o.created_at,
           json_agg(json_build_object('product_id', i.product_id, 'quantity', i.quantity)) AS items
    FROM orders o JOIN order_items i ON i.order_id = o.id
    GROUP BY o.id ORDER BY o.id DESC LIMIT 20
  `);
  res.json(rows);
});

// Тіло: { "customer": "Ім'я", "items": [ { "productId": 1, "quantity": 2 } ] }
app.post('/orders', async (req, res) => {
  const { customer, items } = req.body || {};
  if (typeof customer !== 'string' || !customer.trim() || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'customer and non-empty items are required' });
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
      'INSERT INTO orders (customer_name, total_cents) VALUES ($1, $2) RETURNING id, created_at',
      [customer.trim(), total]
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
