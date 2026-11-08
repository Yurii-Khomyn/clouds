const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.error('JWT_SECRET is not set (min 16 chars)');
  process.exit(1);
}

const TOKEN_TTL = '1h';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function signToken(user) {
  return jwt.sign({ sub: String(user.id), name: user.name }, SECRET, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL,
  });
}

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'authentication required' });
  }
  try {
    const payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
    req.user = { id: Number(payload.sub), name: payload.name };
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

module.exports = { hashPassword, verifyPassword, signToken, requireAuth };
