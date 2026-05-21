# PharmacyHub System Playbook

**System:** PharmacyHub (pharmaceutical utilization reporting vendor)
**Maturity:** stub — not yet implemented
**Last updated:** 2026-05-11
**Clients using this playbook:** mrn-healthcare

---

## Status

Stub created by Scout. Enriched by Architect after design, completed by CO after delivery.

## Known quirks (pre-design)

> **UNKNOWN SYSTEM:** PharmacyHub is not a widely known SaaS platform and has no MuleSoft native connector. Integration is SFTP-only per MRN scoping diagram ("Considering only SFTP"). This is a data vendor that provides utilization reports for GPO contracts — a pharmacy purchasing data aggregator for the aesthetics/med spa vertical.

> **FILE-BASED INTEGRATION:** MuleSoft will poll an SFTP location on a schedule, pick up PharmacyHub report files, parse, transform, and upsert utilization records to Salesforce. Pattern E (file-based-etl) is the expected primary pattern.

> **BLOCKER:** File format (CSV, XML, fixed-width?), file naming convention, and SFTP server credentials are all unknown as of 2026-05-11. Architect cannot design the DataWeave transform or SFTP connector config without a sample file from the client.

> **SFTP EPHEMERALITY WARNING:** CloudHub 2.0 local filesystem is ephemeral — all file processing must use the SFTP connector directly. Files cannot be copied to local disk for processing. The SFTP connector reads and processes files in-stream.

## Supported objects

None yet — populated by Architect during MD run.

## Maturity log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-11 | 1 | Initial stub created by Scout (MRN engagement) | stub |
