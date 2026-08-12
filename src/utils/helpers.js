const crypto = require('crypto');

const generateTrackingPixel = (trackingId, baseUrl) => {
  return `<img src="${baseUrl}/track/open/${trackingId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;" />`;
};

const replaceLinksWithTracking = (html, links, baseUrl) => {
  let modifiedHtml = html;
  links.forEach(link => {
    const trackingUrl = `${baseUrl}/track/click/${link.trackingCode}`;
    // Replace hrefs that match the original URL
    const regex = new RegExp(`href=["']${escapeRegex(link.originalUrl)}["']`, 'g');
    modifiedHtml = modifiedHtml.replace(regex, `href="${trackingUrl}"`);
  });
  return modifiedHtml;
};

const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const getClientInfo = (req) => {
  return {
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] || 'Unknown'
  };
};

module.exports = {
  generateTrackingPixel,
  replaceLinksWithTracking,
  getClientInfo
};
