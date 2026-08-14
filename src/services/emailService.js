const nodemailer = require('nodemailer');
const prisma = require('../config/database');
const { generateTrackingPixel, injectTrackingPixel, replaceLinksWithTracking } = require('../utils/helpers');

const isGmail = 
  !process.env.SMTP_HOST || 
  process.env.SMTP_HOST === 'smtp.gmail.com' || 
  (process.env.SMTP_USER && process.env.SMTP_USER.includes('@gmail.com'));

let transporterOptions;

if (isGmail) {
  // Gmail-specific configuration: uses built-in preset to bypass port 587 STARTTLS cloud timeouts
  transporterOptions = {
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  };
} else {
  // Generic SMTP setup with SSL (Port 465 by default for cloud compatibility)
  const port = parseInt(process.env.SMTP_PORT) || 465;
  const isSecure = process.env.SMTP_SECURE !== undefined 
    ? process.env.SMTP_SECURE === 'true' 
    : port === 465;

  transporterOptions = {
    host: process.env.SMTP_HOST,
    port: port,
    secure: isSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  };
}

const transporter = nodemailer.createTransport(transporterOptions);

// Verify SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ [EmailService] SMTP Connection Error:', error.message);
    console.error('👉 Make sure SMTP_USER and SMTP_PASS are set in Render Environment Variables and an App Password is used for Gmail!');
  } else {
    console.log('✅ [EmailService] SMTP server connection verified successfully.');
  }
});

const stripHtml = (html) => {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
};

const sendCampaignEmails = async (campaign) => {
  const baseUrl = process.env.APP_URL || 'http://localhost:5000';
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    console.warn('⚠️ [Tracking Warning] APP_URL is set to localhost. External email clients (e.g. Gmail) cannot fetch images from localhost. Set APP_URL in .env to a public URL (e.g., ngrok or domain) for tracking to work!');
  }
  let sentCount = 0;
  let errorCount = 0;
  const totalContacts = campaign.contacts.length;

  console.log(`🚀 [EmailService] Starting campaign send for ${totalContacts} contacts with anti-spam throttled intervals...`);

  for (let i = 0; i < totalContacts; i++) {
    const cc = campaign.contacts[i];
    try {
      // Generate personalized HTML with tracking
      let personalizedHtml = campaign.bodyHtml || '';

      // Replace personalization tags
      personalizedHtml = personalizedHtml
        .replace(/{{firstName}}/g, cc.contact.firstName || '')
        .replace(/{{lastName}}/g, cc.contact.lastName || '')
        .replace(/{{email}}/g, cc.contact.email)
        .replace(/{{company}}/g, cc.contact.company || '');

      // Replace links with tracking URLs (passing trackingId so clicks can link to contact)
      personalizedHtml = replaceLinksWithTracking(personalizedHtml, campaign.links, baseUrl, cc.trackingId);

      // Inject tracking pixel before </body> or </html> if present
      if (cc.trackingId) {
        const trackingPixel = generateTrackingPixel(cc.trackingId, baseUrl);
        personalizedHtml = injectTrackingPixel(personalizedHtml, trackingPixel);
      }

      // Plain text version (essential for anti-spam deliverability)
      const plainTextContent = campaign.bodyText && campaign.bodyText.trim()
        ? campaign.bodyText
        : stripHtml(personalizedHtml);

      const senderEmail = process.env.SMTP_USER || campaign.fromEmail;
      const senderName = campaign.fromName || campaign.fromEmail;

      // Send email with anti-spam headers
      await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        replyTo: campaign.fromEmail,
        to: cc.contact.email,
        subject: campaign.subject,
        html: personalizedHtml,
        text: plainTextContent,
        headers: {
          'X-Mailer': 'EmailTracker Engine',
          'Precedence': 'bulk'
        }
      });

      // Update sent status
      await prisma.campaignContact.update({
        where: { id: cc.id },
        data: { sentAt: new Date() }
      });

      sentCount++;
      console.log(`✅ [EmailService] (${sentCount}/${totalContacts}) Email sent to ${cc.contact.email}`);

      // Anti-spam interval delay between messages (if not last contact)
      if (i < totalContacts - 1) {
        const baseInterval = parseInt(process.env.EMAIL_SEND_INTERVAL_MS) || 3000;
        const randomJitter = Math.floor(Math.random() * 1500); // 0ms to 1500ms random delay
        const delayMs = baseInterval + randomJitter;

        console.log(`⏳ [Anti-Spam Throttling] Waiting ${(delayMs / 1000).toFixed(1)}s before sending next email...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`❌ [EmailService] Failed to send to ${cc.contact.email}:`, error.message);
      errorCount++;
    }
  }

  // Update campaign status
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { 
      status: errorCount === campaign.contacts.length ? 'DRAFT' : 'SENT',
      sentAt: new Date()
    }
  });

  console.log(`🎉 [EmailService] Campaign ${campaign.id} completed. Sent: ${sentCount}, Errors: ${errorCount}`);
};

const sendTestEmail = async (to, campaign) => {
  const baseUrl = process.env.APP_URL || 'http://localhost:5000';

  let testHtml = campaign.bodyHtml;
  testHtml = testHtml
    .replace(/{{firstName}}/g, 'Test')
    .replace(/{{lastName}}/g, 'User')
    .replace(/{{email}}/g, to)
    .replace(/{{company}}/g, 'Test Company');

  // Don't add tracking pixel for test emails
  testHtml = replaceLinksWithTracking(testHtml, campaign.links, baseUrl);

  const senderEmail = process.env.SMTP_USER || campaign.fromEmail;
  const senderName = campaign.fromName || campaign.fromEmail;

  await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    replyTo: campaign.fromEmail,
    to,
    subject: `[TEST] ${campaign.subject}`,
    html: testHtml,
    text: campaign.bodyText || ''
  });
};

module.exports = { sendCampaignEmails, sendTestEmail };
