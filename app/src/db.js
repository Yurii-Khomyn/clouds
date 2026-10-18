const { Pool } = require('pg');

// Рядок підключення береться ТІЛЬКИ зі змінної середовища (вимога методички:
// жодних секретів у коді чи репозиторії).
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Керований PostgreSQL в Azure вимагає TLS; локально (compose) він не потрібен.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// База може стартувати повільніше за застосунок, тому пробуємо підключитись кілька разів.
async function waitForDb(attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`DB not ready (${i}/${attempts}): ${err.message}`);
      await sleep(2000);
    }
  }
  throw new Error('Database is unreachable');
}

// Створює таблиці при першому запуску і наповнює каталог товарів.
async function init() {
  await waitForDb();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          SERIAL PRIMARY KEY,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      image_url   TEXT    NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0)
    );
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      name          TEXT        NOT NULL,
      email         TEXT        NOT NULL UNIQUE,
      password_hash TEXT        NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id            SERIAL PRIMARY KEY,
      customer_name TEXT        NOT NULL,
      total_cents   INTEGER     NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- user_id додано пізніше: ALTER безпечний для вже існуючої бази.
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    CREATE TABLE IF NOT EXISTS order_items (
      id         SERIAL PRIMARY KEY,
      order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity   INTEGER NOT NULL CHECK (quantity > 0)
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM products');
  if (rows[0].n === 0) {
    await pool.query(`
      INSERT INTO products (name, description, image_url, price_cents) VALUES
        ('Приставний столик',   'Біле дерево з акцентними ніжками, діаметр 40 см', '/img/table.jpg',  189900),
        ('Сірі рушники',        'Набір з 4 м''яких рушників із льону',             '/img/towels.jpg', 64900),
        ('Декоративна подушка', 'Бавовна, 45×45 см, зі зйомною наволочкою',        '/img/pillow.jpg', 39900),
        ('Керамічна кружка',    'М''ятна глазур, об''єм 350 мл',                   '/img/mug.jpg',    24900),
        ('Кашпо з рослиною',    'Біла кераміка і штучний евкаліпт',                '/img/plant.jpg',  89900)
    `);
    console.log('Seeded products');
  }
}

module.exports = { pool, init };
