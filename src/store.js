// Pure-JavaScript persistent store (no native modules, installs anywhere).
// Data is held in memory and saved atomically to data/db.json on every change.
//
// MODEL: a curriculum (programme + NTA level) is defined ONCE nationally — its
// approval/validation letter, validity date, review workflow and document library
// are shared. Each of the four campuses then has its own per-campus status:
// whether it is OFFERED there, whether the department is RECOGNISED, whether the
// campus holds a STAMPED copy, and its IMPLEMENTATION/enrolment status. Dar es
// Salaam offers the full set; other campuses offer subsets.

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DEMO = process.env.CTS_DEMO === '1' || String(process.env.CTS_DEMO).toLowerCase() === 'true';
// OPEN access: key players click their role to enter, no password. Administrator
// still uses a password so the data cannot be wiped by a casual visitor.
const OPEN = process.env.CTS_OPEN === '1' || String(process.env.CTS_OPEN).toLowerCase() === 'true';

const DEFAULT_DEPARTMENTS = ['Accountancy', 'Business Administration', 'Education', 'ICT & Mathematics', 'Marketing', 'Procurement & Supplies Management', 'LIM'];
const CAMPUSES = ['Dar es Salaam', 'Dodoma', 'Mbeya', 'Mwanza'];
const DEFAULT_SETTINGS = { leadMonths: 8, recipientEmails: '', recipientPhones: '', channels: { dashboard: true, email: true, sms: true, voice: false } };
const NTA_LEVELS = [4, 5, 6, 7, 8, 9];

function parseNtaString(s) {
  const out = new Set();
  String(s || '').replace(/[–—]/g, '-').split(',').forEach(tok => {
    tok = tok.trim(); if (!tok) return;
    const m = tok.match(/^(\d)\s*-\s*(\d)$/);
    if (m) { for (let n = +m[1]; n <= +m[2]; n++) if (NTA_LEVELS.includes(n)) out.add(n); }
    else { const n = parseInt(tok); if (NTA_LEVELS.includes(n)) out.add(n); }
  });
  return [...out].sort((a, b) => a - b);
}
// Curriculum development / validation lifecycle stages, in order.
// Development / validation lifecycle for a NEW programme, in order. A programme moves
// down this list until it is Currently implemented.
const STAGES = [
  'Under development',
  'Undergoing validation',
  'Incorporating NACTVET validation committee comments',
  'Post-validation',
  'Ready for implementation – awaiting departmental recognition',
  'Currently implemented'
];
// Map the earlier stage names onto the current ones, so an existing database upgrades cleanly.
const STAGE_MIGRATION = {
  'Pre-validation': 'Under development',
  'Incorporation of validation committee comments': 'Incorporating NACTVET validation committee comments',
  'Post-validation': 'Post-validation',
  'Validated – awaiting departmental recognition': 'Ready for implementation – awaiting departmental recognition',
  'Currently implemented': 'Currently implemented'
};
function deriveStage(observed) {
  const o = String(observed || '');
  if (/implemented/i.test(o)) return 'Currently implemented';
  if (/ready for implementation|awaiting/i.test(o)) return 'Ready for implementation – awaiting departmental recognition';
  return 'Under development';
}
// A blank per-campus record = not offered at that campus.
function emptyCampus() { return { offered: false, recognition: 'Missing', stamped: 'Missing', observed: 'Not offered' }; }
function campusMap(partial) {
  const m = {};
  CAMPUSES.forEach(c => { m[c] = Object.assign(emptyCampus(), (partial && partial[c]) || {}); });
  return m;
}

let data;
function load() {
  if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!data.lists) data.lists = { departments: DEFAULT_DEPARTMENTS.slice(), campuses: CAMPUSES.slice() };
    // Merge any newly-introduced standard departments (e.g. Education) into an existing database.
    let _deptAdded = false;
    DEFAULT_DEPARTMENTS.forEach(d => { if (!data.lists.departments.some(x => String(x).toLowerCase() === d.toLowerCase())) { data.lists.departments.push(d); _deptAdded = true; } });
    if (_deptAdded) data.lists.departments.sort((a, b) => a.localeCompare(b));
    // Upgrade any earlier development-stage names to the current lifecycle labels.
    let _stageChanged = false;
    (data.curricula || []).forEach(c => {
      if (STAGE_MIGRATION[c.stage] && STAGE_MIGRATION[c.stage] !== c.stage) { c.stage = STAGE_MIGRATION[c.stage]; _stageChanged = true; }
      else if (c.stage && !STAGES.includes(c.stage)) { c.stage = deriveStage(c.observed); _stageChanged = true; }
    });
    if (_stageChanged) save();
    if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
    if (!data.notifications) data.notifications = [];
    ensureCoreUsers();
    ensureModel();
    return;
  }
  data = {
    seq: {}, users: [], curricula: [], notifications: [], audit: [],
    lists: { departments: DEFAULT_DEPARTMENTS.slice(), campuses: CAMPUSES.slice() },
    settings: { ...DEFAULT_SETTINGS }
  };
  seed();
  ensureModel();
  save();
}
// Upgrade older records: split clustered levels, and convert a flat single-campus
// record (top-level campus/recognition/stamped) into the per-campus map.
function ensureModel() {
  let changed = false;
  const out = [];
  (data.curricula || []).forEach(c => {
    // split clustered NTA levels
    let levels;
    if (typeof c.nta === 'number') levels = [c.nta];
    else if (Array.isArray(c.nta) && c.nta.length) levels = c.nta.map(Number);
    else levels = parseNtaString(c.levels); if (!levels.length) levels = [null];
    levels.forEach((lvl, i) => {
      const copy = i === 0 ? c : JSON.parse(JSON.stringify(c));
      copy.nta = lvl; copy.levels = lvl == null ? '' : String(lvl);
      if (i > 0) copy.id = nextId('curricula');
      if (!copy.campuses) {
        const home = copy.campus || 'Dar es Salaam';
        copy.campuses = campusMap({ [home]: { offered: true, recognition: copy.recognition || 'Available', stamped: copy.stamped || 'Available', observed: copy.observed || 'Currently implemented' } });
        delete copy.campus; delete copy.recognition; delete copy.stamped;
        changed = true;
      }
      if (!Array.isArray(copy.documents)) copy.documents = [];
      if (!copy.stage) { copy.stage = deriveStage(copy.observed); changed = true; }
      out.push(copy);
    });
    if (levels.length > 1) changed = true;
  });
  data.curricula = out;
  if (changed) save();
}
function save() { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, FILE); }
function nextId(coll) { data.seq[coll] = (data.seq[coll] || 0) + 1; return data.seq[coll]; }
function now() { return new Date().toISOString(); }
function today() { return new Date().toISOString().slice(0, 10); }
function audit(actor, action, entity, detail) { data.audit.push({ id: nextId('audit'), actor: actor || 'system', action, entity: entity || '', detail: detail || '', at: now() }); save(); }

const CORE_ACCOUNTS = [
  ['Administrator', 'admin@cbe.ac.tz', 'admin123', 'admin'],
  ['Director of Academics', 'director@cbe.ac.tz', 'director123', 'director'],
  ['Quality Assurance Manager', 'qam@cbe.ac.tz', 'qam123', 'qam'],
  ['Curriculum Coordinator', 'coordinator@cbe.ac.tz', 'coord123', 'coordinator'],
  ['Management', 'management@cbe.ac.tz', 'mgmt123', 'management'],
];
function ensureCoreUsers() {
  let changed = false;
  CORE_ACCOUNTS.forEach(([name, email, pw, role]) => {
    if (!data.users.some(u => u.email === email)) {
      data.users.push({ id: nextId('users'), name, email, password_hash: bcrypt.hashSync(pw, 10), role, active: 1, must_reset: (DEMO || OPEN) ? 0 : 1, created_at: now() });
      changed = true;
    }
  });
  if (changed) save();
}

// ---------------- demo seed ----------------
// national: validation (approval letter), valid_until, observed (national note), notes.
// dar: recognition + stamped + observed (implementation at Dar).
// offered: additional campuses that offer it, with per-campus overrides.
const DEMO_PROGRAMMES = [
 { programme:"Accountancy", department:"Accountancy", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2027-11-10",observed:"Currently implemented"}, offered:{ Dodoma:{}, Mbeya:{}, Mwanza:{recognition:"Missing",stamped:"Missing",observed:"Offered pending departmental recognition"} } },
 { programme:"Accounting and Finance", department:"Accountancy", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2026-07-28",observed:"Currently implemented"}, over:{6:{stamped:"Missing"},7:{stamped:"Missing"}}, offered:{ Dodoma:{}, Mbeya:{recognition:"Missing",stamped:"Missing",observed:"Offered pending departmental recognition"} } },
 { programme:"Banking and Finance", department:"Accountancy", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2026-04-29",observed:"Currently implemented"}, over:{7:{stamped:"Missing"}} },
 { programme:"MBA – Finance and Banking", department:"Business Administration", levels:[9], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2023-09-27",observed:"Currently implemented though expired",notes:"Review overdue."} },
 { programme:"Economics and Finance", department:"Accountancy", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Missing",valid_until:"2026-04-29",observed:"Currently implemented"}, over:{
     4:{validation:"Missing",valid_until:"",observed:"Admitting students (76 applicants confirmed at NTA 4)",notes:"No approval letter, stamped copy or validity date."},
     5:{validation:"Missing",valid_until:"",observed:"Not yet verified",notes:"No approval letter, stamped copy or validity date."},
     6:{validation:"Missing",valid_until:"",observed:"Not yet verified",notes:"No approval letter, stamped copy or validity date."}} },
 { programme:"Accounting and Taxation", department:"Accountancy", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2026-07-28",observed:"Currently implemented"} },
 { programme:"Business Administration", department:"Business Administration", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2027-11-10",observed:"Currently implemented"}, offered:{ Dodoma:{}, Mbeya:{}, Mwanza:{} } },
 { programme:"BA – Retail and Account Management (BA-RAM)", department:"Business Administration", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2026-04-30",observed:"Currently implemented"} },
 { programme:"BA – Human Resource Management (BA-HRM)", department:"Business Administration", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2026-04-30",observed:"Currently implemented"}, offered:{ Dodoma:{}, Mbeya:{recognition:"Missing",stamped:"Missing",observed:"Offered pending departmental recognition"} } },
 { programme:"MBA – Human Resource Management", department:"Business Administration", levels:[9], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2023-09-27",observed:"Currently implemented though expired",notes:"Review overdue."} },
 { programme:"BA in Leadership and Governance", department:"Business Administration", levels:[9], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2028-02-03",observed:"Ready for implementation",notes:"Departmental recognition granted 7 Aug 2025."} },
 { programme:"Business Administration (Double Degree)", department:"Business Administration", levels:[7,8], base:{validation:"Missing",recognition:"Available",stamped:"Subject to approval",valid_until:"",observed:"Ready for implementation",notes:"Departmental recognition granted 7 Aug 2025; awaiting approval letter."} },
 { programme:"Entrepreneurship and Innovation", department:"Business Administration", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2025-11-01",observed:"No enrolled students"}, over:{7:{observed:"Currently implemented"}} },
 { programme:"International Business Management", department:"Business Administration", levels:[9], base:{validation:"Missing",recognition:"Available",stamped:"Missing",valid_until:"",observed:"Currently implemented though no validation documents",notes:"No validation documents on file."} },
 { programme:"Project Management, Monitoring and Evaluation", department:"Business Administration", levels:[9], base:{validation:"Available",recognition:"Available",stamped:"Missing",valid_until:"2026-04-30",observed:"Currently implemented"} },
 { programme:"ICT", department:"ICT & Mathematics", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2027-11-10",observed:"Currently implemented"}, offered:{ Dodoma:{}, Mwanza:{recognition:"Missing",stamped:"Missing",observed:"Offered pending departmental recognition"} } },
 { programme:"Digital and Technologies Solutions Management – Apprenticeship", department:"ICT & Mathematics", levels:[7,8], base:{validation:"Missing",recognition:"Available",stamped:"Missing",valid_until:"",observed:"Ready for implementation",notes:"Departmental recognition granted 7 Aug 2025."} },
 { programme:"IT – Project Management", department:"ICT & Mathematics", levels:[9], base:{validation:"Available",recognition:"Available",stamped:"Missing",valid_until:"2026-07-29",observed:"Currently implemented"} },
 { programme:"ICT4D", department:"ICT & Mathematics", levels:[9], base:{validation:"Missing",recognition:"Available",stamped:"Missing",valid_until:"",observed:"No student enrolled"} },
 { programme:"Business Informatics", department:"ICT & Mathematics", levels:[9], base:{validation:"Missing",recognition:"Available",stamped:"Missing",valid_until:"",observed:"No student enrolled"} },
 { programme:"Marketing", department:"Marketing", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2027-11-10",observed:"Currently implemented"}, offered:{ Dodoma:{}, Mbeya:{recognition:"Missing",stamped:"Missing",observed:"Offered pending departmental recognition"} } },
 { programme:"Digital Marketing", department:"Marketing", levels:[4,5,6], base:{validation:"Missing",recognition:"Missing",stamped:"Missing",valid_until:"",observed:"No student enrolled; admission in progress"}, over:{6:{observed:"No student enrolled"}} },
 { programme:"Marketing in Tourism & Events Management", department:"Marketing", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2025-05-07",observed:"Currently implemented though expired",notes:"Review overdue."} },
 { programme:"MBA – Marketing", department:"Business Administration", levels:[9], base:{validation:"Available",recognition:"Available",stamped:"Missing",valid_until:"2023-04-11",observed:"Currently implemented though expired",notes:"Review overdue."} },
 { programme:"Procurement & Supplies Management", department:"Procurement & Supplies Management", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2027-11-10",observed:"Currently implemented"}, offered:{ Dodoma:{}, Mbeya:{}, Mwanza:{} } },
 { programme:"Transport and Logistics Management", department:"Procurement & Supplies Management", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2025-11-01",observed:"Currently implemented but about to expire"}, offered:{ Mbeya:{} } },
 { programme:"Supply Chain Management", department:"Procurement & Supplies Management", levels:[9], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2027-11-10",observed:"Currently implemented"} },
 { programme:"Metrology & Standardisation", department:"LIM", levels:[4,5,6,7,8], base:{validation:"Available",recognition:"Available",stamped:"Available",valid_until:"2027-11-10",observed:"Currently implemented"} },
 { programme:"Accountancy & Economics with Education", department:"LIM", levels:[7,8], base:{validation:"Available",recognition:"Available",stamped:"Missing",valid_until:"2028-08-11",observed:"Ready for implementation",notes:"Departmental recognition granted 7 Aug 2025; stamped copy missing."} },
 { programme:"Commerce & Accountancy with Education", department:"LIM", levels:[7,8], base:{validation:"Available",recognition:"Available",stamped:"Missing",valid_until:"2028-08-11",observed:"Ready for implementation",notes:"Departmental recognition granted 7 Aug 2025; stamped copy missing."} }
];
function seed() {
  ensureCoreUsers();
  // The College's programme list is loaded as the initial data in BOTH modes, so a
  // production deployment is ready for use with every programme already present and
  // can be updated where necessary. DEMO only affects account passwords and the
  // sample sign-in shortcuts on the login page.
  DEMO_PROGRAMMES.forEach(p => {
    p.levels.forEach(lvl => {
      const f = Object.assign({ validation:'Available', recognition:'Available', stamped:'Available', valid_until:'', observed:'', notes:'' }, p.base, (p.over && p.over[lvl]) || {});
      const campuses = campusMap({ 'Dar es Salaam': { offered:true, recognition:f.recognition, stamped:f.stamped, observed:f.observed } });
      if (p.offered) Object.keys(p.offered).forEach(cn => {
        campuses[cn] = Object.assign({ offered:true, recognition:'Available', stamped:'Available', observed:'Currently implemented' }, p.offered[cn]);
      });
      data.curricula.push({
        id: nextId('curricula'), programme: p.programme, department: p.department, nta: lvl, levels: String(lvl),
        validation: f.validation, valid_until: f.valid_until || '', observed: f.observed || '', notes: f.notes || '',
        stage: deriveStage(f.observed), campuses, review_started: '', reviewer: '', documents: [],
        updated_by: 'System (imported)', updated_at: '2025-09-01', created_at: now()
      });
    });
  });
  const offerings = data.curricula.reduce((s, c) => s + CAMPUSES.filter(cn => c.campuses[cn] && c.campuses[cn].offered).length, 0);
  console.log('Initialised database: ' + data.curricula.length + ' curricula across ' + DEMO_PROGRAMMES.length + ' programmes, ' + offerings + ' campus offerings' + (DEMO ? '  [DEMO/training mode]' : '  [PRODUCTION — accounts set their own password on first sign-in]') + '.');
}

load();

// ==================== repository API ====================
const repo = {
  getUserByEmail: (email) => data.users.find(u => u.email === (email || '').toLowerCase().trim() && u.active),
  getUserById: (id) => data.users.find(u => u.id === id && u.active),
  getCoreUserByRole: (role) => data.users.find(u => u.role === role && u.active),
  listUsers: () => data.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active })).sort((a, b) => (a.role + a.name).localeCompare(b.role + b.name)),
  createUser: ({ name, email, password, role }) => {
    email = (email || '').toLowerCase().trim();
    if (data.users.some(u => u.email === email)) throw new Error('A user with that email already exists');
    const u = { id: nextId('users'), name, email, password_hash: bcrypt.hashSync(password || 'changeme123', 10), role, active: 1, must_reset: 1, created_at: now() };
    data.users.push(u); save(); return u.id;
  },
  setUserActive(id, val) { const u = data.users.find(x => x.id === id); if (u) { u.active = val ? 1 : 0; save(); } },
  updateOwnCredentials(id, { email, password }) {
    const u = data.users.find(x => x.id === id); if (!u) throw new Error('user not found');
    if (email && email.toLowerCase().trim() !== u.email) {
      const e = email.toLowerCase().trim();
      if (data.users.some(x => x.email === e && x.id !== id)) throw new Error('That email is already in use');
      u.email = e;
    }
    u.password_hash = bcrypt.hashSync(password, 10); u.must_reset = 0; save();
  },

  lists() { return { departments: (data.lists.departments || []).slice(), campuses: (data.lists.campuses || CAMPUSES).slice() }; },
  campuses: () => CAMPUSES.slice(),
  addDepartment(name, actor) {
    name = String(name || '').trim();
    if (!name) return { error: 'Please enter a department name.' };
    if (data.lists.departments.some(p => p.toLowerCase() === name.toLowerCase())) return { error: 'A department with that name already exists.' };
    data.lists.departments.push(name); data.lists.departments.sort(); save();
    audit(actor, 'add-department', 'department', name);
    return { ok: true };
  },
  departmentCounts() {
    const counts = {};
    (data.lists.departments || []).forEach(d => { counts[d] = 0; });
    (data.curricula || []).forEach(c => { if (c.department) counts[c.department] = (counts[c.department] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => a.localeCompare(b)).map(name => ({ name, count: counts[name] }));
  },
  renameDepartment(from, to, actor) {
    from = String(from || '').trim(); to = String(to || '').trim();
    if (!from || !to) return { error: 'Both the current and the new department name are required.' };
    const list = data.lists.departments || (data.lists.departments = []);
    if (!list.some(d => d === from)) return { error: 'That department was not found.' };
    if (to.toLowerCase() !== from.toLowerCase() && list.some(d => d.toLowerCase() === to.toLowerCase()))
      return { error: 'A department named "' + to + '" already exists.' };
    for (let i = 0; i < list.length; i++) if (list[i] === from) list[i] = to;
    let changed = 0;
    (data.curricula || []).forEach(c => { if (c.department === from) { c.department = to; changed++; } });
    data.lists.departments = [...new Set(list)].sort((a, b) => a.localeCompare(b));
    save();
    audit(actor, 'rename-department', 'department', from + ' -> ' + to + ' (' + changed + ' curricula updated)');
    return { ok: true, changed };
  },
  removeDepartment(name, actor) {
    name = String(name || '').trim();
    if (!name) return { error: 'Please enter a department name.' };
    const inUse = (data.curricula || []).filter(c => c.department === name).length;
    if (inUse > 0) return { error: 'This department still has ' + inUse + ' curriculum record(s). Rename it, or move those records to another department first.' };
    const before = (data.lists.departments || []).length;
    data.lists.departments = (data.lists.departments || []).filter(d => d !== name);
    if (data.lists.departments.length === before) return { error: 'That department was not found.' };
    save();
    audit(actor, 'remove-department', 'department', name);
    return { ok: true };
  },
  addCampus(name) { name = String(name || '').trim(); if (!name) return; if (!data.lists.campuses.some(c => c.toLowerCase() === name.toLowerCase())) { data.lists.campuses.push(name); data.lists.campuses.sort(); save(); } },
  getSettings() { return JSON.parse(JSON.stringify(data.settings)); },
  saveSettings(s) {
    if (s.leadMonths !== undefined) data.settings.leadMonths = Math.max(1, Math.min(36, parseInt(s.leadMonths) || 8));
    if (s.recipientEmails !== undefined) data.settings.recipientEmails = String(s.recipientEmails);
    if (s.recipientPhones !== undefined) data.settings.recipientPhones = String(s.recipientPhones);
    if (s.channels) data.settings.channels = { ...data.settings.channels, ...s.channels };
    save(); return this.getSettings();
  },

  listCurricula: () => data.curricula.slice().sort((a, b) => a.programme.localeCompare(b.programme) || (a.nta - b.nta)),
  getCurriculum: (id) => data.curricula.find(c => c.id === id),
  createCurriculum(c, actor) {
    const id = nextId('curricula');
    const lvl = Array.isArray(c.nta) ? Number(c.nta[0]) : Number(c.nta);
    const rec = {
      id, programme: c.programme, department: c.department, nta: NTA_LEVELS.includes(lvl) ? lvl : (parseNtaString(c.levels)[0] || null),
      validation: c.validation || 'Available', valid_until: c.valid_until || '', observed: c.observed || '', notes: c.notes || '',
      stage: STAGES.includes(c.stage) ? c.stage : deriveStage(c.observed),
      campuses: c.campuses ? campusMap(c.campuses) : campusMap({ 'Dar es Salaam': { offered: true, recognition: 'Available', stamped: 'Available', observed: c.observed || 'Currently implemented' } }),
      review_started: '', reviewer: '', documents: [],
      updated_by: actor, updated_at: today(), created_at: now()
    };
    rec.levels = rec.nta == null ? '' : String(rec.nta);
    data.curricula.push(rec); save();
    audit(actor, 'create', 'curriculum#' + id, c.programme + ' NTA ' + rec.nta);
    return id;
  },
  updateCurriculum(id, fields, actor) {
    const c = this.getCurriculum(id); if (!c) throw new Error('not found');
    if (fields.nta !== undefined) { const lvl = Array.isArray(fields.nta) ? Number(fields.nta[0]) : Number(fields.nta); if (NTA_LEVELS.includes(lvl)) { c.nta = lvl; c.levels = String(lvl); } }
    ['programme', 'department', 'validation', 'valid_until', 'observed', 'notes', 'stage', 'review_started', 'reviewer']
      .forEach(k => { if (fields[k] !== undefined) c[k] = fields[k]; });
    if (fields.campuses) {
      CAMPUSES.forEach(cn => {
        if (fields.campuses[cn]) c.campuses[cn] = Object.assign(emptyCampus(), c.campuses[cn], fields.campuses[cn]);
      });
    }
    c.updated_by = actor; c.updated_at = today(); save();
    audit(actor, 'update', 'curriculum#' + id, c.programme + ' NTA ' + c.nta);
    return c;
  },
  deleteCurriculum(id, actor) {
    const i = data.curricula.findIndex(c => c.id === id); if (i < 0) throw new Error('not found');
    const removed = data.curricula.splice(i, 1)[0]; save();
    audit(actor, 'delete', 'curriculum#' + id, removed.programme + ' NTA ' + removed.nta); return removed.programme;
  },
  clearCurricula(actor) { const n = data.curricula.length; data.curricula = []; save(); audit(actor, 'clear-all', 'curricula', n + ' records removed'); return n; },

  addDocument(id, doc, actor) {
    const c = this.getCurriculum(id); if (!c) throw new Error('not found');
    if (!Array.isArray(c.documents)) c.documents = [];
    const did = nextId('documents_files');
    c.documents.push({ id: did, kind: doc.kind || 'Other', filename: doc.filename, original: doc.original, size: doc.size || 0, mime: doc.mime || '', by: actor, at: now() });
    c.updated_by = actor; c.updated_at = today(); save();
    audit(actor, 'upload', 'curriculum#' + id, (doc.kind || 'Document') + ': ' + doc.original); return did;
  },
  getDocument(id, docId) { const c = this.getCurriculum(id); if (!c) return null; return (c.documents || []).find(d => d.id === docId) || null; },
  deleteDocument(id, docId, actor) {
    const c = this.getCurriculum(id); if (!c) throw new Error('not found');
    const i = (c.documents || []).findIndex(d => d.id === docId); if (i < 0) throw new Error('document not found');
    const removed = c.documents.splice(i, 1)[0]; c.updated_by = actor; c.updated_at = today(); save();
    audit(actor, 'delete-doc', 'curriculum#' + id, removed.original); return removed;
  },

  addNotifications(items) { items.forEach(it => data.notifications.push({ id: nextId('notifications'), ...it, at: now() })); save(); },
  listNotifications: () => data.notifications.slice().sort((a, b) => b.id - a.id),
  clearNotifications() { data.notifications = []; save(); },
  listAudit: () => data.audit.slice().sort((a, b) => b.id - a.id).slice(0, 500),
};

module.exports = { repo, audit, CAMPUSES, STAGES };
