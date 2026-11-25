const { app } = require('@azure/functions');
const { hasValidKey } = require('../lib/auth');
const { getPool, ensureSchema } = require('../lib/db');
const nosql = require('../lib/nosql');
const media = require('../lib/media');

const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s));

app.http('history', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sensors/{sensor_id}/history',
  handler: async (request, context) => {
    if (!hasValidKey(request)) {
      return { status: 401, jsonBody: { error: 'invalid or missing x-api-key' } };
    }
    const sensorId = request.params.sensor_id;
    const q = request.query;
    const from = q.get('from') || '1970-01-01T00:00:00Z';
    const to = q.get('to') || new Date(Date.now() + 60000).toISOString();
    const limit = q.get('limit') === null ? 100 : Number(q.get('limit'));

    if (!isIso(from) || !isIso(to)) {
      return { status: 400, jsonBody: { error: 'from and to must be ISO 8601 timestamps' } };
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      return { status: 400, jsonBody: { error: 'limit must be an integer from 1 to 1000' } };
    }

    const source = q.get('source') || 'sql';
    if (source !== 'sql' && source !== 'nosql') {
      return { status: 400, jsonBody: { error: 'source must be sql or nosql' } };
    }
    const withImage = (item, key) => (key ? { ...item, image_url: media.createReadUrl(key).url } : item);

    if (source === 'nosql') {
      const fromIso = new Date(from).toISOString();
      const toIso = new Date(to).toISOString();
      const docs = await nosql.history(sensorId, fromIso, toIso, limit);
      return { status: 200, jsonBody: docs.map((d) => withImage(d, d.object_key)) };
    }

    await ensureSchema();
    const { rows } = await getPool().query(
      `SELECT sensor_id, sensor_type, measured_at, value, unit, lat, lon,
              deviation, is_anomaly, anomaly_reason, details
       FROM measurements
       WHERE sensor_id = $1 AND measured_at >= $2 AND measured_at <= $3
       ORDER BY measured_at DESC
       LIMIT $4`,
      [sensorId, from, to, limit]
    );
    return {
      status: 200,
      jsonBody: rows.map((r) => withImage({
        sensor_id: r.sensor_id,
        sensor_type: r.sensor_type,
        value: r.value,
        unit: r.unit,
        location: { lat: r.lat, lon: r.lon },
        measured_at: r.measured_at.toISOString(),
        deviation: r.deviation,
        is_anomaly: r.is_anomaly,
        anomaly_reason: r.anomaly_reason,
        details: r.details,
      }, r.details && r.details.object_key)),
    };
  },
});
