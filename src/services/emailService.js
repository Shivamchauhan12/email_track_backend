const nodemailer = require('nodemailer');
const prisma = require('../config/database');
const {
  generateTrackingPixel,
  injectTrackingPixel,
  replaceLinksWithTracking
} = require('../utils/helpers');

// ============================================================
// SMTP CONFIGURATION
// ============================================================

const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 587;

// Port 465 = direct SSL
// Port 587 = STARTTLS
const isSecure = smtpPort === 465;

const transporterOptions = {
  host: smtpHost,
  port: smtpPort,
  secure: isSecure,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },

  // Timeouts for cloud hosting
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000
};

console.log('📧 [EmailService] SMTP Configuration:', {
  host: smtpHost,
  port: smtpPort,
  secure: isSecure,
  user: process.env.SMTP_USER
});

const transporter = nodemailer.createTransport(transporterOptions);

// ============================================================
// VERIFY SMTP CONNECTION
// ============================================================

transporter.verify((error, success) => {
  if (error) {
    console.error('❌ [EmailService] SMTP Connection Error');
    console.error('Host:', smtpHost);
    console.error('Port:', smtpPort);
    console.error('Secure:', isSecure);
    console.error('Error:', error);

    console.error(
      '👉 Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in Render Environment Variables.'
    );

    console.error(
      '👉 For Gmail, SMTP_PASS must be a Google App Password, not your normal Gmail password.'
    );
  } else {
    console.log(
      `✅ [EmailService] SMTP server verified: ${smtpHost}:${smtpPort} (secure: ${isSecure})`
    );
  }
});

// ============================================================
// HTML → PLAIN TEXT
// ============================================================

const stripHtml = (html) => {
  if (!html) return '';

  return html
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// ============================================================
// SEND CAMPAIGN EMAILS
// ============================================================

const sendCampaignEmails = async (campaign) => {
  const baseUrl = process.env.APP_URL || 'http://localhost:5000';

  if (
    baseUrl.includes('localhost') ||
    baseUrl.includes('127.0.0.1')
  ) {
    console.warn(
      '⚠️ [Tracking Warning] APP_URL is set to localhost.'
    );

    console.warn(
      'External email clients cannot access localhost for tracking.'
    );

    console.warn(
      'Set APP_URL to your public Render URL.'
    );
  }

  let sentCount = 0;
  let errorCount = 0;

  const totalContacts = campaign.contacts.length;

  console.log(
    `🚀 [EmailService] Starting campaign for ${totalContacts} contacts`
  );

  for (let i = 0; i < totalContacts; i++) {
    const cc = campaign.contacts[i];

    try {
      // ========================================================
      // PERSONALIZE HTML
      // ========================================================

      let personalizedHtml = campaign.bodyHtml || '';

      personalizedHtml = personalizedHtml
        .replace(
          /{{firstName}}/g,
          cc.contact.firstName || ''
        )
        .replace(
          /{{lastName}}/g,
          cc.contact.lastName || ''
        )
        .replace(
          /{{email}}/g,
          cc.contact.email || ''
        )
        .replace(
          /{{company}}/g,
          cc.contact.company || ''
        );

      // ========================================================
      // TRACK LINKS
      // ========================================================

      personalizedHtml = replaceLinksWithTracking(
        personalizedHtml,
        campaign.links,
        baseUrl,
        cc.trackingId
      );

      // ========================================================
      // TRACKING PIXEL
      // ========================================================

      if (cc.trackingId) {
        const trackingPixel = generateTrackingPixel(
          cc.trackingId,
          baseUrl
        );

        personalizedHtml = injectTrackingPixel(
          personalizedHtml,
          trackingPixel
        );
      }

      // ========================================================
      // PLAIN TEXT VERSION
      // ========================================================

      const plainTextContent =
        campaign.bodyText &&
        campaign.bodyText.trim()
          ? campaign.bodyText
          : stripHtml(personalizedHtml);

      // ========================================================
      // SENDER
      // ========================================================

      const senderEmail =
        process.env.SMTP_USER || campaign.fromEmail;

      const senderName =
        campaign.fromName || campaign.fromEmail;

      // ========================================================
      // SEND EMAIL
      // ========================================================

      await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,

        replyTo: campaign.fromEmail,

        to: cc.contact.email,

        subject: campaign.subject,

        html: personalizedHtml,

        text: plainTextContent,

        headers: {
          'X-Mailer': 'EmailTracker Engine',
          Precedence: 'bulk'
        }
      });

      // ========================================================
      // UPDATE CONTACT STATUS
      // ========================================================

      await prisma.campaignContact.update({
        where: {
          id: cc.id
        },
        data: {
          sentAt: new Date()
        }
      });

      sentCount++;

      console.log(
        `✅ [EmailService] (${sentCount}/${totalContacts}) Email sent to ${cc.contact.email}`
      );

      // ========================================================
      // THROTTLING
      // ========================================================

      if (i < totalContacts - 1) {
        const baseInterval =
          parseInt(
            process.env.EMAIL_SEND_INTERVAL_MS,
            10
          ) || 3000;

        const randomJitter =
          Math.floor(Math.random() * 1500);

        const delayMs =
          baseInterval + randomJitter;

        console.log(
          `⏳ [EmailService] Waiting ${(delayMs / 1000).toFixed(
            1
          )}s before next email...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, delayMs)
        );
      }
    } catch (error) {
      console.error(
        `❌ [EmailService] Failed to send to ${cc.contact.email}`
      );

      console.error('Error:', error.message);

      errorCount++;
    }
  }

  // ==========================================================
  // UPDATE CAMPAIGN STATUS
  // ==========================================================

  await prisma.campaign.update({
    where: {
      id: campaign.id
    },
    data: {
      status:
        errorCount === campaign.contacts.length
          ? 'DRAFT'
          : 'SENT',

      sentAt: new Date()
    }
  });

  console.log(
    `🎉 [EmailService] Campaign ${campaign.id} completed.`
  );

  console.log(
    `📊 Sent: ${sentCount}, Errors: ${errorCount}`
  );
};

// ============================================================
// SEND TEST EMAIL
// ============================================================

const sendTestEmail = async (to, campaign) => {
  const baseUrl =
    process.env.APP_URL || 'http://localhost:5000';

  let testHtml = campaign.bodyHtml || '';

  // ==========================================================
  // PERSONALIZATION
  // ==========================================================

  testHtml = testHtml
    .replace(/{{firstName}}/g, 'Test')
    .replace(/{{lastName}}/g, 'User')
    .replace(/{{email}}/g, to)
    .replace(/{{company}}/g, 'Test Company');

  // ==========================================================
  // TRACK LINKS
  // ==========================================================

  testHtml = replaceLinksWithTracking(
    testHtml,
    campaign.links,
    baseUrl
  );

  // ==========================================================
  // SENDER
  // ==========================================================

  const senderEmail =
    process.env.SMTP_USER || campaign.fromEmail;

  const senderName =
    campaign.fromName || campaign.fromEmail;

  // ==========================================================
  // SEND TEST EMAIL
  // ==========================================================

  await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,

    replyTo: campaign.fromEmail,

    to,

    subject: `[TEST] ${campaign.subject}`,

    html: testHtml,

    text:
      campaign.bodyText ||
      stripHtml(testHtml)
  });

  console.log(
    `✅ [EmailService] Test email sent to ${to}`
  );
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  sendCampaignEmails,
  sendTestEmail
};