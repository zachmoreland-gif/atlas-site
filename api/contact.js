// Atlas Vision Systems - contact form endpoint (Vercel serverless)
// Sends lead notifications via Resend. Requires env var: RESEND_API_KEY
// From-address requires atlasvisionsystems.com verified in Resend.

const NOTIFY_TO = 'support@atlasvisionsystems.com';
const FROM = 'Atlas Website <notifications@atlasvisionsystems.com>';

const esc = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const row = (k, v) =>
  `<tr><td style="padding:8px 14px;border:1px solid #d7dde5;background:#f2f5f9;font-weight:600">${k}</td>` +
  `<td style="padding:8px 14px;border:1px solid #d7dde5">${esc(v) || '&mdash;'}</td></tr>`;

async function sendEmail(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return r;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, phone, property, message, company, contact_ref, js_token } = req.body || {};

  // Bot check. A filled honeypot only counts as a bot when the browser
  // JS token is missing: real visitors (even with autofill stuffing the
  // hidden field) always have the token; direct-POST bots never do.
  const isHuman = js_token === 'avs-human-2026';
  if ((company || contact_ref) && !isHuman) {
    console.log('Honeypot drop (no js_token):', { company: !!company, contact_ref: !!contact_ref });
    return res.status(200).json({ ok: true });
  }

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  // Lead notification to Atlas
  const notify = await sendEmail({
    from: FROM,
    to: [NOTIFY_TO],
    reply_to: String(email),
    subject: 'New walkthrough request from atlasvisionsystems.com',
    html:
      `<div style="font-family:Arial,sans-serif;color:#1b2733">` +
      `<h2 style="margin:0 0 12px">New walkthrough request</h2>` +
      `<p style="margin:0 0 16px">Submitted on atlasvisionsystems.com</p>` +
      `<table style="border-collapse:collapse;font-size:14px">` +
      row('Name', name) +
      row('Email', email) +
      row('Phone', phone) +
      row('Property / company', property) +
      row('Message', message) +
      `</table></div>`,
  });

  if (!notify.ok) {
    const detail = await notify.text().catch(() => '');
    console.error('Resend notify failed:', notify.status, detail);
    return res.status(502).json({ error: 'Email send failed' });
  }

  // Auto-reply to the lead - best effort, never fails the request.
  try {
    await sendEmail({
      from: FROM,
      to: [String(email)],
      reply_to: NOTIFY_TO,
      subject: 'We got your walkthrough request',
      html:
        `<div style="font-family:Arial,sans-serif;color:#1b2733;font-size:15px;line-height:1.6">` +
        `<p>Hi ${esc(name)},</p>` +
        `<p>Thanks for reaching out! Your free walkthrough request is in. We'll contact you within one business day to set up a time.</p>` +
        `<p>In the meantime, if it's urgent, just reply to this email or write us at ` +
        `<a href="mailto:${NOTIFY_TO}">${NOTIFY_TO}</a>.</p>` +
        `<p>Atlas Vision Systems<br>One vendor. One platform. No surprise fees.</p></div>`,
    });
  } catch (e) {
    console.error('Auto-reply failed:', e);
  }

  console.log('Lead sent:', String(email));
  return res.status(200).json({ ok: true });
}
