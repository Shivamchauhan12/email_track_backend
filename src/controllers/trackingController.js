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

    // 1. Ignore HEAD requests (sent by security scanners/link checkers)
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_GIF.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private, proxy-revalidate'
      });
      return res.end(TRANSPARENT_GIF);
    }

    const { ip, userAgent } = getClientInfo(req);

    console.log(`📩 [Tracking] Email open request received for tracking ID: ${id}`);

    // 2. Ignore known bot/scanner User-Agents
    const isBot = /bot|spider|crawler|preview|prefetch|slurp|facebookexternalhit|bingpreview/i.test(userAgent);
    if (isBot) {
      console.log(`🤖 [Tracking] Ignored bot/scanner open request for ID: ${id} (${userAgent})`);
      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_GIF.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private, proxy-revalidate'
      });
      return res.end(TRANSPARENT_GIF);
    }

    const campaignContact = await prisma.campaignContact.findUnique({
      where: { trackingId: id }
    });

    if (!campaignContact) {
      console.warn(`⚠️ [Tracking] Tracking ID not found: ${id}`);
      res.writeHead(404, {
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_GIF.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private, proxy-revalidate'
      });
      return res.end(TRANSPARENT_GIF);
    }

    // 3. Ignore automatic mail server delivery pre-fetches (within 4 seconds of sending)
    if (campaignContact.sentAt && (new Date() - new Date(campaignContact.sentAt)) < 4000) {
      console.log(`⚠️ [Tracking] Ignored immediate delivery scan for contact ID: ${campaignContact.contactId}`);
      res.writeHead(200, {
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

    console.log(`✅ [Tracking] Open recorded for contact ID: ${campaignContact.contactId}`);

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

    console.log(`🖱️ [Tracking] Link click request received for code: ${code}`);

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
            update: {
              clickCount: { increment: 1 },
              clickedAt: new Date(),
              ipAddress: ip,
              userAgent
            },
            create: {
              linkId: link.id,
              campaignContactId: campaignContact.id,
              clickCount: 1,
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
