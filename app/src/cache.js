const { createClient } = require('redis');

const enabled = process.env.CACHE_ENABLED !== 'false' && !!process.env.REDIS_URL;
const TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 45);

const inflight = new Map();
let client = null;
if (enabled) {
  client = createClient({
    url: process.env.REDIS_URL,
    socket: { connectTimeout: 2000, reconnectStrategy: (n) => Math.min(n * 200, 2000) },
  });
  client.on('error', (err) => console.error('redis:', err.message));
  client.connect().catch(() => {});
}

async function cached(key, load, res) {
  if (client && client.isReady) {
    try {
      const hit = await client.get(key);
      if (hit !== null) {
        res.set('X-Cache', 'HIT');
        return JSON.parse(hit);
      }
    } catch (err) {
      console.error('cache get failed:', err.message);
    }
  }
  let pending = inflight.get(key);
  const leader = !pending;
  if (leader) {
    pending = load();
    inflight.set(key, pending);
  }
  let value;
  try {
    value = await pending;
  } finally {
    if (leader) inflight.delete(key);
  }
  res.set('X-Cache', client ? 'MISS' : 'OFF');
  if (leader && client && client.isReady && value !== undefined) {
    client.set(key, JSON.stringify(value), { EX: TTL_SECONDS }).catch(() => {});
  }
  return value;
}

const IDEM_TTL_SECONDS = 24 * 60 * 60;
const IDEM_LOCK_SECONDS = 60;

async function idemBegin(key, fp) {
  if (!client || !client.isReady) return { state: 'new' };
  const lock = JSON.stringify({ fp, state: 'processing' });
  const ok = await client.set(key, lock, { NX: true, EX: IDEM_LOCK_SECONDS });
  if (ok) return { state: 'new' };
  const raw = await client.get(key);
  if (raw === null) return { state: 'new' };
  const saved = JSON.parse(raw);
  if (saved.fp !== fp) return { state: 'mismatch' };
  if (saved.state === 'processing') return { state: 'busy' };
  return { state: 'replay', status: saved.status, body: saved.body };
}

async function idemFinish(key, fp, status, body) {
  if (!client || !client.isReady) return;
  await client.set(key, JSON.stringify({ fp, state: 'done', status, body }), { EX: IDEM_TTL_SECONDS });
}

async function idemAbort(key) {
  if (!client || !client.isReady) return;
  await client.del(key).catch(() => {});
}

async function close() {
  if (client) await client.quit().catch(() => {});
}

module.exports = { cached, close, TTL_SECONDS, idemBegin, idemFinish, idemAbort };
