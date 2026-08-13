const nodemailer = require('nodemailer');
const prisma = require('../config/database');
const { generateTrackingPixel, injectTrackingPixel, replaceLinksWithTracking } = require('../utils/helpers');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100
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

      // Send email with anti-spam headers
      await transporter.sendMail({
        from: `"${campaign.fromName || campaign.fromEmail}" <${campaign.fromEmail}>`,
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

  await transporter.sendMail({
    from: `"${campaign.fromName || campaign.fromEmail}" <${campaign.fromEmail}>`,
    to,
    subject: `[TEST] ${campaign.subject}`,
    html: testHtml,
    text: campaign.bodyText || ''
  });
};

module.exports = { sendCampaignEmails, sendTestEmail };
