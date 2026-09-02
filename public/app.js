/* CBE Curriculum Development, Review & Implementation Tracking System
   Front-end SPA (vanilla JS, no build step). Matches the CBE house style. */
const App = document.getElementById('app');
const state = { user:null, meta:null, view:'dashboard', ref:todayISO(), lead:8, campus:'', filters:{q:'',dept:'',status:'',stage:'',nta:''}, editId:null };

function todayISO(){ return new Date().toISOString().slice(0,10); }

/* ---------- api ---------- */
async function api(method, path, body, isForm){
  const opt = { method, credentials:'same-origin', headers:{} };
  if(body && !isForm){ opt.headers['Content-Type']='application/json'; opt.body=JSON.stringify(body); }
  if(isForm){ opt.body = body; }
  const r = await fetch('/api'+path, opt);
  const txt = await r.text();
  let data; try{ data=JSON.parse(txt); }catch(e){ data={error:txt}; }
  if(!r.ok) throw new Error(data.error||('HTTP '+r.status));
  return data;
}
function toast(m){ const t=document.getElementById('toast'); t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function qref(){ return '?ref='+state.ref+'&lead='+state.lead+(state.campus?'&campus='+encodeURIComponent(state.campus):''); }
function fmtDate(s){ if(!s) return '—'; const d=new Date(s+'T00:00:00'); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }

/* ---------- status helpers ---------- */
const ST_CLASS={ 'Valid':'st-valid','Due for review':'st-due','Expired':'st-expired','Pending approval':'st-pending','Unverified':'st-unverified' };
const ST_COLOR={ 'Valid':'#1f9d63','Due for review':'#e0a106','Expired':'#d1495b','Pending approval':'#0aa0e0','Unverified':'#e08a4a' };
function stPill(s){ return `<span class="pill ${ST_CLASS[s]||'b'}">${esc(s)}</span>`; }
const STAGE_COLOR={
  'Pre-validation':'#8a3ff0',
  'Incorporating NACTVET validation committee comments':'#0aa0e0',
  'Post-validation':'#e0a106',
  'Ready for implementation – awaiting departmental recognition':'#e08a4a'
};
const TRACK_LABEL={ stable:'Established (implemented)', 'new':'New programme (in development)', review:'Under review / re-validation' };
function stageLabelShort(s){
  if(s==='Incorporating NACTVET validation committee comments') return 'NACTVET committee comments';
  if(s==='Ready for implementation – awaiting departmental recognition') return 'Awaiting dept. recognition';
  return s;
}
// Stages that mean a development / validation initiative is ALREADY under way (i.e. not yet implemented).
// An expired curriculum at one of these stages is being addressed; only an expired
// A curriculum is "under way" (development or review) when its track is not 'stable'.
// An expired curriculum on a 'stable' track has no review started yet.
function reviewUnderway(r){ return !!(r && r.track && r.track!=='stable'); }
function stagePill(s){ if(!s) return `<span class="pill b">Not under review</span>`; const c=STAGE_COLOR[s]||'#657685'; return `<span class="pill" style="background:${c}22;color:${c};border:1px solid ${c}55" title="${esc(s||'')}">${esc(stageLabelShort(s))}</span>`; }
function trackBadge(t){ const map={ 'new':'#0b6aa8', review:'#946a06', stable:'#657685' }; const c=map[t]||'#657685'; return `<span class="pill" style="background:${c}18;color:${c};border:1px solid ${c}55">${esc(TRACK_LABEL[t]||t||'—')}</span>`; }
function stageOptionsFor(track,sel){ const list = track==='new' ? (state.meta.newStages||[]) : track==='review' ? (state.meta.reviewStages||[]) : []; return list.map(s=>`<option ${sel===s?'selected':''}>${esc(s)}</option>`).join(''); }
function trackStageControls(p, track, stage){
  track = track||'stable';
  const tOpt=[['stable',TRACK_LABEL.stable],['new',TRACK_LABEL['new']],['review',TRACK_LABEL.review]].map(([v,l])=>`<option value="${v}" ${track===v?'selected':''}>${esc(l)}</option>`).join('');
  return `<div class="fld"><label>Programme track</label><select id="${p}_track" onchange="onTrackChange('${p}')">${tOpt}</select></div>
    <div class="fld" id="${p}_stagewrap" style="${track==='stable'?'display:none':''}"><label>Development / validation stage</label><select id="${p}_stage">${stageOptionsFor(track,stage)}</select></div>`;
}
window.onTrackChange=(p)=>{
  const t=document.getElementById(p+'_track').value;
  const wrap=document.getElementById(p+'_stagewrap'); const sel=document.getElementById(p+'_stage');
  if(t==='stable'){ if(wrap) wrap.style.display='none'; if(sel) sel.innerHTML=''; }
  else { if(wrap) wrap.style.display=''; if(sel) sel.innerHTML=stageOptionsFor(t,''); }
};
function speak(text){
  if(!('speechSynthesis' in window)){ toast('Voice not supported in this browser'); return; }
  const u=new SpeechSynthesisUtterance(text); u.rate=0.98; speechSynthesis.speak(u);
}

/* ---------- boot ---------- */
async function boot(){
  try{ state.config = await api('GET','/config'); }catch(e){ state.config={demo:false}; }
  try{ const me=await api('GET','/me'); state.user=me.user; state.meta=await api('GET','/meta'); state.lead=state.meta.settings.leadMonths||8; await afterLogin(); }
  catch(e){ renderLogin(); }
}

/* ---------- login ---------- */
function renderLogin(err){
  if(state.config && state.config.open){
    App.innerHTML=`<div class="login-wrap"><div class="login-card">
      <img src="/assets/be.png" alt="CBE">
      <h1>Curriculum Tracking System</h1>
      <p class="sub">College of Business Education · Development, Review &amp; Implementation</p>
      <p class="note" style="text-align:center;margin:6px 0 14px;font-weight:700;color:var(--navy)">Select your role to continue</p>
      <div class="demo-accts" style="border:0;padding:0;margin:0">
        <button onclick="loginRole('management')">Management</button>
        <button onclick="loginRole('director')">Director of Academics</button>
        <button onclick="loginRole('qam')">Quality Assurance Manager</button>
        <button onclick="loginRole('coordinator')">Curriculum Coordinator</button>
      </div>
      <div class="login-err">${err?esc(err):''}</div>
      <div class="note" style="margin-top:16px;text-align:center"><a onclick="showAdmin()">System administrator sign-in</a></div>
      <div id="adminBox" style="display:none;margin-top:10px">
        <div class="fld"><label>Email</label><input id="email" type="email" placeholder="admin@cbe.ac.tz"></div>
        <div class="fld"><label>Password</label><input id="pw" type="password" placeholder="Password" onkeydown="if(event.key==='Enter')doLogin()"></div>
        <button onclick="doLogin()">Sign in</button>
      </div>
    </div></div>`;
    return;
  }
  App.innerHTML=`<div class="login-wrap"><div class="login-card">
    <img src="/assets/be.png" alt="CBE">
    <h1>Curriculum Tracking System</h1>
    <p class="sub">College of Business Education · Development, Review &amp; Implementation</p>
    <div class="fld"><label>Email</label><input id="email" type="email" placeholder="you@cbe.ac.tz"></div>
    <div class="fld"><label>Password</label><input id="pw" type="password" placeholder="Password" onkeydown="if(event.key==='Enter')doLogin()"></div>
    <button onclick="doLogin()">Sign in</button>
    <div class="login-err">${err?esc(err):''}</div>
    ${(state.config&&state.config.demo)?`<div class="demo-accts"><b>Demo accounts</b> — click to fill:
      <button onclick="fill('management@cbe.ac.tz','mgmt123')">Management — management@cbe.ac.tz</button>
      <button onclick="fill('director@cbe.ac.tz','director123')">Director of Academics — director@cbe.ac.tz</button>
      <button onclick="fill('qam@cbe.ac.tz','qam123')">Quality Assurance Manager — qam@cbe.ac.tz</button>
      <button onclick="fill('coordinator@cbe.ac.tz','coord123')">Curriculum Coordinator — coordinator@cbe.ac.tz</button>
      <button onclick="fill('admin@cbe.ac.tz','admin123')">Administrator — admin@cbe.ac.tz</button>
    </div>`:`<div class="note" style="margin-top:14px">Use the sign-in details provided by the College. On your first sign-in you will be asked to set your own password.</div>`}
  </div></div>`;
}
window.fill=(e,p)=>{ document.getElementById('email').value=e; document.getElementById('pw').value=p; };
window.doLogin=async()=>{
  try{
    const email=document.getElementById('email').value, pw=document.getElementById('pw').value;
    const r=await api('POST','/login',{email,password:pw});
    state.user=r.user; state.meta=await api('GET','/meta'); state.lead=state.meta.settings.leadMonths||8; await afterLogin();
  }catch(e){ renderLogin(e.message); }
};
window.loginRole=async(role)=>{
  try{ const r=await api('POST','/login-role',{role}); state.user=r.user; state.meta=await api('GET','/meta'); state.lead=state.meta.settings.leadMonths||8; await afterLogin(); }
  catch(e){ renderLogin(e.message); }
};
window.showAdmin=()=>{ const b=document.getElementById('adminBox'); if(b){ b.style.display='block'; const e=document.getElementById('email'); if(e) e.focus(); } };
window.logout=async()=>{ await api('POST','/logout'); state.user=null; renderLogin(); };

function renderReset(){
  App.innerHTML=`<div class="login-wrap"><div class="login-card">
    <img src="/assets/be.png" alt="CBE">
    <h1>Set your sign-in details</h1>
    <p class="sub">Welcome, ${esc(state.user.name)}. For security, please set your own email and password before continuing.</p>
    <div class="fld"><label>Your email (used to sign in)</label><input id="r_email" type="email" value="${esc(state.user.email)}"></div>
    <div class="fld"><label>New password (at least 6 characters)</label><input id="r_pw" type="password"></div>
    <div class="fld"><label>Confirm new password</label><input id="r_pw2" type="password" onkeydown="if(event.key==='Enter')doReset()"></div>
    <button onclick="doReset()">Save and continue</button>
    <div class="login-err" id="r_err"></div>
  </div></div>`;
}
window.doReset=async()=>{
  const email=document.getElementById('r_email').value.trim();
  const pw=document.getElementById('r_pw').value, pw2=document.getElementById('r_pw2').value, err=document.getElementById('r_err');
  if(pw.length<6){ err.textContent='Password must be at least 6 characters.'; return; }
  if(pw!==pw2){ err.textContent='The two passwords do not match.'; return; }
  try{ const r=await api('POST','/account',{email,password:pw}); state.user=r.user; toast('Sign-in details saved'); await afterLogin(); }
  catch(e){ err.textContent=e.message; }
};

async function afterLogin(){
  if(state.user.must_reset){ renderReset(); return; }
  state.view='dashboard'; renderApp();
}

/* ---------- shell ---------- */
const ROLE_LABEL={ management:'Management', director:'Director of Academics', qam:'Quality Assurance Manager', coordinator:'Curriculum Coordinator', admin:'Administrator' };
function navItems(){
  const m=state.meta, items=[['dashboard','▤','Dashboard'],['exec','★','Executive Summary'],['register','▦','Curriculum Register'],['newprog','⚑','New Programmes'],['underreview','⟳','Under Review']];
  if(m.canEdit) items.push(['entry','＋','Add / Update']);
  if(m.canEdit) items.push(['notify','🔔','Notifications']);
  items.push(['reports','▣','Reports']);
  if(m.canSettings) items.push(['departments','▥','Departments']);
  if(m.canSettings) items.push(['settings','⚙','Settings']);
  if(m.canSettings) items.push(['audit','◷','Audit Log']);
  if(m.isAdmin) items.push(['users','◎','Users']);
  return items;
}
function renderApp(){
  const items=navItems();
  App.innerHTML=`<header class="top"><img class="logo" src="/assets/be.png">
    <div class="ttl"><b>Curriculum Development, Review &amp; Implementation Tracking System</b><span>College of Business Education (CBE)</span></div>
    <div class="right"><div class="who"><b>${esc(state.user.name)}</b><br>${esc(state.user.email)}</div>
      <span class="role-badge">${ROLE_LABEL[state.user.role]||state.user.role}</span>
      <button class="logout" onclick="logout()">Sign out</button></div></header>
    <div class="shell"><aside><div class="gl">${ROLE_LABEL[state.user.role]||''}</div>
      ${items.map(([v,ic,l])=>`<button class="${state.view===v?'active':''}" onclick="go('${v}')"><span class="ic">${ic}</span>${l}</button>`).join('')}
    </aside><main id="main"><div class="spin"></div></main></div>`;
  route();
}
window.go=(v)=>{ state.view=v; if(v!=='entry') state.editId=null; renderApp(); };
async function route(){
  const m=document.getElementById('main');
  try{
    if(state.view==='dashboard') return viewDashboard(m);
    if(state.view==='exec') return viewExec(m);
    if(state.view==='register') return viewRegister(m);
    if(state.view==='newprog') return viewNewProgrammes(m);
    if(state.view==='underreview') return viewUnderReview(m);
    if(state.view==='entry') return viewEntry(m);
    if(state.view==='detail') return viewDetail(m);
    if(state.view==='notify') return viewNotify(m);
    if(state.view==='reports') return viewReports(m);
    if(state.view==='departments') return viewDepartments(m);
    if(state.view==='settings') return viewSettings(m);
    if(state.view==='audit') return viewAudit(m);
    if(state.view==='users') return viewUsers(m);
  }catch(e){ m.innerHTML=`<div class="card">Error: ${esc(e.message)}</div>`; }
}
function controlBar(){
  const camps=(state.meta.campuses||['Dar es Salaam','Dodoma','Mbeya','Mwanza']);
  return `<div class="filters card" style="padding:12px 14px">
    <div class="fld"><label>Campus</label><select id="c_campus" onchange="setCampus(this.value)"><option value="">All campuses</option>${camps.map(c=>`<option ${state.campus===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="fld"><label>Assessment date</label><input type="date" id="c_ref" value="${state.ref}" onchange="setRef(this.value)"></div>
    <div class="fld"><label>Review lead time (months)</label><input type="number" min="1" max="36" id="c_lead" value="${state.lead}" style="width:90px" onchange="setLead(this.value)"></div>
    <div class="note" style="margin:0;align-self:center">${state.campus?`Showing curricula <b>offered at ${esc(state.campus)}</b>.`:`Showing <b>all campuses</b> (national view).`} Curricula within the lead window before expiry are flagged <b>Due for review</b>.</div>
  </div>`;
}
window.setRef=(v)=>{ state.ref=v||todayISO(); renderApp(); };
window.setLead=(v)=>{ state.lead=Math.max(1,Math.min(36,parseInt(v)||8)); renderApp(); };
window.setCampus=(v)=>{ state.campus=v||''; renderApp(); };

/* ---------- dashboard ---------- */
async function viewDashboard(m){
  const d=await api('GET','/dashboard'+qref());
  const s=d.summary;
  const totalLabel = state.campus?('Curricula at '+state.campus):'Total curricula';
  const kpis=[['k-total',totalLabel,s.total],['k-valid','Valid',s.Valid],['k-due','Due for review',s['Due for review']],
    ['k-expired','Expired',s.Expired],['k-gaps','Documentation gaps',s.gaps],['k-recog','Recognition gaps',s.recognitionGaps||0]];
  const alerts = d.alerts.length ? d.alerts.slice(0,12).map(r=>{
    const cls=r.status==='Expired'?'crit':r.status==='Due for review'?'warn':'ser';
    return `<div class="alert ${cls}"><div style="flex:1"><div class="title">${esc(r.programme)} <span class="pill b" style="font-weight:600">${esc(r.department)}</span></div>
      <div class="desc">NTA ${esc(r.levels)} · ${r.valid_until?('valid until '+fmtDate(r.valid_until)):'no validity date'} · <b>${esc(r.status)}</b></div>
      <div class="act">➜ ${esc(r.action)}</div></div>
      <button class="btn small ghost no-print" onclick="speak('${esc(r.programme).replace(/'/g,'')} is ${esc(r.status)}. ${esc(r.action).replace(/'/g,'')}')">🔊</button></div>`;
  }).join('') + (d.alerts.length>12?`<div class="note">…and ${d.alerts.length-12} more (see Curriculum Register).</div>`:'')
    : `<div class="note">No curricula require action for this assessment date and lead time. 🎉</div>`;

  m.innerHTML=`<h1 class="page">Dashboard</h1><p class="lead">Live status · <b>${esc(d.campus)}</b> · assessment date <b>${fmtDate(d.ref)}</b> · lead time <b>${d.lead} months</b>.</p>
    ${controlBar()}
    ${execSummaryPanel(d)}
    <div class="kpis6" style="margin-bottom:16px">${kpis.map(k=>`<div class="kpi ${k[0]}"><div class="top"></div><div class="lab">${k[1]}</div><div class="val">${k[2]}</div></div>`).join('')}</div>
    <div class="grid2">
      <div class="card"><h2>Curricula requiring action</h2><div class="sub">Expired, entering the review window, or implemented without valid documents — most urgent first.</div>${alerts}</div>
      <div class="card"><h2>Status distribution</h2><div class="sub">All records</div><div id="donut"></div></div>
    </div>
    <div class="card"><h2>Development &amp; review pipelines</h2><div class="sub">New programmes being developed, and existing curricula being reviewed — kept separate</div>
      <h3 style="margin:8px 0 6px;font-size:13px;color:var(--navy)">New programme development <span class="muted">(${(d.trackCounts&&d.trackCounts.newProgrammes)||0})</span></h3>${stagePipeline(d.byStageNew||[])}
      <h3 style="margin:16px 0 6px;font-size:13px;color:var(--navy)">Existing curricula under review / re-validation <span class="muted">(${(d.trackCounts&&d.trackCounts.underReview)||0})</span></h3>${stagePipeline(d.byStageReview||[])}</div>
    <div class="grid-eq">
      <div class="card"><h2>Status by department</h2><div class="sub">Stacked count per department</div>${deptChart(d.byDept,d.status)}</div>
      <div class="card"><h2>Expiry timeline</h2><div class="sub">When dated curricula reach end of validity</div>${timelineChart(d.timeline,d.ref)}</div>
    </div>`;
  drawDonut(d.status, s.total);
}
function execNarrative(d){
  const s=d.summary, ref=fmtDate(d.ref);
  const scope = (d.campus && d.campus!=='All campuses') ? d.campus+' campus' : 'the College';
  const campusScope = !!(d.campus && d.campus!=='All campuses');
  const b = x => `<b>${x}</b>`;
  // Split expired curricula into those already under review and those with no review started.
  const expired = d.alerts.filter(a=>a.status==='Expired');
  const notStarted = expired.filter(a=>!reviewUnderway(a));
  const inReview = expired.filter(a=>reviewUnderway(a));
  const parts=[];
  const campusClause = campusScope ? '' : ` in ${b((d.campusList||[]).length)} campuses`;
  parts.push(`As at ${b(ref)}, ${scope} is tracking ${b(s.total)} curricul${s.total===1?'um':'a'} across ${b(d.programmes)} programme${d.programmes!==1?'s':''} and ${b(d.departments)} department${d.departments!==1?'s':''}${campusClause}.`);

  const isAre = x => x===1?'is':'are';
  const hasHave = x => x===1?'has':'have';
  const validClause = s.Valid>0 ? `${b(s.Valid)} ${isAre(s.Valid)} valid` : 'none are valid';
  const dueClause = s['Due for review']>0 ? `${b(s['Due for review'])} ${isAre(s['Due for review'])} due for review within the next ${b(d.lead+' months')}` : `none are due for review within the next ${b(d.lead+' months')}`;
  const expClause = s.Expired>0 ? `${b(s.Expired)} ${hasHave(s.Expired)} expired` : 'none have expired';
  parts.push(`Of these, ${validClause}, ${dueClause}, and ${expClause}.`);

  const unvClause = s.Unverified>0 ? `${b(s.Unverified)} ${isAre(s.Unverified)} unverified or ${s.Unverified===1?'lacks':'lack'} valid documents` : 'No curricula are unverified or lacking valid documents';
  const gapsClause = s.gaps>0 ? `${b(s.gaps)} ${s.gaps===1?'curriculum has':'curricula have'} documentation gaps` : 'no curricula have documentation gaps';
  let recogClause;
  if(s.recognitionGaps>0){
    const one=s.recognitionGaps===1;
    recogClause = campusScope
      ? `${b(s.recognitionGaps)} ${one?'is':'are'} ready for implementation but awaiting departmental recognition here`
      : `${b(s.recognitionGaps)} campus offering${one?'':'s'} ${one?'is':'are'} ready for implementation but awaiting departmental recognition`;
  } else {
    recogClause = campusScope ? 'no programme here is awaiting departmental recognition' : 'no campus offerings are awaiting departmental recognition';
  }
  parts.push(`${unvClause}. As for documents and recognition, ${gapsClause}, and ${recogClause}.`);

  // Expired: report the current initiative rather than blanketing everything as "review immediately".
  if(notStarted.length){
    const one = notStarted.length===1;
    const top = notStarted.slice(0,3).map(a=>`${a.programme} (NTA ${a.levels})`);
    parts.push(`${b('Most urgent:')} ${b(notStarted.length)} expired ${one?'curriculum has':'curricula have'} no review under way and ${one?'requires':'require'} a review to be initiated immediately${top.length?`, including ${top.join(', ')}`:''}.`);
  }
  if(inReview.length){
    const grp={}; inReview.forEach(a=>{ const st=a.stage||'(stage not set)'; grp[st]=(grp[st]||0)+1; });
    const segs=Object.keys(grp).map(st=>`${grp[st]} at ${st.toLowerCase()}`);
    const one = inReview.length===1;
    parts.push(`A further ${b(inReview.length)} expired ${one?'curriculum is':'curricula are'} already under review (${segs.join('; ')}) and ${one?'is':'are'} being addressed — ${one?'it does':'they do'} not need a fresh review to be started.`);
  }
  if(!expired.length){
    if(s['Due for review']) parts.push(`${b('Action:')} ${b(s['Due for review'])} curricul${s['Due for review']===1?'um is':'a are'} within the review window — ${s['Due for review']===1?'a review':'reviews'} should be initiated now.`);
    else parts.push(`No curricula are currently overdue or within the review window.`);
  }
  return parts.join(' ');
}
function execSummaryPanel(d){
  return `<div class="card no-print" style="border-left:4px solid var(--brand)">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="flex:1;min-width:160px">Executive summary</h2>
      <button class="btn ghost small" onclick="speakExec()">🔊 Read aloud</button>
      <button class="btn ghost small" onclick="printExec()">🖨 Print</button></div>
    <div class="sub">Plain-language overview for management · ${fmtDate(d.ref)}</div>
    <p id="execText" style="font-size:17px;line-height:1.7;margin:0">${execNarrative(d)}</p>
  </div>`;
}
window.speakExec=()=>{ const t=document.getElementById('execText'); if(t) speak(t.textContent); };
window.printExec=()=>{
  const t=document.getElementById('execText'); if(!t) return;
  const w=window.open('','_blank');
  w.document.write('<html><head><title>CBE Curriculum — Executive Summary</title></head><body style="font-family:Tahoma,Geneva,Verdana,sans-serif;padding:36px;max-width:760px;color:#111"><h2 style="color:#0d3b66">College of Business Education</h2><h3 style="margin-top:0;color:#0d3b66">Curriculum Development, Review &amp; Implementation — Executive Summary</h3><p style="line-height:1.8;font-size:15px">'+t.innerHTML+'</p></body></html>');
  w.document.close(); setTimeout(()=>{ w.print(); }, 200);
};
/* ---------- executive summary (dedicated page) ---------- */
async function viewExec(m){
  const d=await api('GET','/dashboard'+qref());
  let gaps=[],recog=[]; try{ const g=await api('GET','/report'+qref()+'&scope=gaps'); gaps=g.rows||[]; }catch(e){}
  try{ const g=await api('GET','/report'+qref()+'&scope=recognition'); recog=g.rows||[]; }catch(e){}
  const s=d.summary;
  const expired=d.alerts.filter(a=>a.status==='Expired');
  const expiredNotStarted=expired.filter(a=>!reviewUnderway(a));
  const expiredInReview=expired.filter(a=>reviewUnderway(a));
  const due=d.alerts.filter(a=>a.status==='Due for review');
  const priorities=[];
  if(expiredNotStarted.length) priorities.push(`Initiate a curriculum review immediately for the <b>${expiredNotStarted.length}</b> expired ${expiredNotStarted.length===1?'curriculum':'curricula'} with no review under way.`);
  if(expiredInReview.length) priorities.push(`Progress to completion the <b>${expiredInReview.length}</b> expired ${expiredInReview.length===1?'curriculum':'curricula'} already under review, so they are re-validated without further delay.`);
  if(s['Due for review']) priorities.push(`Begin the review process for <b>${s['Due for review']}</b> curricula entering the ${d.lead}-month review window.`);
  if(s.recognitionGaps) priorities.push(`Grant departmental recognition to the <b>${s.recognitionGaps}</b> campus offering${s.recognitionGaps===1?'':'s'} that ${s.recognitionGaps===1?'is':'are'} ready for implementation but awaiting it.`);
  if(s.gaps) priorities.push(`Obtain the missing documents (approval letters / departmental recognition / stamped copies) for <b>${s.gaps}</b> curricula.`);
  if(s['Pending approval']) priorities.push(`Finalise approvals for <b>${s['Pending approval']}</b> curricula that are ready for implementation.`);
  priorities.push(`Ensure every curriculum's review starts at least <b>${d.lead} months</b> before its expiry date.`);
  const listBlock=(title,rows,fmt)=> rows.length?`<h3 style="margin:16px 0 6px;font-size:15px;color:var(--navy)">${title} (${rows.length})</h3><table class="tbl"><tbody>${rows.slice(0,10).map(fmt).join('')}</tbody></table>${rows.length>10?`<div class="note">…and ${rows.length-10} more.</div>`:''}`:'';
  m.innerHTML=`<div class="actions no-print" style="margin-top:0"><h1 class="page" style="flex:1">Executive Summary</h1>
      <button class="btn ghost small" onclick="speakExec()">🔊 Read aloud</button>
      <button class="btn primary small" onclick="window.print()">🖨 Print / PDF</button></div>
    <p class="lead no-print">A one-page overview for management and key players. Reflects the assessment date and review lead time set on the Dashboard.</p>
    ${controlBar()}
    <div class="card">
      <div class="official"><div class="oh"><img src="/assets/arms.png"><div class="c"><div class="l1">THE UNITED REPUBLIC OF TANZANIA</div><div class="l2">COLLEGE OF BUSINESS EDUCATION</div><div class="l3">Curriculum Development, Review &amp; Implementation — Executive Summary</div></div><img src="/assets/be.png"></div>
      <div class="ob">
        <table class="tbl" style="margin-bottom:14px"><tr><th style="width:180px">As at</th><td>${fmtDate(d.ref)}</td></tr><tr><th>Prepared by</th><td>${esc(state.user.name)} (${ROLE_LABEL[state.user.role]||state.user.role})</td></tr><tr><th>Review lead time</th><td>${d.lead} months before expiry</td></tr></table>
        <p id="execText" style="font-size:17px;line-height:1.8;margin:0 0 14px">${execNarrative(d)}</p>
        <div class="kpis" style="grid-template-columns:repeat(6,1fr)">
          ${[['Total',s.total],['Valid',s.Valid],['Due',s['Due for review']],['Expired',s.Expired],['Pending',s['Pending approval']],['Doc gaps',s.gaps]].map(k=>`<div class="kpi"><div class="lab">${k[0]}</div><div class="val">${k[1]}</div></div>`).join('')}
        </div>
        <h3 style="margin:18px 0 6px;font-size:15px;color:var(--navy)">Recommended priorities</h3>
        <ol style="margin:0;padding-left:20px;line-height:1.9">${priorities.map(p=>`<li>${p}</li>`).join('')}</ol>
        ${listBlock('Expired — review overdue',expired,r=>`<tr><td><b>${esc(r.programme)}</b> — NTA ${esc(r.levels)} <span class="muted">(${esc(r.department)})</span></td><td style="width:150px">${r.valid_until?('expired '+fmtDate(r.valid_until)):'no date'}</td></tr>`)}
        ${listBlock('Due for review within the lead window',due,r=>`<tr><td><b>${esc(r.programme)}</b> — NTA ${esc(r.levels)} <span class="muted">(${esc(r.department)})</span></td><td style="width:150px">expires ${fmtDate(r.valid_until)}</td></tr>`)}
        ${listBlock('Campus offerings without departmental recognition',recog,r=>`<tr><td><b>${esc(r.programme)}</b> — NTA ${esc(r.levels)} <span class="muted">(${esc(r.department)})</span></td><td style="width:220px">${esc((r.recognitionGaps&&r.recognitionGaps.join(', '))|| (r.campus||''))}</td></tr>`)}
        ${listBlock('Documentation gaps',gaps,r=>`<tr><td><b>${esc(r.programme)}</b> — NTA ${esc(r.levels)} <span class="muted">(${esc(r.department)})</span></td><td style="width:220px">${esc((r.doc_gaps||[]).join('; ')||'incomplete')}</td></tr>`)}
        <div class="note" style="margin-top:16px">Generated by the CBE Curriculum Tracking System. Source data: Curriculum Availability, Implementation and Validity Verification (Sept 2025).</div>
      </div></div>
    </div>`;
}
function drawDonut(status,total){
  const el=document.getElementById('donut'); if(!el) return;
  const data=status.filter(x=>x.n>0); const R=62,C=2*Math.PI*R; let acc=0;
  const segs=data.map(d=>{ const frac=d.n/(total||1),len=frac*C,off=acc*C; acc+=frac;
    return `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${ST_COLOR[d.status]}" stroke-width="24" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"></circle>`; }).join('');
  el.innerHTML=`<div style="display:flex;justify-content:center"><svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Status distribution">
    <circle r="${R}" cx="90" cy="90" fill="none" stroke="#eef3f7" stroke-width="24"></circle>${segs}
    <text x="90" y="84" text-anchor="middle" font-size="30" font-weight="800" fill="#0d2b45">${total}</text>
    <text x="90" y="104" text-anchor="middle" font-size="11" fill="#657685">curricula</text></svg></div>
    <div class="legend">${data.map(d=>`<span><span class="sw" style="background:${ST_COLOR[d.status]}"></span>${d.status} (${d.n})</span>`).join('')}</div>`;
}
function stagePipeline(byStage){
  if(!byStage.length) return '<div class="note">No data.</div>';
  const max=Math.max(...byStage.map(s=>s.n),1);
  return byStage.map(s=>{
    const c=STAGE_COLOR[s.stage]||'#657685';
    return `<div class="bar-row" style="grid-template-columns:290px 1fr 40px"><span title="${esc(s.stage)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.stage)}</span>
      <div class="bar-track"><div class="bar-seg" style="width:${s.n/max*100}%;background:${c};border:0"></div></div><span style="text-align:right;font-weight:700">${s.n}</span></div>`;
  }).join('');
}
function deptChart(byDept,status){
  const order=['Valid','Due for review','Expired','Pending approval','Unverified'];
  const max=Math.max(...byDept.map(d=>d.total),1);
  return byDept.map(d=>{
    const segs=order.map(s=>d[s]?`<div class="bar-seg" title="${s}: ${d[s]}" style="width:${d[s]/max*100}%;background:${ST_COLOR[s]}"></div>`:'').join('');
    return `<div class="bar-row"><span title="${esc(d.department)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.department)}</span><div class="bar-track">${segs}</div><span style="text-align:right">${d.total}</span></div>`;
  }).join('')+`<div class="legend">${order.map(s=>`<span><span class="sw" style="background:${ST_COLOR[s]}"></span>${s}</span>`).join('')}</div>`;
}
function timelineChart(timeline,ref){
  if(!timeline.length) return '<div class="note">No dated curricula.</div>';
  const max=Math.max(...timeline.map(t=>t.n),1);
  return timeline.map(t=>`<div class="tl-row"><span>${t.year}${t.past?' <span style="color:#657685">(passed)</span>':''}</span>
    <div style="display:flex;align-items:center;gap:8px"><div class="tl-bar" style="width:${t.n/max*100}%;background:${t.past?'#d1495b':'#0aa0e0'}"></div><span>${t.n}</span></div></div>`).join('')
    +`<div class="note">Years before the assessment date (${fmtDate(ref)}) are shown in red — those curricula have lapsed.</div>`;
}

/* ---------- register ---------- */
async function viewRegister(m){
  const d=await api('GET','/curricula'+qref());
  state._cur=d.curricula;
  const f=state.filters;
  const depts=[...new Set(d.curricula.map(c=>c.department))].sort();
  const perCampus=!!state.campus;
  const head = perCampus
    ? `<th>Programme</th><th>Department</th><th class="c">NTA</th><th>Dev. stage</th><th>Valid Until</th><th class="c">Months</th><th>Status</th><th>Recognition</th><th>Stamped</th><th>Implementation</th><th>Docs</th><th class="c no-print">Open</th>`
    : `<th>Programme</th><th>Department</th><th class="c">NTA</th><th>Dev. stage</th><th>Valid Until</th><th class="c">Months</th><th>Status</th><th>Approval letter</th><th>Offered at (✓ recognised / ✗ not)</th><th class="c no-print">Open</th>`;
  m.innerHTML=`<h1 class="page">Curriculum Register</h1><p class="lead">${perCampus?`Curricula offered at <b>${esc(state.campus)}</b>`:'All curricula — national view'} · assessment date <b>${fmtDate(d.ref)}</b> · lead time <b>${d.lead} months</b>.</p>
    ${controlBar()}
    <div class="filters">
      <div class="fld"><label>Search</label><input type="text" id="f_q" value="${esc(f.q)}" placeholder="Programme…" oninput="setFilter('q',this.value)"></div>
      <div class="fld"><label>Department</label><select id="f_dept" onchange="setFilter('dept',this.value)"><option value="">All</option>${depts.map(x=>`<option ${f.dept===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="fld"><label>Status</label><select onchange="setFilter('status',this.value)"><option value="">All</option>${['Valid','Due for review','Expired','Pending approval','Unverified'].map(x=>`<option ${f.status===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="fld"><label>Development stage</label><select onchange="setFilter('stage',this.value)"><option value="">All</option>${(state.meta.stages||[]).map(x=>`<option ${f.stage===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="fld"><label>NTA level</label><select onchange="setFilter('nta',this.value)"><option value="">All</option>${(state.meta.ntaLevels||[4,5,6,7,8,9]).map(n=>`<option ${String(f.nta)===String(n)?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="fld"><label>&nbsp;</label><button class="btn ghost small" onclick="clearFilters()">Clear</button></div>
      ${state.meta.canEdit?`<div class="fld" style="margin-left:auto"><label>&nbsp;</label><button class="btn primary small" onclick="addNew()">＋ Add curriculum</button></div>`:''}
    </div>
    <div class="card" style="padding:0;overflow:auto"><table class="tbl" id="regt">
      <thead><tr>${head}</tr></thead>
      <tbody>${renderRows()}</tbody></table></div>`;
}
function renderRows(){
  let rows=state._cur.slice(); const f=state.filters; const perCampus=!!state.campus;
  if(f.q) rows=rows.filter(r=>r.programme.toLowerCase().includes(f.q.toLowerCase()));
  if(f.dept) rows=rows.filter(r=>r.department===f.dept);
  if(f.status) rows=rows.filter(r=>r.status===f.status);
  if(f.stage) rows=rows.filter(r=>r.stage===f.stage);
  if(f.nta) rows=rows.filter(r=>r.nta===parseInt(f.nta));
  rows.sort((a,b)=> a.programme.localeCompare(b.programme) || ((a.nta||0)-(b.nta||0)) );
  const cols=perCampus?12:10;
  if(!rows.length) return `<tr><td colspan="${cols}" style="color:#657685;text-align:center;padding:20px">No matching curricula.</td></tr>`;
  return rows.map(r=>{
    const mc = r.months_left==null?'—':(r.months_left<0?`<b style="color:#c0324a">${Math.round(r.months_left)}</b>`:(r.months_left<=state.lead?`<b style="color:#946a06">${Math.round(r.months_left)}</b>`:Math.round(r.months_left)));
    const common=`<td><b>${esc(r.programme)}</b></td><td>${esc(r.department)}</td><td class="c">${esc(r.levels)}</td><td>${stagePill(r.stage)}</td><td>${fmtDate(r.valid_until)}</td><td class="c">${mc}</td><td>${stPill(r.status)}</td>`;
    if(perCampus){
      const rec = r.recognition==='Available'?'<span class="pill g">Recognised</span>':`<span class="pill docs-bad">Not recognised</span>`;
      const stp = r.stamped==='Available'?'<span class="pill g">Held</span>':`<span class="pill docs-bad">${esc(r.stamped)}</span>`;
      return `<tr>${common}<td>${rec}</td><td>${stp}</td><td>${esc(r.campusObserved||'')}</td>
        <td>${r.docs==='Complete'?'<span class="pill g">Complete</span>':'<span class="pill docs-bad">Incomplete</span>'}</td>
        <td class="c no-print"><button class="btn small ghost" onclick="openDetail(${r.id})">Open</button></td></tr>`;
    }
    const badges=(state.meta.campuses||[]).map(cn=>{
      const co=r.campuses&&r.campuses[cn];
      if(!co||!co.offered) return `<span class="cbadge off" title="Not offered">${esc(cn.split(' ')[0])} –</span>`;
      const ok=co.recognition==='Available';
      return `<span class="cbadge ${ok?'ok':'no'}" title="${esc(cn)}: ${ok?'recognised':'NOT recognised'}">${esc(cn.split(' ')[0])} ${ok?'✓':'✗'}</span>`;
    }).join('');
    return `<tr>${common}<td>${r.validation==='Available'?'<span class="pill g">Available</span>':`<span class="pill docs-bad">${esc(r.validation)}</span>`}</td>
      <td><div class="campus-badges">${badges}</div></td>
      <td class="c no-print"><button class="btn small ghost" onclick="openDetail(${r.id})">Open</button></td></tr>`;
  }).join('');
}
window.setFilter=(k,v)=>{ state.filters[k]=v; const tb=document.querySelector('#regt tbody'); if(tb) tb.innerHTML=renderRows(); };
window.clearFilters=()=>{ state.filters={q:'',dept:'',status:'',stage:'',nta:''}; renderApp(); };
window.addNew=()=>{ state.editId=null; state.view='entry'; renderApp(); };
window.openDetail=(id)=>{ state.editId=id; state.view='detail'; renderApp(); };

/* ---------- detail ---------- */
/* ---------- new programmes (development / validation pipeline) ---------- */
function pipelineSections(rows,stages,badgeKind){
  return stages.map((st,i)=>{
    const r=rows.filter(c=>c.stage===st).sort((a,b)=>a.programme.localeCompare(b.programme)||((a.nta||0)-(b.nta||0)));
    const head=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><h2 style="flex:1;min-width:160px">${i+1}. ${esc(st)}</h2>${stagePill(st)}<span class="pill b">${r.length}</span></div>`;
    if(!r.length) return `<div class="card">${head}<div class="note" style="margin:0">No programmes at this stage.</div></div>`;
    const body=r.map(c=>{
      const badge = badgeKind==='validity'
        ? stPill(c.status)
        : ((c.recognitionGaps&&c.recognitionGaps.length)?`<span class="pill docs-bad" title="Awaiting departmental recognition at: ${esc(c.recognitionGaps.join(', '))}">awaiting recognition: ${c.recognitionGaps.map(esc).join(', ')}</span>`:'');
      return `<tr>
        <td><b>${esc(c.programme)}</b> ${badge}</td>
        <td class="c">${esc(c.levels||c.nta||'')}</td>
        <td>${esc(c.department)}</td>
        <td>${esc(c.reviewer||'—')}</td>
        <td>${c.review_started?fmtDate(c.review_started):'—'}</td>
        <td class="c no-print"><button class="btn small ghost" onclick="openDetail(${c.id})">Open</button></td></tr>`;
    }).join('');
    return `<div class="card">${head}
      <table class="tbl"><thead><tr><th>Programme</th><th class="c">NTA</th><th>Department</th><th>Responsible officer / committee</th><th>Since</th><th class="c no-print">Open</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }).join('');
}
async function viewNewProgrammes(m){
  const d=await api('GET','/curricula?ref='+state.ref+'&lead='+state.lead);
  const rows=(d.curricula||[]).filter(c=>c.track==='new');
  const stages=state.meta.newStages||[];
  m.innerHTML=`<h1 class="page">New Programmes — Development</h1>
    <p class="lead">Brand-new programmes not yet implemented, grouped by development stage: pre-validation, incorporating NACTVET's validation committee comments, post-validation, and ready for implementation awaiting departmental recognition. Once departmental recognition is granted, the programme is marked as implemented and moves to the Curriculum Register. <b>${rows.length}</b> in development.</p>
    <div class="card no-print" style="border-left:4px solid var(--blue)"><div class="sub" style="margin:0">Add a new programme from <b>Add / Update</b> and set its track to <b>New programme</b>. Move it forward by opening it and changing its stage.</div></div>
    ${rows.length?pipelineSections(rows,stages,'recognition'):'<div class="card"><div class="note" style="margin:0">No new programmes are in development right now.</div></div>'}`;
}
async function viewUnderReview(m){
  const d=await api('GET','/curricula?ref='+state.ref+'&lead='+state.lead);
  const rows=(d.curricula||[]).filter(c=>c.track==='review');
  const stages=state.meta.reviewStages||[];
  const expired=rows.filter(c=>c.status==='Expired').length;
  m.innerHTML=`<h1 class="page">Curricula Under Review</h1>
    <p class="lead">Existing programmes being reviewed / re-validated, grouped by stage: pre-validation, incorporating committee comments, and post-validation. These do <b>not</b> need departmental recognition. The badge on each shows whether it has already <b>expired</b> or is still <b>valid</b> but under early review. <b>${rows.length}</b> under review${expired?`, of which <b>${expired}</b> ${expired===1?'has':'have'} expired`:''}.</p>
    <div class="card no-print" style="border-left:4px solid var(--warn)"><div class="sub" style="margin:0">To track an existing curriculum here — whether expired or not — open it, set its track to <b>Under review</b>, and choose the stage. When the review is complete, set the track back to <b>Established</b> and record the new validity date.</div></div>
    ${rows.length?pipelineSections(rows,stages,'validity'):'<div class="card"><div class="note" style="margin:0">No curricula are currently marked as under review. Open any curriculum (expired or valid) and set its track to “Under review” to start tracking it here.</div></div>'}`;
}
async function viewDetail(m){
  const d=await api('GET','/curricula/'+state.editId+qref());
  const r=d.curriculum; const canEdit=state.meta.canEdit;
  const stages=state.meta.stages||[];
  const camps=state.meta.campuses||['Dar es Salaam','Dodoma','Mbeya','Mwanza'];
  const recOpt=v=>['Available','Missing'].map(o=>`<option ${v===o?'selected':''}>${o}</option>`).join('');
  const stpOpt=v=>['Available','Missing','Partial','Subject to approval'].map(o=>`<option ${v===o?'selected':''}>${o}</option>`).join('');
  const campusRows=camps.map(cn=>{
    const co=(r.campuses&&r.campuses[cn])||{offered:false,recognition:'Missing',stamped:'Missing',observed:'Not offered'};
    if(canEdit){
      return `<tr data-c="${esc(cn)}"><td><b>${esc(cn)}</b></td>
        <td class="c"><input type="checkbox" class="cc_off" ${co.offered?'checked':''}></td>
        <td><select class="cc_rec">${recOpt(co.recognition)}</select></td>
        <td><select class="cc_stp">${stpOpt(co.stamped)}</select></td>
        <td><input type="text" class="cc_obs" value="${esc(co.observed||'')}"></td></tr>`;
    }
    const rec = !co.offered?'<span class="cbadge off">Not offered</span>':(co.recognition==='Available'?'<span class="pill g">Recognised</span>':'<span class="pill docs-bad">Not recognised</span>');
    return `<tr><td><b>${esc(cn)}</b></td><td class="c">${co.offered?'Yes':'—'}</td><td>${rec}</td><td>${esc(co.stamped)}</td><td>${esc(co.observed||'')}</td></tr>`;
  }).join('');
  const recGap = (r.recognitionGaps&&r.recognitionGaps.length)?`<div class="banner" style="background:#fdeee4;border-color:#f0c4a8;color:#8a3a12"><b>Recognition gap:</b> offered without departmental recognition at ${r.recognitionGaps.map(esc).join(', ')}.</div>`:'';
  // Focused per-campus editor — shown when a single campus is selected, so editing a curriculum applies to that campus directly.
  const campusEditCard = (state.campus && canEdit) ? (function(){
    const cn=state.campus; const co=(r.campuses&&r.campuses[cn])||{offered:false,recognition:'Missing',stamped:'Missing',observed:'Not offered'};
    return `<div class="card" style="margin-top:14px;border-left:4px solid var(--blue)"><h2>Update this curriculum at ${esc(cn)}</h2>
      <div class="sub">Edit how <b>${esc(r.programme)} (NTA ${esc(r.levels)})</b> applies at <b>${esc(cn)}</b> only. The national curriculum details are not changed.</div>
      <div class="row">
        <div class="fld"><label>Offered at ${esc(cn)}?</label><select id="ce_off"><option value="yes" ${co.offered?'selected':''}>Yes — offered here</option><option value="no" ${!co.offered?'selected':''}>No — not offered here</option></select></div>
        <div class="fld"><label>Departmental recognition</label><select id="ce_rec">${recOpt(co.recognition)}</select></div>
        <div class="fld"><label>Stamped copy held</label><select id="ce_stp">${stpOpt(co.stamped)}</select></div>
      </div>
      <div class="fld"><label>Implementation / enrolment at ${esc(cn)}</label><input type="text" id="ce_obs" value="${esc(co.observed||'')}" placeholder="e.g. Currently implemented; 40 students enrolled"></div>
      <div class="actions"><button class="btn primary small" onclick="saveOneCampus(${r.id})">💾 Save ${esc(cn)} status</button></div>
    </div>`;
  })() : '';
  m.innerHTML=`<h1 class="page">${esc(r.programme)}</h1><p class="lead">${esc(r.department)} · NTA ${esc(r.levels)} · offered at: ${(r.offeredCampuses&&r.offeredCampuses.length)?r.offeredCampuses.map(esc).join(', '):'—'}</p>
    <div class="actions" style="margin-top:0">
      <button class="btn ghost small" onclick="go('register')">← Back to register</button>
      ${canEdit?`<button class="btn primary small" onclick="editCur(${r.id})">Edit national details</button>`:''}
      <button class="btn ghost small" onclick="speak('${esc(r.programme).replace(/'/g,'')} NTA ${r.nta} is ${esc(r.status)}.')">🔊 Read status</button>
      ${canEdit?`<button class="btn small" style="background:#fdecef;color:#c0324a" onclick="deleteCur(${r.id},'${esc(r.programme).replace(/'/g,'')}')">🗑 Delete record</button>`:''}
    </div>
    ${recGap}
    ${campusEditCard}
    <div class="card" style="margin-top:14px"><h2>Per-campus status${state.campus?' — all campuses':''}</h2><div class="sub">The curriculum is national; each campus must have its department recognised to offer it. ${canEdit?'Edit and save below.':''}</div>
      <table class="tbl camptbl"><thead><tr><th style="width:150px">Campus</th><th class="c">Offered?</th><th>Departmental recognition</th><th>Stamped copy held</th><th>Implementation / enrolment</th></tr></thead>
      <tbody id="campusBody">${campusRows}</tbody></table>
      ${canEdit?`<div class="actions"><button class="btn primary small" onclick="saveCampuses(${r.id})">💾 Save per-campus status</button></div>`:''}
    </div>
    <div class="grid-eq" style="margin-top:0">
      <div class="card"><h2>National curriculum details</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${stPill(r.status)} ${r.validation==='Available'?'<span class="pill g">Approval letter available</span>':'<span class="pill docs-bad">Approval letter '+esc(r.validation)+'</span>'}</div>
        <table class="tbl">
          <tr><th style="width:210px">Validation / approval letter</th><td>${esc(r.validation)}</td></tr>
          <tr><th>Valid until</th><td>${fmtDate(r.valid_until)} ${r.months_left!=null?`(${r.months_left<0?Math.abs(Math.round(r.months_left))+' months ago':Math.round(r.months_left)+' months left'})`:''}</td></tr>
          <tr><th>Curriculum status note</th><td>${esc(r.observed)||'—'}</td></tr>
          <tr><th>Notes</th><td>${esc(r.notes)||'—'}</td></tr>
          <tr><th>Recommended action</th><td>${esc(r.action)}</td></tr>
          <tr><th>Last updated</th><td>${esc(r.updated_by)} · ${esc(r.updated_at)}</td></tr>
        </table></div>
      <div class="card"><h2>Track &amp; development / validation stage</h2><div class="sub">Is this an established programme, a new programme in development, or an existing one under review? New programmes need departmental recognition; reviews do not.</div>
        <div style="margin-bottom:10px">${trackBadge(r.track)} ${r.track&&r.track!=='stable'?stagePill(r.stage):''}</div>
        ${canEdit?`${trackStageControls('rv', r.track, r.stage)}
        <div class="fld"><label>Responsible officer / committee</label><input type="text" id="rv_by" value="${esc(r.reviewer||'')}" placeholder="e.g. NACTVET Validation Committee"></div>
        <div class="fld"><label>Date entered this stage</label><input type="date" id="rv_date" value="${esc(r.review_started||'')}"></div>
        <button class="btn primary small" onclick="saveReview(${r.id})">Save track &amp; stage</button>`
        :`<p>${esc(TRACK_LABEL[r.track]||'—')}${r.track&&r.track!=='stable'?' · '+esc(r.stage):''}<br>Responsible: ${esc(r.reviewer)||'—'}<br>Since: ${fmtDate(r.review_started)}</p>`}
        <hr style="border:none;border-top:1px solid var(--line);margin:16px 0">
        <h2 style="font-size:18px">Document library</h2><div class="sub">Approval/validation letters, the full curriculum document, stamped copies, review reports and more. Any signed-in user can download; editing roles can add or remove. Up to ${state.meta.maxUploadMb} MB per file.</div>
        ${docLibrary(r,canEdit)}
      </div>
    </div>`;
}
const DOC_KINDS=['Validation / approval letter','Full curriculum document','Stamped curriculum document','Departmental recognition','Curriculum review report','Other'];
function fmtSize(b){ if(!b) return ''; if(b<1048576) return (b/1024).toFixed(0)+' KB'; return (b/1048576).toFixed(1)+' MB'; }
function docLibrary(r,canEdit){
  const docs=Array.isArray(r.documents)?r.documents:[];
  const list = docs.length ? `<table class="tbl" style="margin-bottom:12px"><thead><tr><th>Type</th><th>File</th><th>Size</th><th>Uploaded</th>${canEdit?'<th class="c">Remove</th>':''}</tr></thead><tbody>${
    docs.map(d=>`<tr><td>${esc(d.kind)}</td><td><a href="/api/curricula/${r.id}/documents/${d.id}/download">⬇ ${esc(d.original)}</a></td><td>${fmtSize(d.size)}</td><td>${esc(d.by||'')}<br><span class="note" style="margin:0">${new Date(d.at).toLocaleDateString('en-GB')}</span></td>${canEdit?`<td class="c"><button class="btn small ghost" onclick="delDoc(${r.id},${d.id})">✕</button></td>`:''}</tr>`).join('')
  }</tbody></table>` : '<div class="note" style="margin:0 0 12px">No documents uploaded yet.</div>';
  const uploader = canEdit ? `<div class="filters" style="margin:0;align-items:end">
    <div class="fld"><label>Document type</label><select id="doc_kind">${DOC_KINDS.map(k=>`<option>${k}</option>`).join('')}</select></div>
    <div class="fld"><label>Choose file</label><input type="file" id="doc_file"></div>
    <div class="fld"><label>&nbsp;</label><button class="btn primary small" onclick="uploadDoc(${r.id})">⬆ Upload document</button></div>
    </div><div id="doc_prog" class="note" style="margin-top:6px"></div>` : '';
  return list + uploader;
}
window.saveReview=async(id)=>{
  const track=document.getElementById('rv_track').value;
  const stageEl=document.getElementById('rv_stage');
  const stage= track==='stable' ? '' : (stageEl?stageEl.value:'');
  try{ await api('PUT','/curricula/'+id+'/review',{track,stage,reviewer:document.getElementById('rv_by').value,review_started:document.getElementById('rv_date').value}); toast('Track & stage saved'); renderApp(); }
  catch(e){ toast(e.message); }
};
window.uploadDoc=(id)=>{
  const input=document.getElementById('doc_file'); const kind=document.getElementById('doc_kind').value;
  if(!input.files[0]){ toast('Choose a file first'); return; }
  const file=input.files[0];
  const max=state.meta.maxUploadMb*1048576;
  if(file.size>max){ toast('File is larger than '+state.meta.maxUploadMb+' MB'); return; }
  const fd=new FormData(); fd.append('file',file); fd.append('kind',kind);
  const prog=document.getElementById('doc_prog'); prog.textContent='Uploading '+file.name+' ('+fmtSize(file.size)+')…';
  // XHR for progress on large files
  const xhr=new XMLHttpRequest();
  xhr.open('POST','/api/curricula/'+id+'/documents');
  xhr.withCredentials=true;
  xhr.upload.onprogress=e=>{ if(e.lengthComputable) prog.textContent='Uploading… '+Math.round(e.loaded/e.total*100)+'%'; };
  xhr.onload=()=>{ if(xhr.status>=200&&xhr.status<300){ toast('Document uploaded'); renderApp(); } else { let m='Upload failed'; try{m=JSON.parse(xhr.responseText).error||m;}catch(e){} toast(m); prog.textContent=m; } };
  xhr.onerror=()=>{ toast('Upload failed'); prog.textContent='Upload failed'; };
  xhr.send(fd);
};
window.delDoc=async(id,docId)=>{
  if(!confirm('Remove this document?')) return;
  try{ await api('DELETE','/curricula/'+id+'/documents/'+docId); toast('Document removed'); renderApp(); }
  catch(e){ toast(e.message); }
};
window.saveCampuses=async(id)=>{
  const campuses={};
  document.querySelectorAll('#campusBody tr[data-c]').forEach(tr=>{
    campuses[tr.getAttribute('data-c')]={
      offered: tr.querySelector('.cc_off').checked,
      recognition: tr.querySelector('.cc_rec').value,
      stamped: tr.querySelector('.cc_stp').value,
      observed: tr.querySelector('.cc_obs').value.trim()
    };
  });
  try{ await api('PUT','/curricula/'+id,{campuses}); toast('Per-campus status saved'); renderApp(); }
  catch(e){ toast(e.message); }
};
window.saveOneCampus=async(id)=>{
  const cn=state.campus; if(!cn){ toast('Select a campus first'); return; }
  const body={campuses:{}};
  body.campuses[cn]={
    offered: document.getElementById('ce_off').value==='yes',
    recognition: document.getElementById('ce_rec').value,
    stamped: document.getElementById('ce_stp').value,
    observed: document.getElementById('ce_obs').value.trim()
  };
  try{ await api('PUT','/curricula/'+id,body); toast(cn+' status saved'); renderApp(); }
  catch(e){ toast(e.message); }
};
window.editCur=(id)=>{ state.editId=id; state.view='entry'; renderApp(); };
window.deleteCur=async(id,name)=>{
  if(!confirm('Delete the curriculum record for "'+name+'"?\nThis cannot be undone.')) return;
  try{ await api('DELETE','/curricula/'+id); toast('Record deleted'); state.editId=null; state.view='register'; renderApp(); }
  catch(e){ toast(e.message); }
};

/* ---------- entry (add/edit) ---------- */
async function viewEntry(m){
  let r={programme:'',department:state.meta.lists.departments[0]||'',levels:'',validation:'Available',valid_until:'',observed:'',notes:'',track:'stable',stage:'',campuses:{}};
  if(state.editId){ const d=await api('GET','/curricula/'+state.editId+qref()); r=d.curriculum; }
  const opt=(arr,v)=>arr.map(x=>`<option ${v===x?'selected':''}>${esc(x)}</option>`).join('');
  const camps=state.meta.campuses||['Dar es Salaam','Dodoma','Mbeya','Mwanza'];
  const recOpt=v=>['Available','Missing'].map(o=>`<option ${v===o?'selected':''}>${o}</option>`).join('');
  const stpOpt=v=>['Available','Missing','Partial','Subject to approval'].map(o=>`<option ${v===o?'selected':''}>${o}</option>`).join('');
  const campusRows=camps.map((cn,i)=>{
    const co=(r.campuses&&r.campuses[cn])||(i===0&&!state.editId?{offered:true,recognition:'Available',stamped:'Available',observed:'Currently implemented'}:{offered:false,recognition:'Missing',stamped:'Missing',observed:''});
    return `<tr data-c="${esc(cn)}"><td><b>${esc(cn)}</b></td>
      <td class="c"><input type="checkbox" class="ec_off" ${co.offered?'checked':''}></td>
      <td><select class="ec_rec">${recOpt(co.recognition)}</select></td>
      <td><select class="ec_stp">${stpOpt(co.stamped)}</select></td>
      <td><input type="text" class="ec_obs" value="${esc(co.observed||'')}" placeholder="e.g. Currently implemented"></td></tr>`;
  }).join('');
  m.innerHTML=`<h1 class="page">${state.editId?'Update curriculum':'Add a curriculum record'}</h1>
    <p class="lead">National details apply to all campuses; per-campus status is set below. Stamped with your role and today's date.</p>
    <div class="card"><h2>National details</h2><div class="row">
      <div class="fld"><label>Programme name *</label><input type="text" id="e_programme" value="${esc(r.programme)}"></div>
      <div class="fld"><label>Department *</label><select id="e_department">${opt(state.meta.lists.departments,r.department)}</select></div>
    </div><div class="row">
      ${state.editId
        ? `<div class="fld"><label>NTA level *</label><select id="e_nta_single">${(state.meta.ntaLevels||[4,5,6,7,8,9]).map(n=>`<option ${r.nta===n?'selected':''}>${n}</option>`).join('')}</select></div>`
        : `<div class="fld"><label>NTA level(s) *</label>
        <div style="display:flex;gap:14px;flex-wrap:wrap;padding:8px 2px">${(state.meta.ntaLevels||[4,5,6,7,8,9]).map(n=>`<label style="display:inline-flex;align-items:center;gap:5px;font-weight:600;color:var(--ink);text-transform:none;letter-spacing:0"><input type="checkbox" class="e_nta" value="${n}"> ${n}</label>`).join('')}</div>
        <div class="note" style="margin:2px 0 0">Tick each level — <b>one record is created per level</b>; the per-campus settings below apply to each.</div></div>`}
      <div class="fld"><label>Validation / approval letter (national)</label><select id="e_validation">${opt(['Available','Missing','Partial'],r.validation)}</select></div>
    </div><div class="row">
      ${trackStageControls('e', r.track, r.stage)}
      <div class="fld"><label>Curriculum valid until (date)</label><input type="date" id="e_valid" value="${esc(r.valid_until)}"></div>
      <div class="fld"><label>Curriculum status note</label><input type="text" id="e_observed" value="${esc(r.observed)}" placeholder="e.g. Currently implemented / Ready for implementation"></div>
    </div>
    <div class="fld"><label>Notes</label><textarea id="e_notes" rows="2">${esc(r.notes)}</textarea></div>
    </div>
    <div class="card"><h2>Per-campus status</h2><div class="sub">Tick the campuses that offer this programme and set each campus's departmental recognition, stamped copy and implementation.${state.editId?'':' These apply to every NTA level you ticked above.'}</div>
      <table class="tbl camptbl"><thead><tr><th style="width:150px">Campus</th><th class="c">Offered?</th><th>Departmental recognition</th><th>Stamped copy held</th><th>Implementation / enrolment</th></tr></thead>
      <tbody>${campusRows}</tbody></table>
    </div>
    <div class="actions"><button class="btn primary" onclick="saveCur()">💾 Save record</button><button class="btn ghost" onclick="go('register')">Cancel</button></div>`;
}
function collectCampuses(){
  const campuses={};
  document.querySelectorAll('tr[data-c]').forEach(tr=>{
    if(!tr.querySelector('.ec_off')) return;
    campuses[tr.getAttribute('data-c')]={ offered:tr.querySelector('.ec_off').checked, recognition:tr.querySelector('.ec_rec').value, stamped:tr.querySelector('.ec_stp').value, observed:tr.querySelector('.ec_obs').value.trim() };
  });
  return campuses;
}
window.saveCur=async()=>{
  const track=val('e_track')||'stable';
  const stageEl=document.getElementById('e_stage');
  const stage= track==='stable' ? '' : (stageEl?stageEl.value:'');
  const body={ programme:val('e_programme'),department:val('e_department'),
    validation:val('e_validation'),track,stage,valid_until:val('e_valid'),observed:val('e_observed'),notes:val('e_notes'), campuses:collectCampuses() };
  if(!body.programme){ toast('Programme name is required'); return; }
  try{
    if(state.editId){
      body.nta=parseInt(document.getElementById('e_nta_single').value);
      await api('PUT','/curricula/'+state.editId,body); toast('Record updated');
    } else {
      const nta=[...document.querySelectorAll('.e_nta:checked')].map(x=>parseInt(x.value));
      if(!nta.length){ toast('Tick at least one NTA level'); return; }
      body.nta=nta;
      const r=await api('POST','/curricula',body); toast(r.count+' curriculum record'+(r.count!==1?'s':'')+' created');
    }
    state.editId=null; state.view='register'; renderApp();
  }catch(e){ toast(e.message); }
};
function val(id){ return document.getElementById(id).value.trim(); }

/* ---------- notifications ---------- */
async function viewNotify(m){
  const s=await api('GET','/settings'); const list=await api('GET','/notifications');
  const ch=s.channels||{};
  m.innerHTML=`<h1 class="page">Notifications</h1><p class="lead">Alert key players when a curriculum enters the review window or expires.</p>
    <div class="grid-eq">
      <div class="card"><h2>Channels &amp; recipients</h2><div class="sub">Dashboard alerts and voice work now; email &amp; SMS ${state.meta.emailEnabled||state.meta.smsEnabled?'are configured':'produce previews until a gateway is configured'}.</div>
        <div class="switchrow"><input type="checkbox" id="ch_dash" ${ch.dashboard?'checked':''}> Dashboard alerts (on-screen)</div>
        <div class="switchrow"><input type="checkbox" id="ch_email" ${ch.email?'checked':''}> Email reminders ${state.meta.emailEnabled?'<span class="pill g">gateway on</span>':'<span class="pill b">preview</span>'}</div>
        <div class="switchrow"><input type="checkbox" id="ch_sms" ${ch.sms?'checked':''}> SMS / text reminders ${state.meta.smsEnabled?'<span class="pill g">gateway on</span>':'<span class="pill b">preview</span>'}</div>
        <div class="switchrow"><input type="checkbox" id="ch_voice" ${ch.voice?'checked':''}> Voice announcements (reads alerts aloud)</div>
        <div class="fld" style="margin-top:10px"><label>Recipient emails (comma-separated)</label><input type="text" id="n_emails" value="${esc(s.recipientEmails||'')}"></div>
        <div class="fld"><label>Recipient phone numbers (comma-separated)</label><input type="text" id="n_phones" value="${esc(s.recipientPhones||'')}"></div>
        <div class="actions"><button class="btn ghost small" onclick="saveNotifSettings()">Save settings</button></div>
        <div class="note">Wire a mail server (SMTP) and an SMS/voice gateway (Africa's Talking, Beem or Twilio) to send automatically — see <b>src/notify.js</b> and <b>.env.example</b>. A daily scheduled run then reminds staff without anyone opening the app.</div>
      </div>
      <div class="card"><h2>Generate &amp; send</h2><div class="sub">Builds a reminder for every curriculum requiring action.</div>
        <div class="actions" style="margin-top:0"><button class="btn primary small" onclick="genNotif()">Generate notifications</button>
          <button class="btn ghost small" onclick="speakAll()">🔊 Read aloud</button>
          <button class="btn ghost small" onclick="stopSpeak()">⏹ Stop</button>
          <button class="btn ghost small" onclick="clearNotif()">Clear log</button></div>
        <div id="notiflog" style="margin-top:14px">${renderNotifLog(list.notifications)}</div>
      </div>
    </div>`;
}
function renderNotifLog(items){
  const dash=items.filter(n=>n.channel==='dashboard');
  if(!dash.length) return '<div class="note">No notifications yet. Click “Generate notifications”.</div>';
  return dash.slice(0,20).map(n=>`<div class="alert ${/Expired/.test(n.message)?'crit':/Due for review/.test(n.message)?'warn':'ser'}"><div style="flex:1"><div class="title">${esc(n.curriculum)}</div><div class="desc" style="margin:4px 0">${esc(n.message)}</div><div class="note" style="margin:0">${esc(n.detail)} · ${new Date(n.at).toLocaleString('en-GB')}</div></div><button class="btn small ghost no-print" onclick="speak('${esc(n.message).replace(/'/g,'')}')">🔊</button></div>`).join('');
}
window.saveNotifSettings=async()=>{
  try{ await api('PUT','/settings',{recipientEmails:val('n_emails'),recipientPhones:val('n_phones'),channels:{dashboard:document.getElementById('ch_dash').checked,email:document.getElementById('ch_email').checked,sms:document.getElementById('ch_sms').checked,voice:document.getElementById('ch_voice').checked}}); toast('Settings saved'); }
  catch(e){ toast(e.message); }
};
window.genNotif=async()=>{
  await saveNotifSettings();
  try{ const r=await api('POST','/notifications/generate'+qref(),{}); toast(r.count+' notifications generated');
    const list=await api('GET','/notifications'); document.getElementById('notiflog').innerHTML=renderNotifLog(list.notifications);
    if(document.getElementById('ch_voice').checked) speakAll(r.results);
  }catch(e){ toast(e.message); }
};
window.clearNotif=async()=>{ await api('DELETE','/notifications'); const list=await api('GET','/notifications'); document.getElementById('notiflog').innerHTML=renderNotifLog(list.notifications); toast('Log cleared'); };
window.stopSpeak=()=>speechSynthesis.cancel();
window.speakAll=async(results)=>{
  let msgs;
  if(Array.isArray(results)) msgs=results.filter(x=>x.channel==='dashboard').map(x=>x.message);
  else { const list=await api('GET','/notifications'); msgs=list.notifications.filter(n=>n.channel==='dashboard').slice(0,8).map(n=>n.message); }
  speechSynthesis.cancel();
  if(!msgs.length){ speak('There are no curricula requiring action at this time.'); return; }
  speak('You have '+msgs.length+' curriculum alerts.'); msgs.slice(0,8).forEach(m=>speak(m));
};

/* ---------- reports ---------- */
async function viewReports(m){
  const depts=state.meta.lists.departments;
  m.innerHTML=`<h1 class="page">Reports</h1><p class="lead">Generate a well-summarised status report on demand. Print to PDF or export to CSV.</p>
    ${controlBar()}
    <div class="card no-print"><div class="filters" style="margin:0">
      <div class="fld"><label>Report scope</label><select id="rp_scope" onchange="scopeChange()">
        <option value="all">All curricula (full status report)</option><option value="action">Curricula requiring action</option>
        <option value="expired">Expired only</option><option value="due">Due for review only</option>
        <option value="gaps">Documentation gaps</option><option value="recognition">Recognition gaps (offered, not recognised)</option><option value="dept">By department</option><option value="stage">By development / validation stage</option></select></div>
      <div class="fld" id="rp_deptwrap" style="display:none"><label>Department</label><select id="rp_dept">${depts.map(d=>`<option>${esc(d)}</option>`).join('')}</select></div>
      <div class="fld" id="rp_stagewrap" style="display:none"><label>Development stage</label><select id="rp_stage">${(state.meta.stages||[]).map(s=>`<option>${esc(s)}</option>`).join('')}</select></div>
      <div class="fld"><label>&nbsp;</label><button class="btn primary small" onclick="buildReport()">Generate report</button></div>
      <div class="fld"><label>&nbsp;</label><button class="btn ghost small" onclick="window.print()">🖨 Print / PDF</button></div>
      <div class="fld"><label>&nbsp;</label><button class="btn ghost small" onclick="dlCSV()">⬇ Export CSV</button></div>
    </div></div>
    <div id="reportOut"></div>`;
}
window.scopeChange=()=>{ const v=document.getElementById('rp_scope').value;
  document.getElementById('rp_deptwrap').style.display=v==='dept'?'block':'none';
  document.getElementById('rp_stagewrap').style.display=v==='stage'?'block':'none'; };
function scopeParams(){ const scope=document.getElementById('rp_scope').value; const dept=document.getElementById('rp_dept')?document.getElementById('rp_dept').value:''; const stage=document.getElementById('rp_stage')?document.getElementById('rp_stage').value:''; return {scope,dept,stage}; }
window.dlCSV=()=>{ const {scope,dept,stage}=scopeParams(); window.open('/api/report.csv'+qref()+'&scope='+encodeURIComponent(scope)+'&dept='+encodeURIComponent(dept)+'&stage='+encodeURIComponent(stage),'_blank'); };
window.buildReport=async()=>{
  const {scope,dept,stage}=scopeParams();
  const d=await api('GET','/report'+qref()+'&scope='+encodeURIComponent(scope)+'&dept='+encodeURIComponent(dept)+'&stage='+encodeURIComponent(stage));
  const s=d.summary; const eb=d.expiredBreakdown||{total:s.Expired||0,inReview:0,notStarted:s.Expired||0}; const nb=(x,w)=>x>0?`<b>${x}</b> ${w}`:`no ${w}`; const labels={all:'Full status report',action:'Curricula requiring action',expired:'Expired curricula',due:'Curricula due for review',gaps:'Documentation gaps',recognition:'Recognition gaps (offered, not recognised)',dept:'Department: '+dept,stage:'Development / validation stage: '+stage};
  const body=d.rows.map(r=>`<tr><td>${esc(r.programme)}</td><td>${esc(r.department)}</td><td class="c">${esc(r.levels)}</td><td>${fmtDate(r.valid_until)}</td><td class="c">${r.months_left==null?'—':Math.round(r.months_left)}</td><td>${esc(r.status)}</td><td>${esc(r.stage?stageLabelShort(r.stage):'—')}</td><td>${esc(r.docs)}</td><td>${esc(state.campus?(r.campusObserved||''):(r.observed||''))}</td></tr>`).join('')||'<tr><td colspan="9" style="text-align:center;color:#657685">No records for this scope.</td></tr>';
  document.getElementById('reportOut').innerHTML=`<div class="card"><div class="official"><div class="oh"><img src="/assets/arms.png"><div class="c"><div class="l1">THE UNITED REPUBLIC OF TANZANIA</div><div class="l2">COLLEGE OF BUSINESS EDUCATION</div><div class="l3">Curriculum Development, Review &amp; Implementation — Status Report</div></div><img src="/assets/be.png"></div>
    <div class="ob"><div class="otitle">${esc(labels[scope])}</div>
    <table class="tbl"><tr><th style="width:170px">Generated</th><td>${fmtDate(d.ref)}</td></tr><tr><th>Prepared by</th><td>${esc(state.user.name)} (${ROLE_LABEL[state.user.role]})</td></tr><tr><th>Review lead time</th><td>${d.lead} months before expiry</td></tr></table>
    <div class="banner" style="margin-top:12px"><b>Executive summary.</b> As at ${fmtDate(d.ref)}, ${state.campus?esc(state.campus)+' campus':'the College'} tracks <b>${s.total}</b> curricula: ${nb(s.Valid,'valid')}, ${nb(s['Due for review'],'due for review (within '+d.lead+' months)')}, ${nb(s.Expired,'expired')}, ${nb(s['Pending approval'],'pending approval')} and ${nb(s.Unverified,'unverified')}.${eb.total>0?` Of the expired, ${eb.notStarted>0?`<b>${eb.notStarted}</b> ${eb.notStarted===1?'has':'have'} no review under way and ${eb.notStarted===1?'needs':'need'} a review started`:'all are already under review'}${eb.notStarted>0&&eb.inReview>0?`, while <b>${eb.inReview}</b> ${eb.inReview===1?'is':'are'} already under review`:(eb.notStarted===0&&eb.inReview>0?` (<b>${eb.inReview}</b>)`:'')}.`:''} ${s.gaps>0?`<b>${s.gaps}</b> ${s.gaps===1?'curriculum has':'curricula have'} documentation gaps requiring attention`:'No documentation gaps were found'}.${(s.recognitionGaps||0)>0?` <b>${s.recognitionGaps}</b> campus offering${s.recognitionGaps===1?' is':'s are'} ready for implementation but awaiting departmental recognition.`:''}</div>
    <h2 style="margin:14px 0 8px;font-size:18px">Details (${d.rows.length} record${d.rows.length!==1?'s':''})</h2>
    <div style="overflow:auto"><table class="tbl"><thead><tr><th>Programme</th><th>Department</th><th class="c">NTA</th><th>Valid Until</th><th class="c">Months</th><th>Status</th><th>Dev. stage</th><th>Docs</th><th>Implementation</th></tr></thead><tbody>${body}</tbody></table></div>
    <div class="note">Generated by the CBE Curriculum Tracking System. Source data: Curriculum Availability, Implementation and Validity Verification (Sept 2025).</div>
    </div></div></div>`;
  document.getElementById('reportOut').scrollIntoView({behavior:'smooth'});
};

/* ---------- departments ---------- */
async function viewDepartments(m){
  const rows=await api('GET','/departments'); state._depts=rows;
  const total=rows.reduce((s,r)=>s+r.count,0);
  m.innerHTML=`<h1 class="page">Departments</h1>
    <p class="lead">Add a new department, rename an existing one, or remove a department that has no curricula. Renaming a department automatically updates every curriculum recorded under it, across all campuses.</p>
    <div class="card">
      <h2>Add a department</h2>
      <div class="filters">
        <div class="fld"><label>New department name</label><input type="text" id="d_new" placeholder="e.g. Tourism &amp; Hospitality Management"></div>
        <div class="fld"><label>&nbsp;</label><button class="btn primary small" onclick="deptAdd()">Add department</button></div>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:auto">
      <table class="tbl"><thead><tr><th>Department</th><th class="c">Curricula</th><th>Rename to…</th><th class="c no-print">Action</th></tr></thead>
      <tbody>${rows.map((r,i)=>`<tr>
        <td><b>${esc(r.name)}</b></td>
        <td class="c">${r.count}</td>
        <td><input type="text" id="d_re_${i}" value="${esc(r.name)}" style="min-width:220px"></td>
        <td class="c no-print" style="white-space:nowrap">
          <button class="btn ghost small" onclick="deptRename(${i})">Save name</button>
          ${r.count===0?`<button class="btn small" style="background:#fdecef;color:#c0324a" onclick="deptRemove(${i})">Remove</button>`:`<span class="muted" title="A department in use cannot be removed">in use</span>`}
        </td></tr>`).join('')}</tbody></table>
    </div>
    <div class="note">${rows.length} department${rows.length!==1?'s':''}, ${total} curriculum record${total!==1?'s':''} in total. Only a department with no curricula can be removed; otherwise rename it to keep the records attached.</div>`;
}
window.deptAdd=async()=>{ const n=val('d_new'); if(!n){ toast('Enter a department name'); return; } try{ const r=await api('POST','/lists/department',{name:n}); state.meta.lists=r.lists; toast('Department added'); renderApp(); }catch(e){ toast(e.message); } };
window.deptRename=async(i)=>{ const from=state._depts[i].name; const to=val('d_re_'+i); if(!to){ toast('Enter a name'); return; } if(to===from){ toast('The name is unchanged'); return; } if(!confirm('Rename “'+from+'” to “'+to+'”?\nThis will update every curriculum recorded under this department.')) return; try{ const r=await api('POST','/lists/department/rename',{from,to}); state.meta.lists=r.lists; toast('Renamed'+(r.changed?(' — '+r.changed+' curricula updated'):'')); renderApp(); }catch(e){ toast(e.message); } };
window.deptRemove=async(i)=>{ const name=state._depts[i].name; if(!confirm('Remove the department “'+name+'”?')) return; try{ const r=await api('POST','/lists/department/remove',{name}); state.meta.lists=r.lists; toast('Department removed'); renderApp(); }catch(e){ toast(e.message); } };

/* ---------- settings ---------- */
async function viewSettings(m){
  const s=await api('GET','/settings'); const lists=state.meta.lists;
  m.innerHTML=`<h1 class="page">Settings</h1><p class="lead">Configure the review lead time, notification recipients, departments and campuses.</p>
    <div class="grid-eq">
      <div class="card"><h2>Review &amp; notifications</h2>
        <div class="fld"><label>Review lead time (months before expiry)</label><input type="number" id="s_lead" min="1" max="36" value="${s.leadMonths}"></div>
        <div class="fld"><label>Recipient emails (comma-separated)</label><input type="text" id="s_emails" value="${esc(s.recipientEmails||'')}"></div>
        <div class="fld"><label>Recipient phone numbers (comma-separated)</label><input type="text" id="s_phones" value="${esc(s.recipientPhones||'')}"></div>
        <div class="actions"><button class="btn primary small" onclick="saveSettings()">Save settings</button></div>
      </div>
      <div class="card"><h2>Departments &amp; campuses</h2>
        <div class="fld"><label>Departments</label><div>${lists.departments.map(d=>`<span class="pill b" style="margin:2px">${esc(d)}</span>`).join('')}</div></div>
        <div class="actions" style="margin:4px 0 10px"><button class="btn ghost small" onclick="go('departments')">Add or update departments →</button></div>
        <div class="fld"><label>Campuses</label><div>${lists.campuses.map(c=>`<span class="pill b" style="margin:2px">${esc(c)}</span>`).join('')}</div></div>
        <div class="filters"><div class="fld"><label>Add campus</label><input type="text" id="s_campus"></div><div class="fld"><label>&nbsp;</label><button class="btn ghost small" onclick="addCampus()">Add</button></div></div>
      </div>
    </div>
    ${state.meta.isAdmin?`<div class="card" style="border-color:#f0c4cc">
      <h2 style="color:#c0324a">Danger zone</h2>
      <div class="sub">Administrator only. Use this to wipe the sample/demo data before entering real records, or to start over.</div>
      <div class="fld"><label>Type <b>DELETE ALL</b> to confirm, then click the button</label><input type="text" id="s_confirm" placeholder="DELETE ALL" style="max-width:260px"></div>
      <button class="btn small" style="background:#fdecef;color:#c0324a" onclick="clearAll()">🗑 Delete ALL curriculum records</button>
      <div class="note">User accounts and settings are kept. This removes every curriculum record only.</div>
    </div>`:''}`;
}
window.clearAll=async()=>{
  const phrase=val('s_confirm');
  if(phrase!=='DELETE ALL'){ toast('Type DELETE ALL to confirm'); return; }
  if(!confirm('This will permanently delete ALL curriculum records. Continue?')) return;
  try{ const r=await api('POST','/curricula/clear',{confirm:'DELETE ALL'}); toast(r.removed+' records deleted'); renderApp(); }
  catch(e){ toast(e.message); }
};
window.saveSettings=async()=>{ try{ const r=await api('PUT','/settings',{leadMonths:val('s_lead'),recipientEmails:val('s_emails'),recipientPhones:val('s_phones')}); state.meta.settings=r; state.lead=r.leadMonths; toast('Settings saved'); }catch(e){ toast(e.message);} };
window.addDept=async()=>{ const n=val('s_dept'); if(!n)return; await api('POST','/lists/department',{name:n}); state.meta.lists=await api('GET','/lists'); renderApp(); };
window.addCampus=async()=>{ const n=val('s_campus'); if(!n)return; await api('POST','/lists/campus',{name:n}); state.meta.lists=await api('GET','/lists'); renderApp(); };

/* ---------- audit ---------- */
async function viewAudit(m){
  const d=await api('GET','/audit');
  m.innerHTML=`<h1 class="page">Audit Log</h1><p class="lead">Every change is recorded with the person and time.</p>
    <div class="card" style="padding:0;overflow:auto"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
    <tbody>${d.audit.map(a=>`<tr><td>${new Date(a.at).toLocaleString('en-GB')}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td>${esc(a.entity)}</td><td>${esc(a.detail)}</td></tr>`).join('')||'<tr><td colspan="5" style="text-align:center;color:#657685">No entries.</td></tr>'}</tbody></table></div>`;
}

/* ---------- users ---------- */
async function viewUsers(m){
  const d=await api('GET','/users');
  m.innerHTML=`<h1 class="page">Users</h1><p class="lead">Create accounts for the Coordinator, QAM, Director of Academics and Management. New users set their own password on first sign-in.</p>
    <div class="card"><h2>Add a user</h2><div class="row">
      <div class="fld"><label>Full name</label><input type="text" id="u_name"></div>
      <div class="fld"><label>Email</label><input type="email" id="u_email"></div>
      <div class="fld"><label>Role</label><select id="u_role"><option value="coordinator">Curriculum Coordinator</option><option value="qam">Quality Assurance Manager</option><option value="director">Director of Academics</option><option value="management">Management</option><option value="admin">Administrator</option></select></div>
      <div class="fld"><label>Temp password</label><input type="text" id="u_pw" value="changeme123"></div>
    </div><div class="actions"><button class="btn primary small" onclick="addUser()">Create user</button></div></div>
    <div class="card" style="padding:0;overflow:auto"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th class="c">Action</th></tr></thead>
    <tbody>${d.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${ROLE_LABEL[u.role]||esc(u.role)}</td><td>${u.active?'<span class="pill g">Active</span>':'<span class="pill r">Disabled</span>'}</td><td class="c"><button class="btn small ghost" onclick="toggleUser(${u.id},${u.active?0:1})">${u.active?'Disable':'Enable'}</button></td></tr>`).join('')}</tbody></table></div>`;
}
window.addUser=async()=>{ try{ await api('POST','/users',{name:val('u_name'),email:val('u_email'),role:document.getElementById('u_role').value,password:val('u_pw')}); toast('User created'); renderApp(); }catch(e){ toast(e.message);} };
window.toggleUser=async(id,active)=>{ await api('POST','/users/'+id+'/active',{active}); renderApp(); };

boot();
