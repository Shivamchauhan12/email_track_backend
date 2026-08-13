const prisma = require('../config/database');

const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      totalCampaigns,
      totalContacts,
      totalSent,
      totalOpens,
      totalClicks,
      recentCampaigns
    ] = await Promise.all([
      prisma.campaign.count({ where: { userId } }),
      prisma.contact.count(),
      prisma.campaignContact.count({
        where: { campaign: { userId }, sentAt: { not: null } }
      }),
      prisma.emailOpen.count({
        where: { campaignContact: { campaign: { userId } } }
      }),
      prisma.linkClick.count({
        where: { link: { campaign: { userId } } }
      }),
      prisma.campaign.findMany({
        where: { userId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { contacts: true, links: true } },
          contacts: {
            select: { id: true, openedAt: true, openCount: true }
          }
        }
      })
    ]);

    const recentWithStats = recentCampaigns.map(c => {
      const totalRecipients = c.contacts.length;
      const uniqueOpens = c.contacts.filter(cc => cc.openedAt).length;
      return {
        ...c,
        stats: {
          totalRecipients,
          uniqueOpens,
          openRate: totalRecipients > 0 ? ((uniqueOpens / totalRecipients) * 100).toFixed(1) : 0
        }
      };
    });

    res.json({
      totalCampaigns,
      totalContacts,
      totalSent,
      totalOpens,
      totalClicks,
      recentCampaigns: recentWithStats
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

const getCampaignAnalytics = async (req, res) => {
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

    // Time series data for opens (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const opensByDay = await prisma.emailOpen.groupBy({
      by: ['openedAt'],
      where: {
        campaignContact: { campaignId: parseInt(id) },
        openedAt: { gte: thirtyDaysAgo }
      },
      _count: { id: true }
    });

    // Clicks by link
    const clicksByLink = await prisma.link.findMany({
      where: { campaignId: parseInt(id) },
      include: {
        _count: { select: { clicks: true } }
      }
    });

    // Engagement breakdown
    const totalRecipients = campaign.contacts.length;
    const opened = campaign.contacts.filter(cc => cc.openedAt).length;
    const clicked = new Set(campaign.contacts.filter(cc => cc.clicks.length > 0).map(cc => cc.contactId)).size;
    const notOpened = totalRecipients - opened;

    res.json({
      campaign,
      opensByDay: opensByDay.map(o => ({
        date: o.openedAt.toISOString().split('T')[0],
        count: o._count.id
      })),
      clicksByLink: clicksByLink.map(l => ({
        id: l.id,
        url: l.originalUrl,
        name: l.name || l.originalUrl,
        clicks: l._count.clicks
      })),
      engagement: {
        totalRecipients,
        opened,
        clicked,
        notOpened,
        openRate: totalRecipients > 0 ? ((opened / totalRecipients) * 100).toFixed(1) : 0,
        clickRate: totalRecipients > 0 ? ((clicked / totalRecipients) * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('Campaign analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

module.exports = { getDashboardStats, getCampaignAnalytics };
