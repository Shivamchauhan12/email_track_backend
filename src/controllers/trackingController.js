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

    console.log(`\ud83d\udce9 [Tracking] Email open request received for tracking ID: ${id}`);

    const campaignContact = await prisma.campaignContact.findUnique({
      where: { trackingId: id }
    });

    if (!campaignContact) {
      console.warn(`\u26a0\ufe0f [Tracking] Tracking ID not found: ${id}`);
      res.writeHead(404, {
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_GIF.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private, proxy-revalidate'
      });
      return res.end(TRANSPARENT_GIF);
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

    console.log(`\u2705 [Tracking] Open recorded for contact ID: ${campaignContact.contactId}`);

    // Return transparent pixel
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': TRANSPARENT_GIF.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(TRANSPARENT_GIF);
  } catch (error) {
    console.error('Track open error:', error);
    res.writeHead(500, {
      'Content-Type': 'image/gif',
      'Content-Length': TRANSPARENT_GIF.length
    });
    res.end(TRANSPARENT_GIF);
  }
};

const trackClick = async (req, res) => {
  try {
    const { code } = req.params;
    const { ip, userAgent } = getClientInfo(req);

    console.log(`\ud83d\uddb1\ufe0f [Tracking] Link click request received for code: ${code}`);

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
        const transactions = [
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
        ];

        // Also record email open if it wasn't recorded yet (since link was clicked)
        if (!campaignContact.openedAt) {
          transactions.push(
            prisma.emailOpen.create({
              data: { campaignContactId: campaignContact.id, ipAddress: ip, userAgent }
            }),
            prisma.campaignContact.update({
              where: { id: campaignContact.id },
              data: { openedAt: new Date(), openCount: { increment: 1 } }
            })
          );
        }

        await prisma.$transaction(transactions);
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
