const crypto = require('crypto');
const prisma = require('../config/database');
const emailService = require('../services/emailService');

const getCampaigns = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { userId: req.user.id };
    if (status) where.status = status;

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { contacts: true, links: true }
          },
          contacts: {
            select: {
              id: true,
              openedAt: true,
              openCount: true
            }
          }
        }
      }),
      prisma.campaign.count({ where })
    ]);

    // Add computed stats
    const campaignsWithStats = campaigns.map(c => {
      const totalRecipients = c.contacts.length;
      const uniqueOpens = c.contacts.filter(cc => cc.openedAt).length;
      const totalOpens = c.contacts.reduce((sum, cc) => sum + cc.openCount, 0);
      return {
        ...c,
        stats: {
          totalRecipients,
          uniqueOpens,
          totalOpens,
          openRate: totalRecipients > 0 ? ((uniqueOpens / totalRecipients) * 100).toFixed(1) : 0
        }
      };
    });

    res.json({ campaigns: campaignsWithStats, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
};

const getCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(id), userId: req.user.id },
      include: {
        contacts: {
          include: {
            contact: true,
            opens: { orderBy: { openedAt: 'desc' } },
            clicks: {
              include: { link: true },
              orderBy: { clickedAt: 'desc' }
            }
          }
        },
        links: {
          include: {
            _count: { select: { clicks: true } }
          }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Calculate stats
    const totalRecipients = campaign.contacts.length;
    const uniqueOpens = campaign.contacts.filter(cc => cc.openedAt).length;
    const totalOpens = campaign.contacts.reduce((sum, cc) => sum + cc.openCount, 0);
    const totalClicks = campaign.contacts.reduce((sum, cc) => sum + cc.clicks.length, 0);
    const uniqueClickers = new Set(campaign.contacts.filter(cc => cc.clicks.length > 0).map(cc => cc.contactId)).size;

    res.json({
      ...campaign,
      stats: {
        totalRecipients,
        uniqueOpens,
        totalOpens,
        openRate: totalRecipients > 0 ? ((uniqueOpens / totalRecipients) * 100).toFixed(1) : 0,
        totalClicks,
        uniqueClickers,
        clickRate: totalRecipients > 0 ? ((uniqueClickers / totalRecipients) * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
};

const createCampaign = async (req, res) => {
  try {
    const { name, subject, bodyHtml, bodyText, fromEmail, fromName, contactIds } = req.body;

    if (!name || !subject || !bodyHtml || !fromEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract links from HTML
    const linkRegex = /href=["'](https?:\/\/[^"']+)["']/g;
    const links = [];
    let match;
    while ((match = linkRegex.exec(bodyHtml)) !== null) {
      if (!links.includes(match[1])) {
        links.push(match[1]);
      }
    }

    const campaign = await prisma.$transaction(async (tx) => {
      // Create campaign
      const newCampaign = await tx.campaign.create({
        data: {
          name,
          subject,
          bodyHtml,
          bodyText,
          fromEmail,
          fromName,
          userId: req.user.id,
          status: 'DRAFT'
        }
      });

      // Create trackable links
      if (links.length > 0) {
        await tx.link.createMany({
          data: links.map(url => ({
            campaignId: newCampaign.id,
            originalUrl: url,
            trackingCode: crypto.randomUUID()
          }))
        });
      }

      // Associate contacts if provided
      if (contactIds && contactIds.length > 0) {
        await tx.campaignContact.createMany({
          data: contactIds.map(contactId => ({
            campaignId: newCampaign.id,
            contactId: parseInt(contactId),
            trackingId: crypto.randomUUID()
          })),
          skipDuplicates: true
        });
      }

      return newCampaign;
    });

    res.status(201).json(campaign);
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
};

const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, bodyHtml, bodyText, fromEmail, fromName, contactIds } = req.body;

    const campaign = await prisma.$transaction(async (tx) => {
      // Update campaign
      const updated = await tx.campaign.update({
        where: { id: parseInt(id) },
        data: { name, subject, bodyHtml, bodyText, fromEmail, fromName }
      });

      // Re-extract and update links if bodyHtml changed
      if (bodyHtml) {
        await tx.link.deleteMany({ where: { campaignId: parseInt(id) } });
        const linkRegex = /href=["'](https?:\/\/[^"']+)["']/g;
        const links = [];
        let match;
        while ((match = linkRegex.exec(bodyHtml)) !== null) {
          if (!links.includes(match[1])) {
            links.push(match[1]);
          }
        }
        if (links.length > 0) {
          await tx.link.createMany({
            data: links.map(url => ({
              campaignId: parseInt(id),
              originalUrl: url,
              trackingCode: crypto.randomUUID()
            }))
          });
        }
      }

      // Update contacts if provided
      if (contactIds) {
        await tx.campaignContact.deleteMany({ where: { campaignId: parseInt(id) } });
        if (contactIds.length > 0) {
          await tx.campaignContact.createMany({
            data: contactIds.map(contactId => ({
              campaignId: parseInt(id),
              contactId: parseInt(contactId),
              trackingId: crypto.randomUUID()
            }))
          });
        }
      }

      return updated;
    });

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update campaign' });
  }
};

const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.campaign.delete({
      where: { id: parseInt(id), userId: req.user.id }
    });
    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
};

const sendCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await prisma.campaign.findFirst({
      where: { id: parseInt(id), userId: req.user.id },
      include: {
        contacts: { include: { contact: true } },
        links: true
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status === 'SENT') {
      return res.status(400).json({ error: 'Campaign already sent' });
    }

    if (campaign.contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts in campaign' });
    }

    // Update status to sending
    await prisma.campaign.update({
      where: { id: parseInt(id) },
      data: { status: 'SENDING' }
    });

    // Send emails asynchronously
    emailService.sendCampaignEmails(campaign);

    res.json({ message: 'Campaign sending started', totalRecipients: campaign.contacts.length });
  } catch (error) {
    console.error('Send campaign error:', error);
    res.status(500).json({ error: 'Failed to send campaign' });
  }
};

module.exports = {
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  sendCampaign
};
