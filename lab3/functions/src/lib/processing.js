const { SENSOR_TYPES, validateMeasurement } = require('./validate');
const { getPool, ensureSchema } = require('./db');
const nosql = require('./nosql');
const media = require('./media');
const { MAX_IMAGE_BYTES } = require('./validate');

const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

const RULES = {
  temperature: {
    min: -50,
    max: 80,
    maxJump: 5,
    enrich: (v) => ({ value_f: round(v * 9 / 5 + 32) }),
  },
  humidity: {
    min: 0,
    max: 100,
    maxJump: 20,
    enrich: (v) => ({ comfort: v < 30 ? 'dry' : v > 60 ? 'humid' : 'comfortable' }),
  },
  light: {
    min: 0,
    max: 100000,
    maxJump: 5000,
    enrich: (v) => ({ category: v < 10 ? 'dark' : v < 500 ? 'dim' : v < 10000 ? 'indoor' : 'bright' }),
  },
  camera: {
    min: 1,
    max: MAX_IMAGE_BYTES,
    maxJump: Infinity,
    enrich: () => ({}),
  },
};

function analyse(m, previous, extra = {}) {
  const rule = RULES[m.sensor_type];
  const reasons = [...(extra.reasons || [])];
  if (m.value < rule.min || m.value > rule.max) reasons.push('out_of_range');
  let deviation = null;
  if (previous !== null) {
    deviation = round(m.value - previous);
    if (Math.abs(deviation) > rule.maxJump) reasons.push('sudden_jump');
  }
  return {
    deviation,
    isAnomaly: reasons.length > 0,
    reason: reasons.length ? reasons.join(',') : null,
    details: { ...rule.enrich(m.value), ...(extra.details || {}) },
  };
}

async function processMeasurement(message) {
  if (!message || typeof message !== 'object') throw new Error('message body is not an object');
  if (!SENSOR_TYPES.includes(message.sensor_type)) throw new Error(`unsupported sensor_type: ${message.sensor_type}`);
  const invalid = validateMeasurement(message);
  if (invalid) throw new Error(`invalid measurement: ${invalid}`);

  const extra = {};
  if (message.sensor_type === 'camera') {
    const size = await media.objectSize(message.object_key);
    extra.details = { object_key: message.object_key, stored_bytes: size };
    if (size === null) extra.reasons = ['object_missing'];
    else if (size !== message.value) extra.reasons = ['size_mismatch'];
  }

  await ensureSchema();
  if (nosql.enabled()) await nosql.saveRaw(message);
  const client = await getPool().connect();
  try {
    const { rows: [prev] } = await client.query(
      `SELECT value FROM measurements
       WHERE sensor_id = $1 AND measured_at < $2
       ORDER BY measured_at DESC LIMIT 1`,
      [message.sensor_id, message.measured_at]
    );
    const result = analyse(message, message.sensor_type === 'camera' ? null : (prev ? prev.value : null), extra);
    const { rowCount } = await client.query(
      `INSERT INTO measurements
         (sensor_id, measured_at, sensor_type, value, unit, lat, lon, deviation, is_anomaly, anomaly_reason, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (sensor_id, measured_at) DO NOTHING`,
      [message.sensor_id, message.measured_at, message.sensor_type, message.value, message.unit,
       message.location.lat, message.location.lon, result.deviation, result.isAnomaly, result.reason,
       JSON.stringify(result.details)]
    );
    return { inserted: rowCount === 1, anomaly: result.isAnomaly };
  } finally {
    client.release();
  }
}

module.exports = { processMeasurement, analyse, RULES };
