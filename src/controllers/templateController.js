const prisma = require('../config/database');

// Predefined default starter templates
const DEFAULT_TEMPLATES = [
  {
    id: 'default-1',
    name: '🚀 Product Announcement',
    category: 'Marketing',
    subject: 'Introducing our new feature, {{firstName}}!',
    bodyHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
  <h2 style="color: #2563eb; margin-bottom: 16px;">Exciting News, {{firstName}}! 🎉</h2>
  <p>We are thrilled to announce our latest update designed to make your experience smoother and faster.</p>
  <div style="background-color: #f3f4f6; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 4px;">
    <h3 style="margin-top: 0; color: #111827;">What's New?</h3>
    <ul style="margin: 0; padding-left: 20px;">
      <li>Enhanced performance and speed</li>
      <li>Intuitive modern user interface</li>
      <li>24/7 dedicated support team</li>
    </ul>
  </div>
  <p>Click below to explore all the new features live in your account:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://example.com/dashboard" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Try It Now →</a>
  </div>
  <p style="color: #6b7280; font-size: 14px;">If you have any questions, reply directly to this email.</p>
  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin-top: 30px;" />
  <p style="font-size: 12px; color: #9ca3af; text-align: center;">Sent to {{email}} at {{company}}</p>
</div>
    `.trim()
  },
  {
    id: 'default-2',
    name: '👋 Welcome Email',
    category: 'Onboarding',
    subject: 'Welcome aboard, {{firstName}}!',
    bodyHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
  <h1 style="color: #059669;">Welcome to the Family, {{firstName}}! 👋</h1>
  <p>Thank you for signing up! We're super excited to have you with us.</p>
  <p>Here are 3 quick steps to get the most out of your account:</p>
  <ol style="line-height: 1.8;">
    <td><strong>Step 1:</strong> Complete your profile details.</td><br/>
    <td><strong>Step 2:</strong> Add your first set of contacts.</td><br/>
    <td><strong>Step 3:</strong> Launch your first email campaign!</td>
  </ol>
  <div style="text-align: center; margin: 25px 0;">
    <a href="https://example.com/getting-started" style="background-color: #059669; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Get Started Now</a>
  </div>
  <p style="color: #4b5563;">Best regards,<br/>The Team</p>
</div>
    `.trim()
  },
  {
    id: 'default-3',
    name: '🔥 Promotional Offer / Discount',
    category: 'Promotional',
    subject: 'Special 20% OFF just for you, {{firstName}}!',
    bodyHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
  <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 30px; text-align: center; border-radius: 12px;">
    <h1 style="margin: 0; font-size: 28px;">Exclusive Offer! 🔥</h1>
    <p style="font-size: 18px; margin-top: 10px; opacity: 0.9;">Enjoy 20% OFF your next purchase</p>
  </div>
  <div style="padding: 20px 0;">
    <p>Hi {{firstName}},</p>
    <p>We value your partnership with {{company}}. As a special thank you, use coupon code <strong>SPECIAL20</strong> at checkout!</p>
    <div style="text-align: center; margin: 25px 0;">
      <a href="https://example.com/checkout?code=SPECIAL20" style="background-color: #4f46e5; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Claim Your Discount</a>
    </div>
  </div>
</div>
    `.trim()
  }
];

const getTemplates = async (req, res) => {
  try {
    const customTemplates = await prisma.template.findMany({
      where: {
        OR: [
          { userId: req.user.id },
          { userId: null }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      defaults: DEFAULT_TEMPLATES,
      custom: customTemplates
    });
  } catch (error) {
    console.error('Get templates error:', error);
    // If DB error, still return defaults
    res.json({
      defaults: DEFAULT_TEMPLATES,
      custom: []
    });
  }
};

const getTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(id).startsWith('default-')) {
      const found = DEFAULT_TEMPLATES.find(t => t.id === id);
      if (!found) return res.status(404).json({ error: 'Template not found' });
      return res.json(found);
    }

    const template = await prisma.template.findFirst({
      where: { id: parseInt(id) }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
};

const createTemplate = async (req, res) => {
  try {
    const { name, subject, bodyHtml, category } = req.body;

    if (!name || !bodyHtml) {
      return res.status(400).json({ error: 'Template name and HTML content are required' });
    }

    const newTemplate = await prisma.template.create({
      data: {
        name,
        subject: subject || null,
        bodyHtml,
        category: category || 'Custom',
        userId: req.user.id
      }
    });

    res.status(201).json(newTemplate);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, bodyHtml, category } = req.body;

    const updated = await prisma.template.update({
      where: { id: parseInt(id) },
      data: { name, subject, bodyHtml, category }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update template' });
  }
};

const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.template.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
};

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate
};
