const fs = require('fs');

const configFile = process.env.CONFIG_FILE || 'config.json';
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

const apiUrl = process.env.API_URL || config.api_url;
const apiKey = process.env.API_KEY;
const uploadEndpoint = process.env.UPLOAD_URL_ENDPOINT || config.upload_url_endpoint;
const camera = config.camera && config.camera.enabled && process.env.CAMERA !== 'off' ? config.camera : null;
const durationSeconds = Number(process.env.DURATION_SECONDS ?? config.duration_seconds ?? 0);
const maxInFlight = Number(config.max_in_flight_per_sensor || 50);

const SENSOR_TYPES = ['temperature', 'humidity', 'light'];
const MIN_INTERVAL_MS = 20;
const MAX_INTERVAL_MS = 100;

function fail(message) {
  console.error(`config error: ${message}`);
  process.exit(1);
}

if (!apiUrl) fail('api_url (or API_URL) is required');
if (!apiKey) fail('API_KEY environment variable is required');
if (!Array.isArray(config.sensors) || config.sensors.length === 0) fail('sensors list is empty');
for (const s of config.sensors) {
  if (!SENSOR_TYPES.includes(s.sensor_type)) fail(`${s.sensor_id}: unknown sensor_type ${s.sensor_type}`);
  if (!(s.interval_ms >= MIN_INTERVAL_MS && s.interval_ms <= MAX_INTERVAL_MS)) {
    fail(`${s.sensor_id}: interval_ms must be ${MIN_INTERVAL_MS}-${MAX_INTERVAL_MS}`);
  }
}

const stats = { sent: 0, errors: 0, dropped: 0, bySensor: {}, camera: { uploaded: 0, errors: 0 } };
for (const s of config.sensors) stats.bySensor[s.sensor_id] = { sent: 0, errors: 0 };
const errorSamples = [];

function nextValue(sensor, state) {
  const drift = (Math.random() - 0.5) * 2 * sensor.step;
  state.value = Math.min(sensor.max, Math.max(sensor.min, state.value + drift));
  let value = state.value;
  if (Math.random() < 0.005) {
    const spike = (sensor.max - sensor.min) * 0.4;
    value = Math.min(sensor.max, Math.max(sensor.min, value + (Math.random() < 0.5 ? -spike : spike)));
  }
  return Math.round(value * 100) / 100;
}

async function send(sensor, value) {
  const body = {
    sensor_id: sensor.sensor_id,
    sensor_type: sensor.sensor_type,
    value,
    unit: sensor.unit,
    location: sensor.location,
    measured_at: new Date().toISOString(),
  };
  const per = stats.bySensor[sensor.sensor_id];
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 202) {
      stats.sent++;
      per.sent++;
    } else {
      stats.errors++;
      per.errors++;
      if (errorSamples.length < 3) errorSamples.push(`${res.status} ${(await res.text()).slice(0, 160)}`);
    }
  } catch (err) {
    stats.errors++;
    per.errors++;
    if (errorSamples.length < 3) errorSamples.push(err.message);
  }
}

const timers = [];
for (const sensor of config.sensors) {
  const state = { value: sensor.start, inFlight: 0 };
  timers.push(setInterval(() => {
    if (state.inFlight >= maxInFlight) {
      stats.dropped++;
      return;
    }
    state.inFlight++;
    send(sensor, nextValue(sensor, state)).finally(() => { state.inFlight--; });
  }, sensor.interval_ms));
}

async function snapCamera(images) {
  const file = images[stats.camera.uploaded % images.length];
  const bytes = fs.readFileSync(file);
  try {
    const ticket = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ sensor_id: camera.sensor_id }),
      signal: AbortSignal.timeout(10000),
    });
    if (!ticket.ok) throw new Error(`upload-url ${ticket.status}`);
    const { upload_url, object_key, headers } = await ticket.json();

    const put = await fetch(upload_url, { method: 'PUT', headers, body: bytes, signal: AbortSignal.timeout(30000) });
    if (!put.ok) throw new Error(`blob PUT ${put.status}`);

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        sensor_id: camera.sensor_id,
        sensor_type: 'camera',
        value: bytes.length,
        unit: 'bytes',
        location: camera.location,
        measured_at: new Date().toISOString(),
        object_key,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status !== 202) throw new Error(`ingest ${res.status}`);
    stats.camera.uploaded++;
    console.log(`camera ${camera.sensor_id}: uploaded ${object_key} (${bytes.length} bytes)`);
  } catch (err) {
    stats.camera.errors++;
    if (errorSamples.length < 3) errorSamples.push(`camera: ${err.message}`);
  }
}

if (camera) {
  if (!uploadEndpoint) fail('upload_url_endpoint (or UPLOAD_URL_ENDPOINT) is required for the camera');
  if (!(camera.interval_seconds >= 10 && camera.interval_seconds <= 30)) fail('camera.interval_seconds must be 10-30');
  const dir = camera.images_dir || 'images';
  const images = fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).map((f) => `${dir}/${f}`);
  if (images.length === 0) fail(`no .jpg images in ${dir}`);
  const tick = () => snapCamera(images);
  tick();
  timers.push(setInterval(tick, camera.interval_seconds * 1000));
}

const started = Date.now();
function report(final) {
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const perSensor = Object.entries(stats.bySensor)
    .map(([id, v]) => `${id}=${v.sent}/${v.errors}`)
    .join(' ');
  const cam = camera ? ` camera=${stats.camera.uploaded}/${stats.camera.errors}` : '';
  console.log(`${final ? 'FINAL ' : ''}t=${seconds}s sent=${stats.sent} errors=${stats.errors} dropped=${stats.dropped} (sent/errors: ${perSensor}${cam})`);
  if (errorSamples.length && (final || stats.errors === errorSamples.length)) {
    console.log(`  error samples: ${errorSamples.join(' | ')}`);
  }
}

const reporter = setInterval(() => report(false), 5000);

function stop() {
  timers.forEach(clearInterval);
  clearInterval(reporter);
  setTimeout(() => { report(true); process.exit(stats.errors > 0 && stats.sent === 0 ? 1 : 0); }, 1500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
if (durationSeconds > 0) setTimeout(stop, durationSeconds * 1000);

console.log(`emulator started: ${config.sensors.length} sensors${camera ? ' + camera' : ''} -> ${apiUrl}`);
