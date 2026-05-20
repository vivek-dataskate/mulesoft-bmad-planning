// docs/eleventy/_data/clients.js
//
// Scans projects/*/ and exposes a per-client array of metadata for every
// Eleventy template that needs to paginate over clients (portal, integration-deck,
// proposal, intake, corporate-brief).
//
// Each entry: {
//   slug,
//   meta: { ...project.json },
//   portal:           portal-content.json   (or null)
//   deck:             intake/integration-deck-content.json (or null)
//   proposal:         intake/proposal-content.json (or null)
//   corporateBrief:   intake/corporate-brief-content.json (or null)
//   intakeMd:         intake/intake-questionnaire-<slug>.md content (or null)
//   logoPath:         resolved portal URL of the client logo if a file exists
// }

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..', '..', '..');
const PORTAL = 'https://dataskateclients.web.app';

function resolveClientLogoPath(slug) {
  if (!slug) return null;
  for (const ext of ['.svg', '.png']) {
    if (fs.existsSync(path.join(ROOT, 'firebase', 'public', 'logos', slug + ext))) {
      return `${PORTAL}/logos/${slug}${ext}`;
    }
  }
  return null;
}

function readJsonSafe(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.warn(`⚠ Bad JSON at ${p}: ${e.message}`); return null; }
}

function readFileSafe(p) {
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

module.exports = function() {
  const projectsDir = path.join(ROOT, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  const out = [];
  for (const slug of fs.readdirSync(projectsDir)) {
    if (slug.startsWith('_') || slug.startsWith('.')) continue;
    const projDir = path.join(projectsDir, slug);
    if (!fs.statSync(projDir).isDirectory()) continue;
    const meta = readJsonSafe(path.join(projDir, 'project.json'));
    if (!meta) continue; // require a project.json to consider it a real client

    out.push({
      slug,
      meta,
      portal:         readJsonSafe(path.join(projDir, 'portal-content.json')),
      deck:           readJsonSafe(path.join(projDir, 'intake', 'integration-deck-content.json')),
      proposal:       readJsonSafe(path.join(projDir, 'intake', 'proposal-content.json')),
      corporateBrief: readJsonSafe(path.join(projDir, 'intake', 'corporate-brief-content.json')),
      intakeJson:     readJsonSafe(path.join(projDir, 'intake', 'intake-content.json')),
      intakeMd:       readFileSafe(path.join(projDir, 'intake', `intake-questionnaire-${slug}.md`)),
      logoPath:       resolveClientLogoPath(slug),
      clientName:     meta.displayName || meta.name || slug,
      frozen:         meta.frozen === true,
    });
  }
  return out;
};
