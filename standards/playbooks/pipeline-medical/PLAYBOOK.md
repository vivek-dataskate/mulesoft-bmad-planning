# Pipeline Medical System Playbook

**System:** Pipeline Medical (medical/pharmaceutical utilization reporting vendor)
**Maturity:** stub — not yet implemented
**Last updated:** 2026-05-11
**Clients using this playbook:** mrn-healthcare

---

## Status

Stub created by Scout. Enriched by Architect after design, completed by CO after delivery.

## Known quirks (pre-design)

> **UNKNOWN SYSTEM:** Pipeline Medical is not a widely known SaaS platform and has no MuleSoft native connector. Integration is SFTP-only per MRN scoping diagram ("Considering only SFTP"). Similar role to PharmacyHub — a data vendor providing contract utilization reports for GPO analytics.

> **FILE-BASED INTEGRATION:** MuleSoft will poll an SFTP location on a schedule, pick up Pipeline Medical report files, parse, transform, and upsert utilization records to Salesforce. Pattern E (file-based-etl) is the expected primary pattern.

> **BLOCKER:** File format, naming convention, and SFTP server credentials are unknown as of 2026-05-11. Confirm in intake questions PM1-PM3. Must be treated as a separate flow from PharmacyHub (UC8) — no-combine rule applies.

> **SAME SFTP SERVER OR DIFFERENT?** Open question in intake (UC9-Q1). If PharmacyHub and Pipeline Medical share an SFTP host, the same SFTP connector config can be reused but with separate file paths. Separate flow files are still required (no-combine rule).

> **SFTP EPHEMERALITY WARNING:** Same as PharmacyHub playbook. CloudHub 2.0 local filesystem is ephemeral — use SFTP connector in-stream only.

## Supported objects

None yet — populated by Architect during MD run.

## Maturity log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-11 | 1 | Initial stub created by Scout (MRN engagement) | stub |
