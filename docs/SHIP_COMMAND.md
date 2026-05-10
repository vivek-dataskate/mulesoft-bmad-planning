# /ship Command Spec

One-shot command to bootstrap a client repo from this internal planning repo.
Run manually after scaffolding is built and tested here. Never run automatically.

---

## What it does

Given a `{client-slug}` (e.g. `zyris`), `/ship`:

1. Creates a new GitHub repo named `{client-slug}-integrations`
2. Pushes use case code from `projects/{client-slug}/use-case-*/` to client repo root
3. Pushes planning artifacts to client repo `docs/`:
   - `prd.md`
   - `architecture/decisions/`
   - `planning/epics/`
   - `planning/sprints/`
   - `README.md`
4. Installs BMAD config (`.claude/`) in client repo
5. Sets up GitHub Pages + GitHub Actions for dashboard auto-deploy
6. Transforms child `pom.xml` files in each use case:
   - Updates `groupId` from `com.mycompany` / Anypoint UUID → `com.{client-slug}`
   - Replaces hardcoded `mule.maven.plugin.version` value with `${mule.maven.plugin.version}`
   - Adds `<parent>` block pointing to the root aggregator pom
7. Copies root aggregator `pom.xml` as-is (already correct — no transformation needed)

---

## What it does NOT push

| What | Why |
|------|-----|
| `projects/{client-slug}/internal/` | Discovery notes, strategy, pricing — internal IP |
| `docs/FIELD_KNOWLEDGE.md` | Internal lessons learned |
| `docs/PLANNING_CONTEXT.md` | Internal planning context |
| `standards/`, `templates/`, `_bmad/` | Internal tooling — not client deliverables |

---

## Client repo structure produced

```
{client-slug}-integrations/
  use-case-1/             ← transformed Maven project
  use-case-2/
  use-case-N/
  pom.xml                 ← root aggregator (unchanged)
  docs/
    prd.md
    architecture/decisions/
    planning/epics/
    planning/sprints/
    README.md
  .claude/                ← BMAD installed
  dashboard/              ← GitHub Pages
  .github/workflows/      ← auto-deploy dashboard on push
```

---

## pom.xml transformation detail

Each child `pom.xml` gets:

```xml
<!-- Added at top of <project> -->
<parent>
  <groupId>com.{client-slug}</groupId>
  <artifactId>{client-slug}-integrations</artifactId>
  <version>1.0.0-SNAPSHOT</version>
</parent>

<!-- groupId updated -->
<groupId>com.{client-slug}</groupId>

<!-- hardcoded version removed — inherited from parent property -->
<!-- BEFORE: <mule.maven.plugin.version>4.6.1</mule.maven.plugin.version> -->
<!-- AFTER:  property removed from child; resolved via ${mule.maven.plugin.version} from parent -->
```

---

## Not yet built

- [ ] GitHub repo creation via `gh repo create`
- [ ] File copy + transformation logic
- [ ] BMAD config install
- [ ] GitHub Pages + Actions setup
