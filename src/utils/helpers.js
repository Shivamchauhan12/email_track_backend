const generateTrackingPixel = (trackingId, baseUrl) => {
  const url = `${baseUrl.replace(/\/$/, '')}/track/open/${trackingId}`;
  return `<img src="${url}" alt="" width="1" height="1" border="0" style="display:none;width:1px;height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;" />`;
};

const injectTrackingPixel = (html, trackingPixel) => {
  if (!html) return trackingPixel;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${trackingPixel}</body>`);
  }
  if (html.includes('</html>')) {
    return html.replace('</html>', `${trackingPixel}</html>`);
  }
  return html + trackingPixel;
};

const replaceLinksWithTracking = (html, links, baseUrl, trackingId = null) => {
  if (!html || !links) return html;
  let modifiedHtml = html;
  links.forEach(link => {
    const tidParam = trackingId ? `?tid=${trackingId}` : '';
    const trackingUrl = `${baseUrl.replace(/\/$/, '')}/track/click/${link.trackingCode}${tidParam}`;
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
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  let ip = Array.isArray(rawIp) ? rawIp[0] : (typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : String(rawIp));
  return {
    ip: ip || 'Unknown',
    userAgent: req.headers['user-agent'] || 'Unknown'
  };
};

module.exports = {
  generateTrackingPixel,
  injectTrackingPixel,
  replaceLinksWithTracking,
  getClientInfo
};
