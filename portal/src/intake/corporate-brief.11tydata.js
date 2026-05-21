// Per-page computed data for the paginated corporate-brief entry.
// Exposes `brief` (the per-client corporate-brief payload) and `docTitle` to
// the layout. Filters to clients that have a corporate-brief-content.json.

module.exports = {
  eleventyComputed: {
    brief:    data => data.client && data.client.corporateBrief,
    docTitle: data => {
      const name = data.client
        && data.client.corporateBrief
        && data.client.corporateBrief.meta
        && data.client.corporateBrief.meta.clientName;
      return 'DataSkate × ' + (name || (data.client && data.client.slug) || 'Client') + ' — Corporate Brief';
    }
  }
};
