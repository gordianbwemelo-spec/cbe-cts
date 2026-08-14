# Deployment Guide — one shared web link for all PCs

Goal: run the system **once in the cloud** so everyone (Coordinator, QAM, Director,
Management) opens the **same web link** from any PC or phone and sees **one shared
database**. Data updates and deletions by one person are instantly visible to all.

---

## Recommended: Render.com (free/low-cost, one-file setup)

You need: this project in a GitHub repository, and a free Render account.

1. **Put the project on GitHub.** Create a new repository and upload the contents
   of the `cbe-cts` folder (the folder that contains `server.js` and `render.yaml`).
2. **Create the service on Render.** Sign in at render.com →
   **New +** → **Blueprint** → connect your GitHub → pick the repo. Render reads
   `render.yaml` automatically and shows a service named **cbe-cts**.
3. **Apply.** Render builds it, attaches a **1 GB persistent disk** at `/var/data`
   (so the database and uploaded documents survive restarts and updates) and
   generates a secure `JWT_SECRET` for you. `CTS_DEMO` is `0` (real, empty).
4. **Open the URL.** Render gives you a link like
   `https://cbe-cts.onrender.com`. That is the link you share with the College.
5. **First sign-in.** Use the core accounts below; each person sets their own
   password on first sign-in. Change/disable accounts under **Users** (admin).

| Purpose | Sign in with | First password |
|---------|--------------|----------------|
| Administrator | admin@cbe.ac.tz | admin123 |
| Director of Academics | director@cbe.ac.tz | director123 |
| Quality Assurance Manager | qam@cbe.ac.tz | qam123 |
| Curriculum Coordinator | coordinator@cbe.ac.tz | coord123 |
| Management | management@cbe.ac.tz | mgmt123 |

> The cloud service starts **empty**. To load the September 2025 sample data for a
> demo instead, set `CTS_DEMO=1` in the Render dashboard (Environment) — but use a
> separate instance for that, never the real one.

### Custom college domain (optional)
In Render → your service → **Settings → Custom Domains**, add e.g.
`curriculum.cbe.ac.tz` and point the DNS record as Render instructs.

---

## Alternative: Docker on any server (VPS or on-prem)
```
docker build -t cbe-cts .
docker run -d -p 80:3000 -v cbe_cts_data:/data --restart unless-stopped --name cbe-cts cbe-cts
```
Everyone opens `http://SERVER-IP` (or your domain). The named volume
`cbe_cts_data` holds the one shared database.

---

## Alternative: one office PC on the local network (no internet)
Run it on one always-on PC:
```
npm install
npm start
```
Find that PC's IP (Windows: `ipconfig`; Mac/Linux: `ifconfig`), e.g. `192.168.1.20`.
Others on the same office network open `http://192.168.1.20:3000`. Allow Node
through that PC's firewall on port 3000. One shared database lives on that PC —
back up its `data/db.json`.

> Running a **separate copy on each PC** gives each PC its **own** data (not
> shared). Use that only for individual trials.

---

## Updating & cleaning data (all deployments)
- **Update** any record: sign in as an editing role → Curriculum Register → Open →
  Edit; or Add / Update. Review stage and documents update the same way.
- **Delete one record:** open it → **Delete record**.
- **Wipe all records** (e.g. to clear the demo data before going live):
  **Administrator → Settings → Danger zone**, type `DELETE ALL`, confirm.
- **Clear the notifications log:** Notifications → **Clear log**.
- Every change is written to the **Audit Log** (who and when).

## Storing large curriculum documents
Uploaded documents live under `UPLOADS_DIR` on the persistent disk. Full curriculum
documents can be large, so the per-file limit defaults to **100 MB**
(`MAX_UPLOAD_MB`). Size the disk for the total you expect: on Render, raise the
disk `sizeGB` in `render.yaml` (e.g. 5–10 GB) before curricula accumulate; on
Docker, the named volume grows with the host disk. If you upload very large files,
also raise `MAX_UPLOAD_MB`.

## Backups
The entire database is the single file `data/db.json` (plus the `uploads/` folder
for attachments). On Render/Docker these live on the persistent disk/volume — copy
them periodically. To move to another host, copy those over and start the app.

## Email / SMS / voice
Dashboard alerts and voice work with no setup. For automatic **email/SMS/voice**,
set `SMTP_HOST` and/or `SMS_API_KEY` (see `.env.example`) and add your provider
call in `src/notify.js` (Africa's Talking, Beem or Twilio for SMS/voice; any SMTP
for email). Then schedule a daily "generate notifications" run on the host.
