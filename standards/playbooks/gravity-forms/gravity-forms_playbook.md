# Gravity Forms / WordPress System Playbook

**System:** Gravity Forms (WordPress form plugin) — inbound webhook source
**Maturity:** stub — not yet implemented
**Last updated:** 2026-05-11
**Clients using this playbook:** mrn

---

## Status

Stub created by Scout. Enriched by Architect after design, completed by CO after delivery.

## Known quirks (pre-design)

> **NO MULESOFT CONNECTOR:** There is no MuleSoft connector for WordPress or Gravity Forms. Integration is via inbound HTTP webhook (Gravity Forms Webhook Add-On POSTs to a MuleSoft HTTP listener) or outbound HTTP polling (Mule scheduler GETs WordPress REST API endpoint). Pattern J (webhook-ingestion) preferred if the Webhook Add-On is installed. Pattern D (scheduled-sync) fallback if not.

> **BLOCKER RISK:** Gravity Forms Webhook Add-On requires the Gravity Forms Developer or Elite license. If MRN's Gravity Forms install is on a Basic or Pro license, webhooks are not available. Confirm via intake WP1.

> **PAYLOAD FORMAT:** Gravity Forms webhook default is JSON with all form field data. Format depends on the form configuration. A sample payload is needed before building the DWL transform.

> **SMTP ISSUE (out of scope):** Client mentioned an SMTP issue preventing automated welcome emails. This is a WordPress/Gravity Forms SMTP configuration issue — not a MuleSoft scope item. Mule's UC1 (onboarding flow) assumes the form submission arrives correctly; the email notification is sent via Mailchimp through MuleSoft, bypassing WordPress SMTP entirely.

## Supported objects

None yet — populated by Architect during MD run.

## Maturity log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-11 | 1 | Initial stub created by Scout (MRN engagement) | stub |
