const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const { repo, audit, STAGES } = require('./src/store');
const auth = require('./src/auth');
const S = require('./src/status');
const notify = require('./src/notify');

const app = express();
const PORT = process.env.PORT || 3000;
const DEMO = process.env.CTS_DEMO === '1' || String(process.env.CTS_DEMO).toLowerCase() === 'true';
const UP_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, 'uploads');
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

const EDIT_ROLES = ['admin', 'director', 'qam', 'coordinator']; // management is view-only
const SETTINGS_ROLES = ['admin', 'director', 'qam'];

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1' || String(process.env.NODE_ENV).toLowerCase() === 'production') app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
  if (req.secure || String(process.env.NODE_ENV).toLowerCase() === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.use(express.json());
app.use(cookieParser());

// Lightweight in-memory brute-force guard for the login route.
const loginHits = new Map();
function loginLimiter(req, res, next) {
  const key = (req.ip || 'unknown') + '|' + String((req.body && req.body.email) || '').toLowerCase();
  const nowMs = Date.now();
  const rec = loginHits.get(key) || { count: 0, first: nowMs, blockedUntil: 0 };
  if (rec.blockedUntil && nowMs < rec.blockedUntil) return res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' });
  if (nowMs - rec.first > 15 * 60 * 1000) { rec.count = 0; rec.first = nowMs; rec.blockedUntil = 0; }
  req._loginRec = rec; req._loginKey = key;
  next();
}
// Max upload size (MB) is configurable — curriculum documents can be large.
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB) || 100;
const upload = multer({
  dest: UP_DIR,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|zip)$/i.test(file.originalname);
    cb(ok ? null : new Error('Allowed types: PDF, Word, Excel, PowerPoint, images, ZIP'), ok);
  }
});

// ---------------- helpers ----------------
function refOf(req) { return (req.query.ref && /^\d{4}-\d{2}-\d{2}$/.test(req.query.ref)) ? req.query.ref : new Date().toISOString().slice(0, 10); }
function leadOf(req) { const q = parseInt(req.query.lead); return (q >= 1 && q <= 36) ? q : (repo.getSettings().leadMonths || 8); }
function campusOf(req) { const c = req.query.campus; return (c && S.CAMPUSES.includes(c)) ? c : ''; } // '' = all campuses

// ---------------- public config ----------------
app.get('/api/config', (req, res) => res.json({ demo: DEMO, appName: 'CBE Curriculum Tracking System' }));

// ---------------- auth ----------------
app.post('/api/login', loginLimiter, (req, res) => {
  const u = auth.login(req.body.email, req.body.password);
  if (!u) {
    const rec = req._loginRec; rec.count++;
    if (rec.count >= 8) rec.blockedUntil = Date.now() + 60 * 1000;
    loginHits.set(req._loginKey, rec);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  loginHits.delete(req._loginKey);
  auth.issue(res, u);
  audit(u.email, 'login', 'user#' + u.id, '');
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, must_reset: !!u.must_reset } });
});
app.post('/api/logout', (req, res) => { auth.clear(res); res.json({ ok: true }); });
app.get('/api/me', auth.requireAuth, (req, res) => res.json({ user: req.user }));
app.post('/api/account', auth.requireAuth, (req, res) => {
  const { email, password } = req.body || {};
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    repo.updateOwnCredentials(req.user.id, { email, password });
    const u = repo.getUserById(req.user.id);
    auth.issue(res, u);
    res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, must_reset: false } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------------- meta ----------------
app.get('/api/meta', auth.requireAuth, (req, res) => {
  res.json({
    role: req.user.role,
    lists: repo.lists(),
    settings: repo.getSettings(),
    canEdit: EDIT_ROLES.includes(req.user.role),
    canSettings: SETTINGS_ROLES.includes(req.user.role),
    isAdmin: req.user.role === 'admin',
    emailEnabled: notify.EMAIL_ENABLED, smsEnabled: notify.SMS_ENABLED,
    maxUploadMb: MAX_UPLOAD_MB,
    ntaLevels: [4, 5, 6, 7, 8, 9],
    campuses: S.CAMPUSES,
    stages: STAGES
  });
});

// ---------------- dashboard ----------------
app.get('/api/dashboard', auth.requireAuth, (req, res) => {
  const ref = refOf(req), lead = leadOf(req), campus = campusOf(req);
  const list = repo.listCurricula();
  let rows, summary, alerts;
  if (campus) {
    rows = list.map(c => S.projectCampus(c, campus, ref, lead)).filter(r => r.offered);
    summary = S.summariseCampus(list, campus, ref, lead);
    alerts = S.actionRowsCampus(list, campus, ref, lead);
  } else {
    rows = list.map(c => S.enrich(c, ref, lead));
    summary = S.summarise(list, ref, lead);
    alerts = S.actionRowsNational(list, ref, lead);
  }
  const byStatusOrder = ['Valid', 'Due for review', 'Expired', 'Pending approval', 'Unverified'];
  const status = byStatusOrder.map(s => ({ status: s, n: rows.filter(r => r.status === s).length }));
  const depts = [...new Set(rows.map(r => r.department))].sort();
  const byDept = depts.map(d => {
    const sub = rows.filter(r => r.department === d);
    const o = { department: d, total: sub.length };
    byStatusOrder.forEach(s => o[s] = sub.filter(r => r.status === s).length);
    return o;
  });
  const years = {};
  rows.filter(r => r.valid_until).forEach(r => { const y = r.valid_until.slice(0, 4); years[y] = (years[y] || 0) + 1; });
  const timeline = Object.keys(years).sort().map(y => ({ year: y, n: years[y], past: parseInt(y) < parseInt(ref.slice(0, 4)) }));
  const programmes = new Set(rows.map(r => r.programme)).size;
  const departments = new Set(rows.map(r => r.department)).size;
  const byStage = STAGES.map(s => ({ stage: s, n: rows.filter(r => (r.stage || 'Pre-validation') === s).length }));
  res.json({ ref, lead, campus: campus || 'All campuses', campusList: S.CAMPUSES, summary, alerts, status, byDept, timeline, byStage, programmes, departments });
});

// ---------------- curricula ----------------
app.get('/api/curricula', auth.requireAuth, (req, res) => {
  const ref = refOf(req), lead = leadOf(req), campus = campusOf(req);
  let curricula;
  if (campus) curricula = repo.listCurricula().map(c => S.projectCampus(c, campus, ref, lead)).filter(r => r.offered);
  else curricula = repo.listCurricula().map(c => S.enrich(c, ref, lead));
  res.json({ ref, lead, campus: campus || 'All campuses', curricula });
});
app.get('/api/curricula/:id', auth.requireAuth, (req, res) => {
  const c = repo.getCurriculum(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'not found' });
  // Always return the full national record enriched, incl. every campus's status.
  res.json({ curriculum: S.enrich(c, refOf(req), leadOf(req)) });
});
app.post('/api/curricula', auth.requireAuth, auth.requireRole(...EDIT_ROLES), (req, res) => {
  try {
    if (!req.body.programme || !req.body.department) return res.status(400).json({ error: 'Programme and department are required.' });
    // Create one standalone curriculum record per selected NTA level.
    let levels = Array.isArray(req.body.nta) ? req.body.nta : (req.body.nta != null ? [req.body.nta] : []);
    levels = [...new Set(levels.map(Number))].filter(n => [4, 5, 6, 7, 8, 9].includes(n)).sort((a, b) => a - b);
    if (!levels.length) return res.status(400).json({ error: 'Select at least one NTA level.' });
    const ids = levels.map(lvl => repo.createCurriculum({ ...req.body, nta: lvl }, req.user.email));
    res.json({ ids, count: ids.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/curricula/:id', auth.requireAuth, auth.requireRole(...EDIT_ROLES), (req, res) => {
  try { res.json({ curriculum: repo.updateCurriculum(Number(req.params.id), req.body, req.user.email) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/curricula/:id/review', auth.requireAuth, auth.requireRole(...EDIT_ROLES), (req, res) => {
  try {
    const fields = {};
    if (req.body.stage !== undefined) fields.stage = req.body.stage;
    if (req.body.reviewer !== undefined) fields.reviewer = req.body.reviewer;
    if (req.body.review_started !== undefined) fields.review_started = req.body.review_started;
    res.json({ curriculum: repo.updateCurriculum(Number(req.params.id), fields, req.user.email) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/curricula/:id', auth.requireAuth, auth.requireRole(...EDIT_ROLES), (req, res) => {
  try { const name = repo.deleteCurriculum(Number(req.params.id), req.user.email); res.json({ ok: true, programme: name }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Danger zone: wipe ALL curriculum records (administrator only). Requires an
// explicit confirm flag so it cannot happen by accident.
app.post('/api/curricula/clear', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
  if (!req.body || req.body.confirm !== 'DELETE ALL') return res.status(400).json({ error: 'Confirmation phrase required.' });
  const n = repo.clearCurricula(req.user.email);
  res.json({ ok: true, removed: n });
});
// Upload a document to a curriculum's library (editing roles).
app.post('/api/curricula/:id/documents', auth.requireAuth, auth.requireRole(...EDIT_ROLES), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const did = repo.addDocument(Number(req.params.id), { kind: req.body.kind, filename: req.file.filename, original: req.file.originalname, size: req.file.size, mime: req.file.mimetype }, req.user.email);
    res.json({ ok: true, id: did });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Download a document — any signed-in key player (including view-only Management).
app.get('/api/curricula/:id/documents/:docId/download', auth.requireAuth, (req, res) => {
  const d = repo.getDocument(Number(req.params.id), Number(req.params.docId));
  if (!d) return res.status(404).json({ error: 'not found' });
  res.download(path.join(UP_DIR, d.filename), d.original);
});
// Remove a document (editing roles).
app.delete('/api/curricula/:id/documents/:docId', auth.requireAuth, auth.requireRole(...EDIT_ROLES), (req, res) => {
  try { repo.deleteDocument(Number(req.params.id), Number(req.params.docId), req.user.email); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------------- settings ----------------
app.get('/api/settings', auth.requireAuth, (req, res) => res.json(repo.getSettings()));
// Any editing role may adjust notification recipients/channels & lead time from
// the Notifications/Settings screens they can see; management stays view-only.
app.put('/api/settings', auth.requireAuth, auth.requireRole(...EDIT_ROLES), (req, res) => {
  const s = repo.saveSettings(req.body || {});
  audit(req.user.email, 'settings', '', JSON.stringify(req.body || {}));
  res.json(s);
});

// ---------------- notifications ----------------
app.post('/api/notifications/generate', auth.requireAuth, auth.requireRole(...EDIT_ROLES), async (req, res) => {
  const ref = refOf(req), lead = leadOf(req), campus = campusOf(req);
  const settings = repo.getSettings();
  const alerts = campus ? S.actionRowsCampus(repo.listCurricula(), campus, ref, lead) : S.actionRowsNational(repo.listCurricula(), ref, lead);
  const results = await notify.dispatch(alerts, settings);
  repo.addNotifications(results.map(r => ({ channel: r.channel, to: r.to, status: r.status, detail: r.detail, curriculum: r.curriculum, message: r.message, voice: !!r.voice })));
  audit(req.user.email, 'notify', '', alerts.length + ' alerts across enabled channels');
  res.json({ count: alerts.length, results });
});
app.get('/api/notifications', auth.requireAuth, (req, res) => res.json({ notifications: repo.listNotifications() }));
app.delete('/api/notifications', auth.requireAuth, auth.requireRole(...EDIT_ROLES), (req, res) => { repo.clearNotifications(); res.json({ ok: true }); });

// ---------------- reports ----------------
function reportRows(scope, dept, ref, lead, campus) {
  const base = repo.listCurricula();
  const rows = campus ? base.map(c => S.projectCampus(c, campus, ref, lead)).filter(r => r.offered)
                      : base.map(c => S.enrich(c, ref, lead));
  if (scope === 'action') return campus ? S.actionRowsCampus(base, campus, ref, lead) : S.actionRowsNational(base, ref, lead);
  if (scope === 'expired') return rows.filter(r => r.status === 'Expired');
  if (scope === 'due') return rows.filter(r => r.status === 'Due for review');
  if (scope === 'gaps') return rows.filter(r => r.docs === 'Incomplete');
  if (scope === 'recognition') return campus ? rows.filter(r => r.recognitionGap) : rows.filter(r => r.recognitionGapCount > 0);
  if (scope === 'dept') return rows.filter(r => r.department === dept);
  return rows;
}
app.get('/api/report', auth.requireAuth, (req, res) => {
  const ref = refOf(req), lead = leadOf(req), scope = req.query.scope || 'all', dept = req.query.dept || '', campus = campusOf(req);
  const summary = campus ? S.summariseCampus(repo.listCurricula(), campus, ref, lead) : S.summarise(repo.listCurricula(), ref, lead);
  res.json({ ref, lead, scope, dept, campus: campus || 'All campuses', summary, rows: reportRows(scope, dept, ref, lead, campus) });
});
app.get('/api/report.csv', auth.requireAuth, (req, res) => {
  const ref = refOf(req), lead = leadOf(req), scope = req.query.scope || 'all', dept = req.query.dept || '', campus = campusOf(req);
  const rows = reportRows(scope, dept, ref, lead, campus);
  const head = ['Programme', 'Department', 'NTA Level', 'Campus', 'Offered', 'Approval Letter', 'Departmental Recognition', 'Stamped Copy', 'Valid Until', 'Months Left', 'Status', 'Development Stage', 'Documents', 'Implementation', 'Notes', 'Updated By', 'Updated At'];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [head.join(',')].concat(rows.map(r => [
    r.programme, r.department, r.levels,
    campus || (r.offeredCampuses ? r.offeredCampuses.join('; ') : ''),
    campus ? (r.offered ? 'Yes' : 'No') : (r.offeredCount + ' campus(es)'),
    r.validation, r.recognition != null ? r.recognition : '(per campus)', r.stamped != null ? r.stamped : '(per campus)',
    r.valid_until, r.months_left == null ? '' : Math.round(r.months_left), r.status, r.stage || '', r.docs,
    campus ? (r.campusObserved || '') : (r.observed || ''), r.notes, r.updated_by, r.updated_at
  ].map(q).join(',')));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="CBE_curriculum_report.csv"');
  res.send(lines.join('\n'));
});

// ---------------- users / lists / audit ----------------
app.get('/api/users', auth.requireAuth, auth.requireRole('admin'), (req, res) => res.json({ users: repo.listUsers() }));
app.post('/api/users', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
  try { const id = repo.createUser(req.body); audit(req.user.email, 'create-user', 'user#' + id, req.body.email); res.json({ id }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/users/:id/active', auth.requireAuth, auth.requireRole('admin'), (req, res) => { repo.setUserActive(Number(req.params.id), req.body.active ? 1 : 0); res.json({ ok: true }); });

app.get('/api/lists', auth.requireAuth, (req, res) => res.json(repo.lists()));
app.post('/api/lists/department', auth.requireAuth, auth.requireRole(...SETTINGS_ROLES), (req, res) => { repo.addDepartment(req.body.name); res.json(repo.lists()); });
app.post('/api/lists/campus', auth.requireAuth, auth.requireRole(...SETTINGS_ROLES), (req, res) => { repo.addCampus(req.body.name); res.json(repo.lists()); });

app.get('/api/audit', auth.requireAuth, auth.requireRole('admin', 'director', 'qam'), (req, res) => res.json({ audit: repo.listAudit() }));

// ---------------- static & fallback ----------------
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use((req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, next) => { res.status(400).json({ error: err.message || 'error' }); });

app.listen(PORT, () => console.log('CBE Curriculum Tracking System running on http://localhost:' + PORT + (DEMO ? '  [DEMO/training mode]' : '  [PRODUCTION mode]')));
