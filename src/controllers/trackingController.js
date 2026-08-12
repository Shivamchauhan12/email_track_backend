const prisma = require('../config/database');
const { getClientInfo } = require('../utils/helpers');

// 1x1 transparent GIF pixel (base64 encoded)
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const trackOpen = async (req, res) => {
  try {
    const { id } = req.params;
    const { ip, userAgent } = getClientInfo(req);

    const campaignContact = await prisma.campaignContact.findUnique({
      where: { trackingId: id }
    });

    if (!campaignContact) {
      return res.status(404).end();
    }

    // Record open event
    await prisma.$transaction([
      prisma.emailOpen.create({
        data: {
          campaignContactId: campaignContact.id,
          ipAddress: ip,
          userAgent
        }
      }),
      prisma.campaignContact.update({
        where: { id: campaignContact.id },
        data: {
          openedAt: campaignContact.openedAt || new Date(),
          openCount: { increment: 1 }
        }
      })
    ]);

    // Return transparent pixel
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(TRANSPARENT_GIF);
  } catch (error) {
    console.error('Track open error:', error);
    res.status(500).end();
  }
};

const trackClick = async (req, res) => {
  try {
    const { code } = req.params;
    const { ip, userAgent } = getClientInfo(req);

    const link = await prisma.link.findUnique({
      where: { trackingCode: code }
    });

    if (!link) {
      return res.status(404).send('Link not found');
    }

    // Try to find campaignContact by tracking ID in query param
    const trackingId = req.query.tid;
    if (trackingId) {
      const campaignContact = await prisma.campaignContact.findUnique({
        where: { trackingId }
      });

      if (campaignContact) {
        await prisma.$transaction([
          prisma.linkClick.upsert({
            where: {
              linkId_campaignContactId: {
                linkId: link.id,
                campaignContactId: campaignContact.id
              }
            },
            update: { clickedAt: new Date(), ipAddress: ip, userAgent },
            create: {
              linkId: link.id,
              campaignContactId: campaignContact.id,
              ipAddress: ip,
              userAgent
            }
          }),
          prisma.link.update({
            where: { id: link.id },
            data: { clickCount: { increment: 1 } }
          })
        ]);
      }
    } else {
      // Anonymous click - just increment counter
      await prisma.link.update({
        where: { id: link.id },
        data: { clickCount: { increment: 1 } }
      });
    }

    // Redirect to original URL
    res.redirect(link.originalUrl);
  } catch (error) {
    console.error('Track click error:', error);
    res.status(500).send('Error tracking click');
  }
};

module.exports = { trackOpen, trackClick };
