const { Pool } = require('pg');

let pool = null;
let schemaReady = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: Number(process.env.DB_POOL_MAX || 3),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (err) => console.error('pg pool error:', err.message));
  }
  return pool;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS measurements (
    sensor_id      TEXT             NOT NULL,
    measured_at    TIMESTAMPTZ      NOT NULL,
    sensor_type    TEXT             NOT NULL,
    value          DOUBLE PRECISION NOT NULL,
    unit           TEXT             NOT NULL,
    lat            DOUBLE PRECISION NOT NULL,
    lon            DOUBLE PRECISION NOT NULL,
    deviation      DOUBLE PRECISION,
    is_anomaly     BOOLEAN          NOT NULL DEFAULT false,
    anomaly_reason TEXT,
    details        JSONB            NOT NULL DEFAULT '{}',
    received_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
    PRIMARY KEY (sensor_id, measured_at)
  );
  CREATE INDEX IF NOT EXISTS measurements_type_time_idx ON measurements (sensor_type, measured_at DESC);
  CREATE INDEX IF NOT EXISTS measurements_anomaly_idx ON measurements (measured_at DESC) WHERE is_anomaly;
`;

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(7301)');
        await client.query(SCHEMA);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        schemaReady = null;
        throw err;
      } finally {
        client.release();
      }
    })();
  }
  return schemaReady;
}

module.exports = { getPool, ensureSchema };
