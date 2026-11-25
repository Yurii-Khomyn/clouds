const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`
    SELECT sensor_id, sensor_type, count(*)::int AS rows,
           count(*) FILTER (WHERE is_anomaly)::int AS anomalies,
           min(measured_at) AS first, max(measured_at) AS last
    FROM measurements GROUP BY sensor_id, sensor_type ORDER BY sensor_id`);
  console.table(rows.map((r) => ({ ...r, first: r.first.toISOString(), last: r.last.toISOString() })));
  const { rows: [t] } = await client.query('SELECT count(*)::int AS total FROM measurements');
  console.log(`total rows: ${t.total}`);
  await client.end();
})().catch((err) => { console.error(err.message); process.exit(1); });
