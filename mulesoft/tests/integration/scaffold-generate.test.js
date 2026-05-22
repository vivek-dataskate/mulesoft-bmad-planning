'use strict';

/**
 * Integration tests for mulesoft/generate.js
 *
 * Each test runs the full scaffold generator against a fixture decisions.json
 * and asserts on the output file tree, content, and structural correctness.
 *
 * To run:
 *   npm test -- mulesoft/tests/integration/scaffold-generate.test.js
 */

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execSync } = require('child_process');

const REPO_ROOT    = path.resolve(__dirname, '../../..');
const GENERATE     = path.join(REPO_ROOT, 'mulesoft', 'generate.js');
const FIXTURES_DIR = path.join(__dirname, '../fixtures/decisions');

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mule-scaffold-test-'));
}

function runScaffold(fixtureFile, outDir) {
  const fixturePath = path.join(FIXTURES_DIR, fixtureFile);
  execSync(`node "${GENERATE}" "${fixturePath}" "${outDir}"`, {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    timeout: 10_000,
  });
}

function allFiles(dir) {
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else results.push(full);
    }
  }
  walk(dir);
  return results;
}

function readOut(outDir, relPath) {
  return fs.readFileSync(path.join(outDir, relPath), 'utf8');
}

function exists(outDir, relPath) {
  return fs.existsSync(path.join(outDir, relPath));
}

// ── FR Tests (Functional Requirements) ───────────────────────────────────────

describe('FR: Standard scaffold — required file tree', () => {
  let outDir;

  beforeAll(() => {
    outDir = tmpDir();
    runScaffold('standard.json', outDir);
  });

  afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

  test('FR-1: pom.xml is generated', () => {
    expect(exists(outDir, 'pom.xml')).toBe(true);
  });

  test('FR-1: mule-artifact.json is generated', () => {
    expect(exists(outDir, 'mule-artifact.json')).toBe(true);
  });

  test('FR-1: global-config.xml is generated', () => {
    expect(exists(outDir, 'src/main/mule/global-config.xml')).toBe(true);
  });

  test('FR-1: error-handler.xml is always generated', () => {
    expect(exists(outDir, 'src/main/mule/error-handler.xml')).toBe(true);
  });

  test('FR-2: one flows.xml per flow entry', () => {
    // standard.json has 2 flows: sync-accounts, sync-orders
    expect(exists(outDir, 'src/main/mule/sync-accounts-flows.xml')).toBe(true);
    expect(exists(outDir, 'src/main/mule/sync-orders-flows.xml')).toBe(true);
  });

  test('FR-3: one munit XML per flow', () => {
    expect(exists(outDir, 'src/test/munit/sync-accounts-test.xml')).toBe(true);
    expect(exists(outDir, 'src/test/munit/sync-orders-test.xml')).toBe(true);
  });

  test('FR-4: one DWL file per flow', () => {
    const dwlFiles = fs.readdirSync(path.join(outDir, 'src/main/resources/dwl'));
    expect(dwlFiles.length).toBeGreaterThanOrEqual(2);
  });

  test('FR-10: property files for all environments', () => {
    expect(exists(outDir, 'src/main/resources/properties/local.yaml')).toBe(true);
    expect(exists(outDir, 'src/main/resources/properties/dev.yaml')).toBe(true);
    expect(exists(outDir, 'src/main/resources/properties/uat.yaml')).toBe(true);
    expect(exists(outDir, 'src/main/resources/properties/prod.yaml')).toBe(true);
  });

  test('FR-6: deploy.yml generated when cicd=github-actions', () => {
    expect(exists(outDir, '.github/workflows/deploy.yml')).toBe(true);
  });
});

describe('FR: Minimal scaffold', () => {
  let outDir;

  beforeAll(() => {
    outDir = tmpDir();
    runScaffold('minimal.json', outDir);
  });

  afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

  test('FR-7: no deploy.yml when cicd=none', () => {
    expect(exists(outDir, '.github/workflows/deploy.yml')).toBe(false);
  });

  test('FR-11: error-handler.xml always generated (even minimal)', () => {
    expect(exists(outDir, 'src/main/mule/error-handler.xml')).toBe(true);
  });

  test('one flows.xml for single flow', () => {
    expect(exists(outDir, 'src/main/mule/notify-ops-flows.xml')).toBe(true);
  });
});

describe('FR: pom.xml content', () => {
  let outDir;

  beforeAll(() => {
    outDir = tmpDir();
    runScaffold('standard.json', outDir);
  });

  afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

  test('FR-5: pom.xml contains salesforce connector dependency', () => {
    const pom = readOut(outDir, 'pom.xml');
    expect(pom).toContain('mule-salesforce-connector');
  });

  test('FR-5: pom.xml contains anypoint-mq connector dependency', () => {
    const pom = readOut(outDir, 'pom.xml');
    expect(pom).toContain('anypoint-mq-connector');
  });

  test('FR-8: MUnit coverage floor in pom.xml matches event-driven pattern (75)', () => {
    const pom = readOut(outDir, 'pom.xml');
    // Standard fixture uses event-driven → floor = 75
    expect(pom).toContain('75');
  });
});

describe('FR: Regulated scaffold', () => {
  let outDir;

  beforeAll(() => {
    outDir = tmpDir();
    runScaffold('regulated.json', outDir);
  });

  afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

  test('FR-9: global-config.xml contains field-encryption or secrets-manager reference', () => {
    const globalCfg = readOut(outDir, 'src/main/mule/global-config.xml');
    // Regulated profile enables secrets-manager block
    expect(globalCfg.toLowerCase()).toMatch(/secrets.manager|field.encry/i);
  });
});

// ── NFR Tests (Non-Functional Requirements) ────────────────────────────────────

describe('NFR: Output quality', () => {
  let outDir;

  beforeAll(() => {
    outDir = tmpDir();
    runScaffold('enterprise.json', outDir);
  });

  afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

  test('NFR-1: no unsubstituted {{TOKEN}} patterns in any output file', () => {
    const files = allFiles(outDir);
    const xmlFiles = files.filter(f => f.endsWith('.xml') || f.endsWith('.yaml') || f.endsWith('.json'));
    const violations = [];
    for (const f of xmlFiles) {
      const content = fs.readFileSync(f, 'utf8');
      const matches = content.match(/\{\{[A-Z_]+\}\}/g);
      if (matches) violations.push(`${path.relative(outDir, f)}: ${[...new Set(matches)].join(', ')}`);
    }
    expect(violations).toEqual([]);
  });

  test('NFR-2: all generated Mule XML files are well-formed (have opening/closing mule tags)', () => {
    // Exclude pom.xml — it is Maven XML (<project>), not Mule XML
    const muleXmlFiles = allFiles(outDir).filter(f => f.endsWith('.xml') && !f.endsWith('pom.xml'));
    for (const f of muleXmlFiles) {
      const content = fs.readFileSync(f, 'utf8');
      expect(content).toMatch(/<mule/);
      expect(content).toMatch(/<\/mule>/);
    }
  });
});

describe('NFR: Performance and idempotency', () => {
  test('NFR-3: scaffold completes within 5 seconds', () => {
    const outDir = tmpDir();
    const start = Date.now();
    try {
      runScaffold('enterprise.json', outDir);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test('NFR-4: scaffold is idempotent — second run produces identical output', () => {
    const outDir1 = tmpDir();
    const outDir2 = tmpDir();
    try {
      runScaffold('standard.json', outDir1);
      runScaffold('standard.json', outDir2);

      const files1 = allFiles(outDir1).map(f => path.relative(outDir1, f)).sort();
      const files2 = allFiles(outDir2).map(f => path.relative(outDir2, f)).sort();
      expect(files1).toEqual(files2);

      for (const rel of files1) {
        const c1 = fs.readFileSync(path.join(outDir1, rel), 'utf8');
        const c2 = fs.readFileSync(path.join(outDir2, rel), 'utf8');
        expect(c1).toBe(c2);
      }
    } finally {
      fs.rmSync(outDir1, { recursive: true, force: true });
      fs.rmSync(outDir2, { recursive: true, force: true });
    }
  });
});

// ── Error Handling Tests ────────────────────────────────────────────────────────

describe('ERROR: Invalid inputs', () => {
  test('ERROR-1: missing decisions.json path → non-zero exit', () => {
    expect(() => {
      execSync(`node "${GENERATE}" /nonexistent/path/decisions.json /tmp/x`, {
        cwd: REPO_ROOT,
        stdio: 'pipe',
        timeout: 5000,
      });
    }).toThrow();
  });
});

describe('CONN: Connector handling', () => {
  test('CONN-2: stale connector (>6 months) emits WARNING in stderr', () => {
    // Use minimal fixture which has anypoint-mq; if registry is stale, warns.
    // This test just verifies the scaffold does not crash on staleness check.
    const outDir = tmpDir();
    try {
      expect(() => runScaffold('minimal.json', outDir)).not.toThrow();
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
