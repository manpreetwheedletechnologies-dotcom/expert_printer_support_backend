const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── New Lead Notification → sent to admin/team ───────────────────────────────
exports.sendLeadNotificationEmail = async (lead) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px;">
        🖨️ New Printer Support Lead
      </h2>
      <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
        <tr><td style="padding:8px; background:#f3f4f6; font-weight:bold; width:140px;">Name</td>
            <td style="padding:8px;">${lead.name}</td></tr>
        <tr><td style="padding:8px; background:#f3f4f6; font-weight:bold;">Email</td>
            <td style="padding:8px;">${lead.email}</td></tr>
        <tr><td style="padding:8px; background:#f3f4f6; font-weight:bold;">Phone</td>
            <td style="padding:8px;">${lead.phone || '—'}</td></tr>
        <tr><td style="padding:8px; background:#f3f4f6; font-weight:bold;">Printer</td>
            <td style="padding:8px;">${lead.printerBrand || '—'} ${lead.printerModel || ''}</td></tr>
        <tr><td style="padding:8px; background:#f3f4f6; font-weight:bold;">Issue</td>
            <td style="padding:8px;">${lead.issueType}</td></tr>
        <tr><td style="padding:8px; background:#f3f4f6; font-weight:bold;">Message</td>
            <td style="padding:8px;">${lead.message}</td></tr>
        <tr><td style="padding:8px; background:#f3f4f6; font-weight:bold;">Source</td>
            <td style="padding:8px;">${lead.source}</td></tr>
      </table>
      <p style="color:#6b7280; font-size:12px; margin-top:24px;">
        Submitted at ${new Date(lead.createdAt).toLocaleString()} · Printer Support Platform
      </p>
    </div>
  `;

  return transporter.sendMail({
    from: `"Printer Support" <${process.env.FROM_EMAIL}>`,
    to:   process.env.SMTP_USER,
    subject: `[New Lead] ${lead.name} — ${lead.issueType} issue`,
    html,
  });
};

// ─── Lead Assigned notification → sent to the assigned agent ─────────────────
exports.sendLeadAssignedEmail = async (lead, agent) => {
  return transporter.sendMail({
    from: `"Printer Support" <${process.env.FROM_EMAIL}>`,
    to:   agent.email,
    subject: `Lead Assigned: ${lead.name} — ${lead.issueType}`,
    html: `
      <p>Hi ${agent.name},</p>
      <p>A new lead has been assigned to you:</p>
      <ul>
        <li><strong>Customer:</strong> ${lead.name} (${lead.email})</li>
        <li><strong>Issue:</strong> ${lead.issueType}</li>
        <li><strong>Priority:</strong> ${lead.priority}</li>
      </ul>
      <p>Please log in to your dashboard to follow up.</p>
    `,
  });
};

// ─── Visitor lead confirmation → sent to visitor after contact form ───────────
exports.sendLeadConfirmationEmail = async (lead) => {
  return transporter.sendMail({
    from: `"Printer Support" <${process.env.FROM_EMAIL}>`,
    to:   lead.email,
    subject: `We received your query, ${lead.name}!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #2563eb;">Thanks for reaching out, ${lead.name}!</h2>
        <p>We've received your printer support query and our team will contact you shortly.</p>
        <p><strong>Your issue:</strong> ${lead.issueType}</p>
        <p><strong>Reference:</strong> ${lead._id}</p>
        <p>Expected response time: <strong>within 2 business hours</strong></p>
        <hr/>
        <p style="color:#6b7280; font-size:12px;">Printer Support Team</p>
      </div>
    `,
  });
};
