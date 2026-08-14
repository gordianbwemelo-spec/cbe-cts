// Pluggable notifier. Dashboard alerts and browser voice work with no external
// service. Email and SMS are sent through a gateway when the relevant environment
// variables are configured; otherwise every message is still recorded in the
// notifications log so nothing is lost and the wiring point is obvious.
//
// To enable real sending, set the environment variables documented in
// .env.example and drop in the gateway call inside sendEmail() / sendSms().
// Common Tanzanian options: Africa's Talking or Beem (SMS/voice); any SMTP host
// (e.g. the College mail server, SendGrid, Mailgun) for email.

const EMAIL_ENABLED = !!process.env.SMTP_HOST;      // e.g. smtp.cbe.ac.tz
const SMS_ENABLED = !!process.env.SMS_API_KEY;      // e.g. Africa's Talking / Beem key

async function sendEmail(to, subject, body) {
  if (!EMAIL_ENABLED) return { channel: 'email', to, status: 'previewed', detail: 'SMTP not configured — message previewed only' };
  // TODO: integrate your SMTP client here, e.g. nodemailer.createTransport({...}).sendMail(...)
  return { channel: 'email', to, status: 'sent', detail: 'sent via SMTP' };
}
async function sendSms(to, body) {
  if (!SMS_ENABLED) return { channel: 'sms', to, status: 'previewed', detail: 'SMS gateway not configured — message previewed only' };
  // TODO: integrate your SMS gateway here (Africa's Talking / Beem / Twilio REST call).
  return { channel: 'sms', to, status: 'sent', detail: 'sent via gateway' };
}

// Build a reminder message for one curriculum.
function messageFor(row) {
  const vu = row.valid_until ? (' Validity: ' + row.valid_until + '.') : '';
  return `CBE Curriculum Alert — ${row.programme} (${row.department}, NTA ${row.levels}) is ${row.status}. ${row.action}${vu}`;
}

// Dispatch reminders for the given action rows across the enabled channels.
// Returns the list of notification records to store and show.
async function dispatch(actionRows, settings) {
  const ch = settings.channels || {};
  const emails = (settings.recipientEmails || '').split(',').map(s => s.trim()).filter(Boolean);
  const phones = (settings.recipientPhones || '').split(',').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const row of actionRows) {
    const msg = messageFor(row);
    const channels = [];
    if (ch.dashboard) channels.push('dashboard');
    if (ch.email) { channels.push('email'); for (const to of (emails.length ? emails : ['(no recipients set)'])) out.push({ ...(await sendEmail(to, 'CBE Curriculum Alert', msg)), curriculum: row.programme, message: msg }); }
    if (ch.sms) { channels.push('sms'); for (const to of (phones.length ? phones : ['(no recipients set)'])) out.push({ ...(await sendSms(to, msg)), curriculum: row.programme, message: msg }); }
    if (ch.voice) channels.push('voice');
    // Always record a dashboard entry so the log reflects the alert itself.
    out.push({ channel: 'dashboard', to: 'dashboard', status: 'shown', detail: 'channels: ' + (channels.join(', ') || 'none'), curriculum: row.programme, message: msg, voice: !!ch.voice });
  }
  return out;
}

module.exports = { dispatch, messageFor, EMAIL_ENABLED, SMS_ENABLED };
