const http = require('http');

const port = Number(process.env.PORT || 8080);
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error('API_KEY environment variable is required');
  process.exit(1);
}

const TYPES = ['temperature', 'humidity', 'light'];
const counts = { accepted: 0, rejected: 0, unauthorized: 0 };

function validate(b) {
  if (!b || typeof b !== 'object') return 'body must be a JSON object';
  if (typeof b.sensor_id !== 'string' || !b.sensor_id) return 'sensor_id must be a non-empty string';
  if (!TYPES.includes(b.sensor_type)) return `sensor_type must be one of ${TYPES.join(', ')}`;
  if (typeof b.value !== 'number' || !Number.isFinite(b.value)) return 'value must be a number';
  if (typeof b.unit !== 'string' || !b.unit) return 'unit must be a non-empty string';
  if (!b.location || typeof b.location.lat !== 'number' || typeof b.location.lon !== 'number') return 'location.lat and location.lon must be numbers';
  if (typeof b.measured_at !== 'string' || Number.isNaN(Date.parse(b.measured_at))) return 'measured_at must be an ISO 8601 string';
  return null;
}

http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/ingest') {
    res.writeHead(404).end();
    return;
  }
  if (req.headers['x-api-key'] !== apiKey) {
    counts.unauthorized++;
    res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid api key' }));
    return;
  }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch { body = null; }
    const err = validate(body);
    if (err) {
      counts.rejected++;
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: err }));
      return;
    }
    counts.accepted++;
    res.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ message_id: `${body.sensor_id}|${body.measured_at}` }));
  });
}).listen(port, () => console.log(`mock receiver on :${port}`));

setInterval(() => console.log(`accepted=${counts.accepted} rejected=${counts.rejected} unauthorized=${counts.unauthorized}`), 5000);
