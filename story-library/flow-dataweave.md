# Story Template: Complete DataWeave Transform (Per Flow)

**Story Type:** Per-Flow — Implementation
**Generated:** Once per entry in `decisions.json flows[]` that has a transformation
**Priority:** P1
**Standard:** `standards/MULESOFT_DESIGN_STANDARDS.md → DataWeave`
**Scaffold File:** `src/main/resources/dwl/{verb}-{source}-to-{target}.dwl`

---

## User Story

As a developer, I need all field mappings and business rules for `{flow-name}` implemented in an external `.dwl` file, so that the transformation logic is testable, cacheable, and maintainable independently of the flow XML.

---

## Acceptance Criteria

### File Location and Header
- [ ] DWL file at `src/main/resources/dwl/{verb}-{source}-to-{target}.dwl`
- [ ] Naming convention: `{verb}` = map | transform | enrich | filter | aggregate; `{source}` = source system key; `{target}` = target system key
- [ ] `%dw 2.0` header present on line 1
- [ ] Input content-type declared: `input payload application/json` (or `application/xml`, `application/csv`, etc. — match actual source format)
- [ ] Output format declared: `output application/json` (or target format)
- [ ] `indent=false` for large payloads (> 1000 records or > 100KB estimated output)

### Field Mappings — Confirmed
- [ ] All **Confirmed** mappings from `architecture.md → Flow: {flow-name} → Field Mapping Table` implemented
- [ ] Source field path matches actual API response shape from `api-discovery/{system}-contract.md` (if present)
- [ ] Target field path matches connector input schema from `connector-registry.json` or spec
- [ ] No approximations — confirmed mappings use exact field names, not guessed paths

### Field Mappings — Open Items
- [ ] Each **Open Item** field from `architecture.md → Flow: {flow-name} → Field Mapping Table` has a TODO comment:
  ```dataweave
  // TODO [OPEN ITEM]: {question from architecture.md} — confirm with client — best guess: {value}
  {target-field}: payload.{guessed-source-field}
  ```
- [ ] The `// TODO [OPEN ITEM]` placeholder generates a functional best-guess value — not a compile error
- [ ] Open Items are resolved and TODOs removed after Sprint 1 client confirmation (see `global-contract-confirmation` story)

### Business Rules
- [ ] Business rules from `architecture.md → Flow: {flow-name} → Business Rules` encoded with exact values
- [ ] Conditional logic uses exact rule from architecture.md — no approximations or "similar" logic
- [ ] Lookup values (status mappings, type codes, region mappings) match confirmed client values
- [ ] Semantic dissonance documented in architecture.md handled explicitly:
  - [ ] If same field name means different things in source vs. target: mapping comment explains the resolution
  - [ ] Never silently pass through a field that has different semantic meaning in source vs. target

### DWL Quality Rules
- [ ] No Java class usage (`java!` import) — DataWeave 2.0 native functions only
- [ ] No inline DataWeave in flow XML — this `.dwl` file is the only location for transform logic
- [ ] Comments only on non-obvious business rules — not on direct field copies (e.g., `// map orderId` is noise)
- [ ] Comments on intentionally omitted server-generated fields: `// id: omitted — server-generated`
- [ ] Complex transforms broken into named functions within the file (not monolithic output expression)

### Field Mapping Table
*(PM agent copies from architecture.md → Flow: {flow-name} → Field Mapping Table)*

| Status | Source Field | Source System | Target Field | Target System | Transform Rule |
|--------|-------------|--------------|-------------|--------------|----------------|
| Confirmed | `{source.field}` | `{system}` | `{target.field}` | `{system}` | {rule} |
| Open Item | `{source.field}` | `{system}` | `{target.field}` | `{system}` | {question — best guess: {value}} |

---

## Pattern-Specific DWL Notes

| Pattern | DWL Consideration |
|---------|------------------|
| B — event-driven | Platform Event payload is often a `payload.data.payload` envelope — unwrap before mapping |
| C — batch | DataWeave runs per record within batch step — no full-dataset operations; filter/map only |
| D — scheduled-sync | Watermark filter applied before transform: `payload filter $.lastModifiedDate > vars.watermark` |
| E — file-based-etl | Input content-type often `application/csv` or `application/xlsx` (use `dataweave-module-flatfile`) |
| F — cdc-streaming | CDC events include `ChangeType` (INSERT/UPDATE/DELETE) — handle all three cases explicitly |
| G — b2b-edi | DataWeave EDI module (`EDI:X12`, `EDI:EDIFACT`) — external `.dwl` for each transaction set |
| I — api-aggregation | Merge responses from N scatter-gather legs into one canonical response in a single transform |
| K — data-migration | Idempotent upsert key field must be set (e.g., external ID) — never omit even if null in source |

---

## Implementation Notes

- Reference: `standards/MULESOFT_DESIGN_STANDARDS.md → DataWeave`
- Scaffold generates `.dwl` stub with one comment per field mapping from architecture.md — developer completes each
- Reference the field mapping from `api-discovery/{system}-contract.md → Confirmed Working Endpoints` for exact POST body field names
- Semantic dissonance: always check `architecture.md → Semantic Dissonance Table` before writing field mappings
