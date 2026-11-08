const crypto = require('crypto');
const { pool } = require('./db');
const queue = require('./queue');

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) return 'non-empty items are required';
  for (const it of items) {
    if (!Number.isInteger(it.productId) || !Number.isInteger(it.quantity) || it.quantity < 1) {
      return 'invalid item';
    }
  }
  return null;
}

async function insertOrder(client, user, items) {
  const ids = items.map((i) => i.productId);
  const { rows: prices } = await client.query(
    'SELECT id, price_cents FROM products WHERE id = ANY($1)', [ids]
  );
  const priceById = new Map(prices.map((p) => [p.id, p.price_cents]));
  if (ids.some((id) => !priceById.has(id))) return null;
  const total = items.reduce((s, i) => s + priceById.get(i.productId) * i.quantity, 0);

  const { rows: [order] } = await client.query(
    'INSERT INTO orders (customer_name, total_cents, user_id) VALUES ($1, $2, $3) RETURNING id, created_at',
    [user.name, total, user.id]
  );
  for (const i of items) {
    await client.query(
      'INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)',
      [order.id, i.productId, i.quantity]
    );
  }
  return { id: order.id, total_cents: total, created_at: order.created_at };
}

async function createOrder(user, items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await insertOrder(client, user, items);
    if (!order) {
      await client.query('ROLLBACK');
      return { status: 400, body: { error: 'unknown product' } };
    }
    await client.query('COMMIT');
    return { status: 201, body: order };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function submitOrder(user, items) {
  if (!queue.enabled) return createOrder(user, items);
  const requestId = crypto.randomUUID();
  await pool.query('INSERT INTO order_requests (id, user_id) VALUES ($1, $2)', [requestId, user.id]);
  try {
    await queue.enqueue({ requestId, user, items });
  } catch (err) {
    await pool.query('DELETE FROM order_requests WHERE id = $1', [requestId]);
    throw err;
  }
  return {
    status: 202,
    body: { request_id: requestId, status: 'pending', status_url: `/orders/requests/${requestId}` },
  };
}

async function processOrderRequest({ requestId, user, items }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [req] } = await client.query(
      'SELECT status FROM order_requests WHERE id = $1 FOR UPDATE', [requestId]
    );
    if (!req || req.status === 'done' || req.status === 'failed') {
      await client.query('ROLLBACK');
      return;
    }
    const order = await insertOrder(client, user, items);
    if (order) {
      await client.query(
        "UPDATE order_requests SET status = 'done', order_id = $2, updated_at = now() WHERE id = $1",
        [requestId, order.id]
      );
    } else {
      await client.query(
        "UPDATE order_requests SET status = 'failed', error = 'unknown product', updated_at = now() WHERE id = $1",
        [requestId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { validateItems, createOrder, submitOrder, processOrderRequest };
