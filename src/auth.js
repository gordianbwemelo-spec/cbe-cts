const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { repo } = require('./store');

// JWT signing secret. Priority: explicit env var → persisted random secret on
// disk → freshly generated & saved. Production never runs on a well-known
// default, yet the operator needs no configuration to be secure.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(DATA_DIR, '.jwt_secret');
  try {
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const s = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(f, s, { mode: 0o600 });
    return s;
  } catch (e) {
    return crypto.randomBytes(48).toString('hex'); // read-only FS fallback
  }
}
const SECRET = resolveSecret();
const SECURE_COOKIES = process.env.SECURE_COOKIES === '1' || String(process.env.NODE_ENV).toLowerCase() === 'production';
const COOKIE = 'cbe_cts_token';

function issue(res, user) {
  const token = jwt.sign({ uid: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '12h' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, maxAge: 12 * 3600 * 1000 });
}
function clear(res) { res.clearCookie(COOKIE); }

function login(email, password) {
  const u = repo.getUserByEmail(email);
  if (!u) return null;
  if (!bcrypt.compareSync(password || '', u.password_hash)) return null;
  return u;
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'not authenticated' });
  try {
    const p = jwt.verify(token, SECRET);
    const u = repo.getUserById(p.uid);
    if (!u) return res.status(401).json({ error: 'session invalid' });
    req.user = { id: u.id, name: u.name, email: u.email, role: u.role, must_reset: !!u.must_reset };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'session expired' });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: 'forbidden for your role' });
    next();
  };
}

module.exports = { issue, clear, login, requireAuth, requireRole, COOKIE, SECRET };
