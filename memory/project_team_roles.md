---
name: project-team-roles
description: "DataSkate team roles — who is architect vs account/business lead, and their emails"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9fd630d8-6983-465e-8efc-d41ac9da20b7
---

Kailash Chanda (`kailash@dataskate.ai`) is the owner of the DataSkate integration service and the primary contact on all DataSkate-branded sales materials (flyer, pricing guide, architect guide). All footers in those documents must use `kailash@dataskate.ai`.

Vivek Yadlapalli (`vivek@dataskate.ai`) is the business/account lead — not the implementation or sales contact. His email stays as the Slack default invite address (hardcoded in slack-agent.js) but must not appear in footers of sales materials.

**Why:** Kailash owns implementation delivery and is the DataSkate service owner. Vivek manages client relationships and planning pipeline.

**How to apply:** Sales material footers (generate-flyer.js, generate-pdf.js, architect-guide.html) → `kailash@dataskate.ai`. Client-specific proposals and intake forms → use `architectEmail` from `project.json`. Slack invites → `vivek@dataskate.ai` (hardcoded, do not change).
