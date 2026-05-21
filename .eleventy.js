// .eleventy.js
//
// Configures Eleventy as the HTML generator for all DataSkate per-client and
// resource documents.
//
// Layout: docs/eleventy/
//   _includes/        ← layouts + components (Nunjucks)
//     layouts/        ← base.njk and per-template wrappers
//     components/     ← one file per visual unit (flow-card, model-card, etc.)
//   _data/            ← shared data (about-dataskate, pricing-model, etc.)
//   site/             ← per-client + per-template entry pages
//
// Per-client data is mounted at `site/<template>/<client>.njk` with
// `templateData` pointing to projects/<client>/intake/<template>-content.json
// (or markdown) via Eleventy's computed-data layer.

'use strict';
const fs       = require('fs');
const path     = require('path');
const nunjucks = require('nunjucks');
const { mdToHtml, extractH1Title } = require('./commons/branding/md-to-html');

module.exports = function(eleventyConfig) {
  // Markdown-to-HTML filter.
  eleventyConfig.addFilter('mdToHtml', function(md) { return mdToHtml(md || ''); });
  eleventyConfig.addFilter('mdH1', function(md) { return extractH1Title(md || ''); });

  // Read a sibling file relative to the project root.
  eleventyConfig.addFilter('readFile', function(rel) {
    return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
  });

  // Pass tokens.css through unmodified
  eleventyConfig.addPassthroughCopy({
    'commons/branding/generated/tokens.css': 'tokens.css'
  });

  // Make the shared base CSS partial directly includable
  eleventyConfig.addPassthroughCopy({
    'commons/templates/shared-base.css.html': 'shared-base.css.html'
  });

  // Inline-include filter — read another file into the current template.
  eleventyConfig.addFilter('inline', function(relpath) {
    const abs = path.resolve(__dirname, relpath);
    return fs.readFileSync(abs, 'utf8');
  });

  // Case-insensitive startsWith — used by component templates to classify
  // sibling-brand signals ("unknown ..." styles italic + muted).
  eleventyConfig.addFilter('iStartsWith', function(s, prefix) {
    return String(s || '').toLowerCase().startsWith(String(prefix || '').toLowerCase());
  });

  // Strip scheme + trailing slash from a URL for display labels —
  // matches the inline .replace(/^https?:\/\//, '').replace(/\/$/, '') the
  // legacy buildCorporateBrief() does on entity.website.
  eleventyConfig.addFilter('domainOnly', function(url) {
    if (!url) return '';
    return String(url).replace(/^https?:\/\//, '').replace(/\/$/, '');
  });

  // HTML escape filter. Returns a Nunjucks SafeString so the explicit escape
  // is the ONLY escape — Nunjucks autoescape (on by default) would otherwise
  // double-escape the result (e.g. "M&A" → "M&amp;amp;A").
  eleventyConfig.addFilter('esc', function(s) {
    if (s == null) return new nunjucks.runtime.SafeString('');
    // Escape & < > " but NOT ' (apostrophes are valid in text + double-quoted attrs).
    const escaped = String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return new nunjucks.runtime.SafeString(escaped);
  });

  // Resolve a client's logo path.
  eleventyConfig.addShortcode('clientLogo', function(slug, clientName) {
    if (!slug) return '';
    const PORTAL = 'https://dataskateclients.web.app';
    for (const ext of ['.svg', '.png']) {
      const logoFile = path.join(__dirname, 'firebase/public/logos', slug + ext);
      if (fs.existsSync(logoFile)) {
        const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        return `<div class="client-logo-block"><div class="client-logo-sep"></div><img src="${esc(PORTAL + '/logos/' + slug + ext)}" alt="${esc(clientName||'')}" class="client-logo-img" onerror="this.parentNode.style.display='none'"></div>`;
      }
    }
    return '';
  });

  return {
    dir: {
      input:    'docs/eleventy/site',
      includes: '../_includes',   // relative to input dir
      data:     '../_data',
      output:   'docs/eleventy/_build'
    },
    // Use Nunjucks for all .njk templates and HTML files
    templateFormats: ['njk', 'html', 'md'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
};
