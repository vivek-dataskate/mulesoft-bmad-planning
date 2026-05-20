// Per-page computed data for integration-deck pages.
// integration-deck is a SHELL only — content fetched from Firestore at runtime.
// We only need slug, clientName, clientLogoPath at build time.

module.exports = {
  eleventyComputed: {
    slug:           data => data.client && data.client.slug,
    clientName:     data => data.client && data.client.clientName,
    clientLogoPath: data => data.client && data.client.logoPath,
    docTitle:       data => {
      const name = data.client && data.client.clientName;
      return 'Architect Pitch Kit — ' + (name || (data.client && data.client.slug) || 'DataSkate');
    }
  }
};
