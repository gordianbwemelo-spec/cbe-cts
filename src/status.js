// Curriculum status / expiry engine (server-side).
// National status (Valid/Due/Expired/Pending/Unverified) comes from the shared
// validity date + approval letter. Each campus adds its own picture: whether it is
// offered, whether the department is recognised, the stamped copy, and enrolment.

const CAMPUSES = ['Dar es Salaam', 'Dodoma', 'Mbeya', 'Mwanza'];

function parseD(s) { return s ? new Date(s + 'T00:00:00Z') : null; }
function monthsLeft(validUntil, refISO) {
  const d = parseD(validUntil); if (!d) return null;
  const ref = parseD(refISO) || new Date();
  return Math.round(((d - ref) / 86400000) / 30.44 * 10) / 10;
}
function statusOf(c, refISO, leadMonths) {
  const m = monthsLeft(c.valid_until, refISO);
  if (m === null) {
    if (/ready for implementation/i.test(c.observed || '')) return 'Pending approval';
    return 'Unverified';
  }
  if (m < 0) return 'Expired';
  if (m <= leadMonths) return 'Due for review';
  return 'Valid';
}
function recommendedAction(status, m, recognitionGap, campus, c) {
  const parts = [];
  const rec = c || {};
  const underReview = rec.track && rec.track !== 'stable' && rec.stage;
  if (status === 'Expired') {
    if (underReview) parts.push('Expired ~' + Math.abs(Math.round(m)) + ' month(s) ago; its review is under way — currently at ' + String(rec.stage).toLowerCase() + '.');
    else parts.push('Review overdue by ~' + Math.abs(Math.round(m)) + ' month(s) — initiate curriculum review immediately.');
  }
  else if (status === 'Due for review') {
    if (underReview) parts.push('Expires in ~' + Math.round(m) + ' month(s); its review is under way — currently at ' + String(rec.stage).toLowerCase() + '.');
    else parts.push('Expires in ~' + Math.round(m) + ' month(s) — begin the review process now.');
  }
  else if (status === 'Unverified') parts.push('Implemented without complete valid documents — obtain approval/stamped copy and set a validity date.');
  else if (status === 'Pending approval') parts.push('Awaiting approval documents before implementation.');
  if (recognitionGap) parts.push('Department not yet recognised to offer this programme at ' + campus + ' — obtain departmental recognition.');
  return parts.join(' ') || 'No action required.';
}
function offeredCampusesOf(c) { return CAMPUSES.filter(cn => c.campuses && c.campuses[cn] && c.campuses[cn].offered); }
function recognitionGapsOf(c) { return offeredCampusesOf(c).filter(cn => c.campuses[cn].recognition !== 'Available'); }

// National / all-campus enrichment (one row per curriculum).
function enrich(c, refISO, leadMonths) {
  const m = monthsLeft(c.valid_until, refISO);
  const status = statusOf(c, refISO, leadMonths);
  const offered = offeredCampusesOf(c);
  const recGaps = recognitionGapsOf(c);
  let action = recommendedAction(status, m, false, '', c);
  if (recGaps.length) action = (action === 'No action required.' ? '' : action + ' ') + 'Offered without departmental recognition at: ' + recGaps.join(', ') + '.';
  return Object.assign({}, c, {
    months_left: m, status,
    docs: c.validation === 'Available' ? 'Complete' : 'Incomplete',
    offeredCampuses: offered, offeredCount: offered.length,
    recognitionGaps: recGaps, recognitionGapCount: recGaps.length,
    action
  });
}
// Per-campus projection (one row per curriculum-at-a-campus).
function projectCampus(c, campus, refISO, leadMonths) {
  const co = (c.campuses && c.campuses[campus]) || { offered: false, recognition: 'Missing', stamped: 'Missing', observed: 'Not offered' };
  const m = monthsLeft(c.valid_until, refISO);
  const status = statusOf(c, refISO, leadMonths);
  const gaps = [];
  if (c.validation !== 'Available') gaps.push('approval letter ' + String(c.validation).toLowerCase());
  if (co.recognition !== 'Available') gaps.push('departmental recognition ' + String(co.recognition).toLowerCase());
  if (co.stamped === 'Missing' || co.stamped === 'Subject to approval') gaps.push('stamped copy ' + String(co.stamped).toLowerCase());
  else if (co.stamped === 'Partial') gaps.push('stamped copy partial');
  const recognitionGap = co.offered && co.recognition !== 'Available';
  return Object.assign({}, c, {
    campus, offered: co.offered, recognition: co.recognition, stamped: co.stamped, campusObserved: co.observed,
    months_left: m, status,
    docs: (c.validation === 'Available' && co.recognition === 'Available' && co.stamped === 'Available') ? 'Complete' : 'Incomplete',
    doc_gaps: gaps, recognitionGap,
    action: recommendedAction(status, m, recognitionGap, campus, c)
  });
}

// Action lists ------------------------------------------------------------
function actionRowsNational(list, refISO, leadMonths) {
  return list.map(c => enrich(c, refISO, leadMonths)).filter(r =>
    r.status === 'Expired' || r.status === 'Due for review' || (r.status === 'Unverified' && /implement/i.test(r.observed || '')) || r.recognitionGapCount > 0
  ).sort(sortByUrgency);
}
function actionRowsCampus(list, campus, refISO, leadMonths) {
  return list.map(c => projectCampus(c, campus, refISO, leadMonths)).filter(r => r.offered && (
    r.status === 'Expired' || r.status === 'Due for review' || r.recognitionGap || (r.status === 'Unverified' && /implement/i.test(r.campusObserved || ''))
  )).sort(sortByUrgency);
}
function sortByUrgency(a, b) {
  const rank = s => s === 'Expired' ? 0 : s === 'Due for review' ? 1 : 2;
  if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
  return (a.months_left == null ? 999 : a.months_left) - (b.months_left == null ? 999 : b.months_left);
}

// Summaries ---------------------------------------------------------------
function summarise(list, refISO, leadMonths) {
  const rows = list.map(c => enrich(c, refISO, leadMonths));
  const c = { total: rows.length, Valid: 0, 'Due for review': 0, Expired: 0, 'Pending approval': 0, Unverified: 0, gaps: 0, recognitionGaps: 0, offerings: 0 };
  rows.forEach(r => { c[r.status]++; if (r.docs === 'Incomplete') c.gaps++; c.recognitionGaps += r.recognitionGapCount; c.offerings += r.offeredCount; });
  return c;
}
function summariseCampus(list, campus, refISO, leadMonths) {
  const rows = list.map(c => projectCampus(c, campus, refISO, leadMonths)).filter(r => r.offered);
  const c = { total: rows.length, Valid: 0, 'Due for review': 0, Expired: 0, 'Pending approval': 0, Unverified: 0, gaps: 0, recognitionGaps: 0, offerings: rows.length };
  rows.forEach(r => { c[r.status]++; if (r.docs === 'Incomplete') c.gaps++; if (r.recognitionGap) c.recognitionGaps++; });
  return c;
}

module.exports = { enrich, projectCampus, statusOf, monthsLeft, actionRowsNational, actionRowsCampus, summarise, summariseCampus, offeredCampusesOf, recognitionGapsOf, CAMPUSES };
