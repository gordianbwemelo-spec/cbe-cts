# CBE Curriculum Development, Review & Implementation Status Tracking System

A complete, ready-to-run web application that gives the College of Business
Education a single, live view of **every curriculum's status** — which are valid,
which are expired, which are missing approval documents — and **flags each one for
review at least 8 months before it expires** (the lead time is configurable). It
supports role-based data entry by the Curriculum Coordinator, QAM and Director of
Academics, dashboard / email / SMS / voice notifications, a review-workflow
tracker, and on-demand summarised reports (print to PDF, export to CSV).

Built as a sibling to the CBE FPT Management System: same architecture, same house
style. It runs anywhere Node.js runs, with a built-in file database (no separate
database server, no build step, no native modules). It ships **empty and secure**
for real use, with an optional **demo/training** mode preloaded with the
Dar es Salaam September 2025 verification data.

---

## Two ways to run

- **On a computer (local):** double-click a launcher — good for a pilot or a
  training session.
- **In the cloud (web link):** deploy so everyone reaches it from a URL. This is
  the real College deployment (see **Deployment** below).

## Two run modes

| Mode | How | What you get |
|------|-----|--------------|
| **Production** (default) | `npm start` / `Start-CBE-CTS.bat` | Starts **empty**. Core accounts set their own password on first sign-in. Use for real data. |
| **Demo / training** | `npm run demo` / `Start-CBE-CTS-DEMO.bat` / `CTS_DEMO=1` | Loads the Sept 2025 sample data — 96 curriculum records (one per NTA level) across 30 programmes — and ready-to-use logins. Training only. |

---

## Quick start (local)

```bash
npm install     # one time
npm start       # live mode (empty)  — or:  npm run demo  (training data)
```

Open **http://localhost:3000**.

- **Windows:** double-click `Start-CBE-CTS.bat` (live) or `Start-CBE-CTS-DEMO.bat` (demo).
- **macOS / Linux:** `./start-mac-linux.sh` (live) or `./start-mac-linux.sh demo`.

### First sign-in (production)
The system starts empty with these core accounts; each is forced to set its own
e-mail and password on first sign-in. Hand each credential to the right person
privately.

| Purpose | Sign in with | First password |
|---------|--------------|----------------|
| Administrator | admin@cbe.ac.tz | admin123 |
| Director of Academics | director@cbe.ac.tz | director123 |
| Quality Assurance Manager | qam@cbe.ac.tz | qam123 |
| Curriculum Coordinator | coordinator@cbe.ac.tz | coord123 |
| Management | management@cbe.ac.tz | mgmt123 |

---

## What it does

- **Role-based access** — Curriculum Coordinator, QAM, Director of Academics and
  Administrator can enter and update records; **Management is view-only**. Each
  sign-in is bcrypt-hashed; sessions are signed JWTs in HTTP-only cookies.
- **Automatic status** — every curriculum is classified server-side from its
  validity date and the assessment date: **Valid**, **Due for review** (inside the
  lead window), **Expired**, **Pending approval**, or **Unverified**. Computation
  is server-side, so it cannot be tampered with from the browser.
- **8-month early warning** — anything expiring within the configurable lead time
  (default 8 months) is flagged for review, with a recommended action.
- **Dashboard** — KPI tiles, an action list (most urgent first), a status donut, a
  per-department breakdown and an expiry timeline.
- **Per-level curricula grouped by programme** — each NTA level is its own
  standalone curriculum record (with its own documents, validity date and status),
  and the programme is shown on every row. A programme running NTA 4–8 is five
  records; an NTA 9 masters is one. Add a whole programme in one step by ticking
  the levels — the system creates one record per level.
- **Shared curriculum, per-campus status** — a curriculum (programme + NTA level)
  is defined ONCE nationally: its approval/validation letter, validity date and
  documents are shared across all campuses. Each campus then carries its own
  status — whether it is **offered** there, whether the **department is recognised**
  to run it, whether the campus holds a **stamped copy**, and its **implementation/
  enrolment**. Dar es Salaam offers the full set; Dodoma, Mbeya and Mwanza offer
  subsets and may lack recognition even where a curriculum is nationally valid. A
  **Campus selector** switches every screen between the national view and a single
  campus, and a **Recognition-gaps** metric flags programmes offered without
  departmental recognition.
- **Curriculum register** — searchable, filterable table (by department, status,
  NTA level and campus). The national view shows each curriculum once with an
  "offered at" strip of per-campus recognition; a campus view shows that campus's
  recognition, stamped copy and implementation per curriculum.
- **Development & validation lifecycle** — every curriculum carries a development
  stage: *Pre-validation → Incorporation of validation committee comments →
  Post-validation → Validated – awaiting departmental recognition → Currently
  implemented*. A dashboard **pipeline** shows how many curricula sit at each stage,
  the register has a Stage column and filter, and each record's stage (with the
  responsible officer/committee and date) is editable.
- **Document library** — upload any number of documents per curriculum
  (validation/approval letters, the **full curriculum document**, stamped copies,
  departmental recognition, review reports). Large files supported (default **100 MB**
  each, set by `MAX_UPLOAD_MB`); PDF/Word/Excel/PowerPoint/images/ZIP. **Every
  signed-in key player — including view-only Management — can download** them;
  editing roles add or remove them.
- **Notifications** — dashboard alerts and browser **voice** work immediately;
  **email** and **SMS** send through a gateway when configured, and otherwise
  record a ready-to-send preview so nothing is lost. See `src/notify.js`.
- **Reports** — generate a summarised status report (all / requiring action /
  expired / due / documentation gaps / by department) with an official CBE
  letterhead; print to PDF or export to CSV.
- **Update & clean data** — editing roles can add and update records, **delete a
  record**, and the Administrator can **wipe all curricula** from Settings → Danger
  zone (e.g. to clear demo data before going live); the notifications log can be
  cleared too. Everything is captured in the audit log.
- **Works across many PCs** — deploy once to the cloud (or one office PC) and
  everyone opens the **same link** and shares **one database**; see
  `docs/DEPLOYMENT_GUIDE.md`.
- **Audit log** — every change is recorded with the person and time.

---

## Deployment (cloud)

**Render (recommended, one file):** New + → Blueprint → connect the repo with
`render.yaml`. It provisions a web service with a 1 GB persistent disk mounted at
`/var/data` (the database and uploaded documents persist across deploys) and
generates a `JWT_SECRET` for you. Keep `CTS_DEMO=0` for the real deployment.

**Docker (any host):**
```bash
docker build -t cbe-cts .
docker run -d -p 3000:3000 -v cbe_cts_data:/data --name cbe-cts cbe-cts
```

**Any Node host / Procfile (Railway, Heroku-style):** `web: node server.js`.

Set environment variables per `.env.example`. On any host with an ephemeral
filesystem, point `DATA_DIR` / `UPLOADS_DIR` at a mounted persistent disk.

### Turning on real email / SMS / voice
1. Set `SMTP_HOST` (email) and/or `SMS_API_KEY` (SMS/voice) as environment
   variables — see `.env.example`.
2. Add your provider's send call inside `sendEmail()` / `sendSms()` in
   `src/notify.js` (e.g. nodemailer for SMTP; Africa's Talking / Beem / Twilio for
   SMS & voice — all common in Tanzania).
3. Schedule a daily run of the "generate notifications" step (a cron job or the
   host's scheduler) so reminders go out without anyone opening the app.

---

## Project structure

```
cbe-cts/
├─ server.js            Express app & API
├─ src/
│  ├─ store.js          File-based JSON database + demo seed (Sept 2025 data)
│  ├─ auth.js           JWT cookie auth, bcrypt, role middleware
│  ├─ status.js         Status / expiry / alert engine (server-side)
│  └─ notify.js         Pluggable email / SMS notifier (+ voice on the client)
├─ public/              Front-end SPA (index.html, app.js, styles.css, assets)
├─ Dockerfile, render.yaml, Procfile, .env.example
├─ Start-CBE-CTS.bat, Start-CBE-CTS-DEMO.bat, start-mac-linux.sh
└─ docs/                Guides for each role
```

## Scaling note
The built-in JSON store is ideal for department/campus/college pilot scale and
saves atomically on every change. For heavy multi-campus concurrent writing,
swap `src/store.js` for a PostgreSQL-backed repository exposing the same API — no
other file needs to change.

*Source data for demo mode: “Curriculum Availability, Implementation and Validity
Verification — College of Business Education, Dar es Salaam Campus, September 2025.”*
