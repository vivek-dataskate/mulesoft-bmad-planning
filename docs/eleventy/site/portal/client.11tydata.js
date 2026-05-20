// Per-page computed data for the paginated client-portal entry.
// Exposes `portal` (the per-client portal payload) and `docTitle` to the layout.
// Filters to clients that have a portal-content.json (not every project does).

module.exports = {
  eleventyComputed: {
    portal:   data => data.client && data.client.portal,
    docTitle: data => {
      const name = data.client && data.client.portal && data.client.portal.meta && data.client.portal.meta.clientName;
      return (name || (data.client && data.client.slug) || 'Client') + ' — Engagement Portal';
    }
  }
};
