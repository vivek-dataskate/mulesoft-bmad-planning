# Mailchimp System Playbook

**System:** Mailchimp (email marketing platform)
**Maturity:** stub — not yet implemented
**Last updated:** 2026-05-11
**Clients using this playbook:** mrn

---

## Status

Stub created by Scout. Enriched by Architect after design, completed by CO after delivery.

## Known quirks (pre-design)

> **CONNECTOR COVERAGE RISK (FK-013 pattern):** `mule4-mailchimp-marketing-connector v1.0` is a low-version connector. Per FK-013, registry entries and actual Exchange connector coverage can diverge — especially for recently added connectors. Before committing to the native connector, Architect must verify on Anypoint Exchange that the following operations exist: (a) list member add/update, (b) audience/list management, (c) tag management, (d) webhook subscription. If coverage is partial → HTTP connector with API key auth is the fallback.

> **AUDIENCE LIMITS:** MRN has hit Mailchimp's audience (list) limit on their current plan. The Standard plan supports 5 audiences. Integration design should use tags and segments within a single audience rather than separate audiences per vendor — aligns with Mailchimp best practice and avoids limit issues.

> **UNSUBSCRIBE LOGIC:** MRN has vendor-specific communication lists. Unsubscribing from one vendor communication should NOT unsubscribe from all communications. This requires Mailchimp tag-based segmentation design rather than audience-based segmentation. Architect must model this carefully in the DWL transforms.

> **BEHAVIORAL DATA:** Mailchimp can push webhook events (opens, clicks, subscribes, unsubscribes) to a URL. This is how behavioral data flows back to Salesforce. Mailchimp Webhooks are available on all paid plans — confirm MRN plan tier via intake MC1.

## Supported objects

None yet — populated by Architect during MD run.

## Maturity log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-11 | 1 | Initial stub created by Scout (MRN engagement) | stub |
