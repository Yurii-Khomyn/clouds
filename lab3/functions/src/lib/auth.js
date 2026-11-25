const crypto = require('crypto');

function hasValidKey(request) {
  const expected = process.env.INGEST_API_KEY;
  const given = request.headers.get('x-api-key');
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { hasValidKey };
