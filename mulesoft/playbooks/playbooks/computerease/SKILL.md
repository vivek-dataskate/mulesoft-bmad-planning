---
name: ComputerEase (Deltek)
description: ComputerEase by Deltek integration playbook — a Windows-based job-costing and accounting system for specialty/residential trade contractors (fencing, roofing, HVAC). NOT Deltek Costpoint/Vantagepoint. The playbook covers the non-standard CE Live Service relay connectivity, production-only API access, and the legacy-VM security and SPOF risks. Stub maturity. In use at peerless.
maturity: stub
whenToInvoke:
  - A confirmed flow reads from or writes to ComputerEase
  - Planning connectivity for ComputerEase (CE Live Service relay required — no direct internet API)
  - The client's ComputerEase API port/firewall must be discovered before CloudHub connectivity
  - Assessing single-super-admin SPOF or legacy-VM security exposure during scoping
  - Distinguishing ComputerEase from Deltek Costpoint/Vantagepoint
coverage:
  objects: []
  direction: [inbound, outbound]
  clients: [peerless]
  apiVersion: unknown (legacy Windows app via CE Live Service relay)
playbook: ./computerease_playbook.json
docs: ./computerease_playbook.md
---

# ComputerEase (Deltek) Playbook

Invoke when a flow touches ComputerEase — a legacy Windows accounting app, not a web API. Critical: traffic routes through Deltek's CE Live Service relay (Deltek must install/configure it first); no sandbox API (production only); non-standard port (discover via netstat); single-super-admin SPOF risk. Full quirks + p0Conditions in the linked JSON; narrative in the .md.
