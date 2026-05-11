#!/usr/bin/env bash
# .devcontainer/post-create.sh
#
# Silent one-time setup for {{CLIENT_DISPLAY_NAME}} MuleSoft dev environment.
# Runs automatically on Codespace creation — no prompts, no manual steps.
# All output is captured in /tmp/devcontainer-setup.log.
#
# What this does:
#   1. Install MuleSoft MCP server (connector registry + Exchange queries)
#   2. Configure Claude Code MCP so agents can query Exchange from this repo
#   3. Install BMAD developer skills (dev agent, sprint status)
#   4. Write Maven settings.xml (Anypoint Exchange + CloudHub deploy repos)
#   5. Pre-warm Maven dependency cache (~3-5 min, happens in background)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="/tmp/devcontainer-setup.log"

log()  { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
ok()   { echo "[$(date '+%H:%M:%S')] ✓ $*" | tee -a "$LOG"; }
warn() { echo "[$(date '+%H:%M:%S')] ⚠  $*" | tee -a "$LOG"; }

log "======================================================"
log "  {{CLIENT_DISPLAY_NAME}} — MuleSoft Environment Setup"
log "======================================================"
log ""

# ─── 1. MuleSoft MCP Server ───────────────────────────────────────────────────

log "Step 1/5 — Installing MuleSoft MCP server..."
if npm install -g mulesoft-mcp-server --silent --no-progress 2>>"$LOG"; then
  ok "MuleSoft MCP server installed"
else
  warn "MuleSoft MCP install failed — run manually: npm install -g mulesoft-mcp-server"
fi

# ─── 2. Claude Code MCP Configuration ────────────────────────────────────────

log "Step 2/5 — Configuring Claude Code MCP..."
mkdir -p "$HOME/.claude"

# Write MCP server config for Claude Code.
# claude-code reads this file to discover available MCP servers.
cat > "$HOME/.claude/mcp_servers.json" << 'MCPEOF'
{
  "mcpServers": {
    "mulesoft": {
      "command": "npx",
      "args": ["-y", "mulesoft-mcp-server"],
      "description": "MuleSoft Exchange connector search and asset discovery"
    }
  }
}
MCPEOF
ok "Claude Code MCP configured (mulesoft server)"

# ─── 3. BMAD Developer Skills Installation ───────────────────────────────────

log "Step 3/5 — Installing BMAD developer skills..."

# Create BMAD project config for the developer role.
# This configures the Amelia (dev) agent and sprint-status skill
# without the planning agents (Analyst, Architect, PM) which live in the planning repo.
mkdir -p "$REPO_ROOT/_bmad/core" "$REPO_ROOT/_bmad/custom"

# Only write if config doesn't already exist (avoid overwriting on container rebuild)
if [ ! -f "$REPO_ROOT/_bmad/config.toml" ]; then
  cat > "$REPO_ROOT/_bmad/config.toml" << 'BMADEOF'
# ─────────────────────────────────────────────────────────────────
# BMAD configuration for {{CLIENT_DISPLAY_NAME}} developer repo.
# Developer role: Amelia (Dev Agent) — implements, tests, deploys.
# Planning agents (Analyst, Architect, PM) are in the planning repo.
# ─────────────────────────────────────────────────────────────────

[core]
project_name   = "{{ARTIFACT_ID}}"
output_folder  = "{project-root}/_bmad-output"

[agents.bmad-agent-dev]
module = "bmm"
team   = "software-development"
name   = "Amelia"
title  = "MuleSoft Developer"

[modules.bmm]
implementation_artifacts = "{project-root}/_bmad-output"
project_knowledge        = "{project-root}/src"
BMADEOF
  ok "BMAD config written"
else
  ok "BMAD config already exists — skipped"
fi

# BMAD skills are shipped by the scaffold generator (Option B — selective skills only).
# .agents/skills/bmad-agent-dev/ and .agents/skills/bmad-sprint-status/ are already
# present in this repo. We do NOT run `npx bmad-method@latest install` here because
# that would add all planning agents (Scout, Analyst, Architect, PM) to this repo —
# those belong in the planning repo only. The developer has exactly two agents:
#   - bmad-agent-dev   → VR (verify stories) and CS (check single story)
#   - bmad-sprint-status → sprint status view
ok "BMAD skills pre-installed by scaffold (bmad-agent-dev, bmad-sprint-status)"

# ─── 4. Maven Settings ────────────────────────────────────────────────────────

log "Step 4/5 — Writing Maven settings.xml..."
mkdir -p "$HOME/.m2"

# Only write if settings don't exist (developer may have their own)
if [ ! -f "$HOME/.m2/settings.xml" ]; then
  cat > "$HOME/.m2/settings.xml" << 'MAVENEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!--
    Maven settings for MuleSoft Anypoint Platform.

    Required environment variables (set in Codespace secrets):
      ANYPOINT_USERNAME  — Anypoint Platform username or connected-app client ID
      ANYPOINT_PASSWORD  — Anypoint Platform password or client secret
      ANYPOINT_ORG_ID    — Business Group (Org) ID from Access Management

    These credentials are used for:
      1. Downloading connectors from Anypoint Exchange (dependency resolution)
      2. Publishing the commons library to Exchange
      3. Deploying to CloudHub 2.0 via mvn deploy -DmuleDeploy

    DO NOT hardcode credentials here. Use Codespace secrets instead.
    See: github.com/settings/codespaces (repository secrets)
-->
<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.2.0
            http://maven.apache.org/xsd/settings-1.2.0.xsd">

  <servers>

    <!-- Anypoint Exchange v3 — connector artifacts (groupId: com.mulesoft.connectors, org.mule.*) -->
    <server>
      <id>anypoint-exchange-v3</id>
      <username>${env.ANYPOINT_USERNAME}</username>
      <password>${env.ANYPOINT_PASSWORD}</password>
    </server>

    <!-- MuleSoft Enterprise repo — EE connectors (SAP, NetSuite, etc.) -->
    <server>
      <id>mulesoft-enterprise</id>
      <username>${env.ANYPOINT_USERNAME}</username>
      <password>${env.ANYPOINT_PASSWORD}</password>
    </server>

    <!-- CloudHub 2.0 deployment -->
    <server>
      <id>cloudhub2</id>
      <username>${env.ANYPOINT_USERNAME}</username>
      <password>${env.ANYPOINT_PASSWORD}</password>
    </server>

  </servers>

  <profiles>
    <profile>
      <id>mulesoft</id>
      <repositories>
        <repository>
          <id>anypoint-exchange-v3</id>
          <name>Anypoint Exchange v3</name>
          <url>https://maven.anypoint.mulesoft.com/api/v3/maven</url>
          <releases><enabled>true</enabled></releases>
          <snapshots><enabled>false</enabled></snapshots>
        </repository>
        <repository>
          <id>mulesoft-enterprise</id>
          <name>MuleSoft Enterprise</name>
          <url>https://repository.mulesoft.org/nexus/content/repositories/releases</url>
          <releases><enabled>true</enabled></releases>
          <snapshots><enabled>false</enabled></snapshots>
        </repository>
      </repositories>
      <pluginRepositories>
        <pluginRepository>
          <id>mulesoft-enterprise</id>
          <name>MuleSoft Enterprise Plugins</name>
          <url>https://repository.mulesoft.org/nexus/content/repositories/releases</url>
          <releases><enabled>true</enabled></releases>
          <snapshots><enabled>false</enabled></snapshots>
        </pluginRepository>
      </pluginRepositories>
    </profile>
  </profiles>

  <activeProfiles>
    <activeProfile>mulesoft</activeProfile>
  </activeProfiles>

</settings>
MAVENEOF
  ok "Maven settings.xml written"
else
  ok "Maven settings.xml already exists — skipped"
fi

# ─── 5. Pre-warm Maven Dependency Cache ──────────────────────────────────────

log "Step 5/5 — Pre-warming Maven dependency cache (background)..."
log "  This downloads all connector JARs declared in pom.xml."
log "  Requires ANYPOINT_USERNAME + ANYPOINT_PASSWORD Codespace secrets."

# Run in background so the Codespace opens immediately.
# The terminal shows progress; /tmp/mvn-warm.log has the full output.
(
  cd "$REPO_ROOT"
  if mvn dependency:resolve -q --no-transfer-progress 2>/tmp/mvn-warm.log; then
    echo "[$(date '+%H:%M:%S')] ✓ Maven dependencies cached — ready to compile" >> "$LOG"
    echo ""
    echo "✓ Maven cache warmed — run 'mvn compile' to verify"
  else
    echo "[$(date '+%H:%M:%S')] ⚠  Maven cache warm failed. Check /tmp/mvn-warm.log" >> "$LOG"
    echo ""
    echo "⚠  Maven cache warm failed — see /tmp/mvn-warm.log for details"
    echo "   Set ANYPOINT_USERNAME + ANYPOINT_PASSWORD in Codespace secrets, then run:"
    echo "   mvn dependency:resolve"
  fi
) &

# ─── Done ─────────────────────────────────────────────────────────────────────

log ""
log "======================================================"
log "  Setup complete  (Maven cache warming in background)"
log "======================================================"
log ""
log "  NEXT STEPS:"
log "  1. Set Codespace secrets: ANYPOINT_USERNAME, ANYPOINT_PASSWORD, ANYPOINT_ORG_ID"
log "     → github.com/settings/codespaces (or your org's repo secrets)"
log "  2. Search TODO in this workspace — three areas to fill in:"
log "     a) Connector credentials  → src/main/mule/global-config.xml"
log "     b) DataWeave field maps   → src/main/resources/dwl/*.dwl"
log "     c) Queue / env values     → src/main/resources/properties/*.yaml"
log "  3. Compile:  mvn compile"
log "  4. Test:     mvn test"
log "  5. Deploy:   mvn deploy -DmuleDeploy -Denvironment=dev"
log ""
log "  Full setup log: /tmp/devcontainer-setup.log"
log "  Maven log:      /tmp/mvn-warm.log"
log ""
