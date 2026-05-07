import { readFileSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { parse as yamlParse } from 'yaml';
import { dockerComposeUp, dockerComposeDown, waitForRedis } from './docker.js';

// ---------------------------------------------------------------------------
// Constants / environment
// ---------------------------------------------------------------------------

const ROOT = path.resolve(import.meta.dirname, '../../..');
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const USE_EXTERNAL_REDIS = process.env['INTEROP_USE_EXTERNAL_REDIS'] === '1';
const KEEP_DOCKER = process.env['INTEROP_KEEP_DOCKER'] === '1';
const COMPOSE_FILE = path.join(ROOT, 'tests/interop/docker-compose.yml');
const SCENARIOS_DIR = path.join(ROOT, 'tests/interop/scenarios');
const GENERATED_DIR = path.join(ROOT, 'tests/interop/generated');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScenarioCall {
  method: string;
  params?: unknown;
  notification?: boolean;
  repeat?: number;
  expect?: CallExpect;
}

interface CallExpect {
  result?: unknown;
  kind?: string;
  error?: {
    code?: number;
    kind?: string;
    messageMatches?: string;
  };
  distributionRoughlyEven?: boolean;
}

interface ScenarioClient {
  defaultTimeoutMs?: number;
  concurrent?: number;
}

interface Scenario {
  name: string;
  matrix: 'both' | 'ts-only' | 'py-only';
  contract?: string;
  servers?: number;
  client?: ScenarioClient;
  consumerClaimIdleMs?: number;
  crashServerAfterMs?: number;
  calls: ScenarioCall[];
  expect?: { manifestEqualsAcrossSides?: boolean };
}

interface DriverResult {
  ok: boolean;
  kind: string;
  result?: unknown;
  code?: number;
  message?: string;
  data?: unknown;
  handledCount?: number;
}

interface ClientOutput {
  results: DriverResult[];
}

interface RunResult {
  name: string;
  direction: string;
  passed: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Scenario loading
// ---------------------------------------------------------------------------

function loadScenarios(): Scenario[] {
  return readdirSync(SCENARIOS_DIR)
    .filter(f => f.endsWith('.yaml'))
    .sort()
    .map(f => yamlParse(readFileSync(path.join(SCENARIOS_DIR, f), 'utf-8')) as Scenario);
}

// ---------------------------------------------------------------------------
// Subprocess helpers
// ---------------------------------------------------------------------------

function extendedEnv(): NodeJS.ProcessEnv {
  const localBin = path.join(process.env['HOME'] ?? '/root', '.local/bin');
  return {
    ...process.env,
    PATH: `${localBin}:${process.env['PATH'] ?? ''}`,
  };
}

// Path to the tsx binary bundled inside the monorepo's node_modules.
// Spawning tsx directly (not via pnpm exec) ensures SIGTERM is delivered to
// the tsx process itself, not absorbed by the pnpm wrapper.
const TSX_BIN = path.join(ROOT, 'ts/node_modules/.bin/tsx');

function spawnServer(
  lang: 'ts' | 'py',
  cfg: Record<string, unknown>,
): ChildProcessWithoutNullStreams {
  const env = extendedEnv();
  let proc: ChildProcessWithoutNullStreams;
  if (lang === 'ts') {
    proc = spawn(
      TSX_BIN,
      [path.join(ROOT, 'tests/interop/drivers/ts/server.ts')],
      { cwd: path.join(ROOT, 'ts'), env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } else {
    proc = spawn(
      'uv',
      ['--project', path.join(ROOT, 'py'), 'run', 'python',
       path.join(ROOT, 'tests/interop/drivers/py/server.py')],
      { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  }
  proc.stdin.write(JSON.stringify(cfg));
  proc.stdin.end();
  return proc;
}

function spawnClient(
  lang: 'ts' | 'py',
  cfg: Record<string, unknown>,
): ChildProcessWithoutNullStreams {
  const env = extendedEnv();
  let proc: ChildProcessWithoutNullStreams;
  if (lang === 'ts') {
    proc = spawn(
      TSX_BIN,
      [path.join(ROOT, 'tests/interop/drivers/ts/client.ts')],
      { cwd: path.join(ROOT, 'ts'), env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } else {
    proc = spawn(
      'uv',
      ['--project', path.join(ROOT, 'py'), 'run', 'python',
       path.join(ROOT, 'tests/interop/drivers/py/client.py')],
      { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  }
  proc.stdin.write(JSON.stringify(cfg));
  proc.stdin.end();
  return proc;
}

// Per-server stderr buffer, keyed by process object.
const serverStderrBuffers = new WeakMap<ChildProcessWithoutNullStreams, string[]>();

function attachServerStderr(proc: ChildProcessWithoutNullStreams, label: string): void {
  const buf: string[] = [];
  serverStderrBuffers.set(proc, buf);
  proc.stderr.on('data', (d: Buffer) => {
    const s = d.toString();
    buf.push(s);
    process.stderr.write(`[${label}/stderr] ${s}`);
  });
}

function parseHandledCount(proc: ChildProcessWithoutNullStreams): number | null {
  const buf = serverStderrBuffers.get(proc);
  if (!buf) return null;
  const full = buf.join('');
  const matches = [...full.matchAll(/^HANDLED:(\d+)$/gm)];
  if (matches.length === 0) return null;
  // Use the last occurrence
  return parseInt(matches[matches.length - 1][1]!, 10);
}

async function waitForReady(
  proc: ChildProcessWithoutNullStreams,
  label: string,
  timeoutMs = 20_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`${label}: READY timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      if (done) return;
      if (chunk.toString().includes('READY')) {
        done = true;
        clearTimeout(timer);
        proc.stdout.off('data', onData);
        proc.off('exit', onExit);
        resolve();
      }
    };

    const onExit = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error(`${label}: server exited with code ${code} before READY`));
    };

    proc.stdout.on('data', onData);
    proc.once('exit', onExit);
  });
}

async function readClientOutput(
  proc: ChildProcessWithoutNullStreams,
  label: string,
  timeoutMs = 60_000,
): Promise<ClientOutput> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`${label}: client output timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (c: Buffer) => chunks.push(c.toString()));
    proc.stderr.on('data', (d: Buffer) => {
      process.stderr.write(`[${label}/client/stderr] ${d.toString()}`);
    });

    proc.once('exit', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const raw = chunks.join('').trim();
      if (!raw) {
        reject(new Error(`${label}: client produced no output (exit ${code})`));
        return;
      }
      try {
        resolve(JSON.parse(raw) as ClientOutput);
      } catch (e) {
        reject(new Error(`${label}: bad client JSON (exit ${code}): ${(e as Error).message}\n---\n${raw}`));
      }
    });
  });
}

function killProc(proc: ChildProcessWithoutNullStreams, signal: NodeJS.Signals = 'SIGTERM'): void {
  try { proc.kill(signal); } catch { /* already dead */ }
}

async function waitForExit(proc: ChildProcessWithoutNullStreams, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => { killProc(proc, 'SIGKILL'); resolve(); }, timeoutMs);
    proc.once('exit', () => { clearTimeout(t); resolve(); });
  });
}

// ---------------------------------------------------------------------------
// Codegen helpers
// ---------------------------------------------------------------------------

async function regenFixtures(outDir: string = GENERATED_DIR): Promise<void> {
  const codegenCli = path.join(ROOT, 'ts/packages/codegen/dist/cli.js');
  const contractsSrc = path.join(ROOT, 'tests/interop/contracts');
  const outTs = path.join(outDir, 'ts');
  const outPy = path.join(outDir, 'py');
  const manifestPath = path.join(outDir, 'manifest.json');

  mkdirSync(outTs, { recursive: true });
  mkdirSync(outPy, { recursive: true });

  const args = [
    codegenCli,
    '--src', contractsSrc,
    '--out-ts', outTs,
    '--out-py', outPy,
    '--manifest', manifestPath,
    '--ts-contract-import', '../../contracts/index.js',
  ];

  const proc = spawn('node', args, { cwd: ROOT, env: extendedEnv(), stdio: ['ignore', 'inherit', 'inherit'] });
  await new Promise<void>((resolve, reject) => {
    proc.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`codegen exited with code ${code}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Call expansion
// ---------------------------------------------------------------------------

function expandCallsForClient(
  calls: ScenarioCall[],
): Array<{ method: string; params?: unknown; notification?: boolean }> {
  const base: Array<{ method: string; params?: unknown; notification?: boolean }> = [];
  for (const c of calls) {
    const n = c.repeat ?? 1;
    for (let i = 0; i < n; i++) {
      base.push({ method: c.method, params: c.params, notification: c.notification ?? false });
    }
  }
  return base;
}

// ---------------------------------------------------------------------------
// Expectation checking
// ---------------------------------------------------------------------------

function checkExpectations(
  scenario: Scenario,
  results: DriverResult[],
  serverACalls: number,
  serverBCalls: number,
): string | null {
  const concurrent = scenario.client?.concurrent ?? 1;
  let idx = 0;

  for (const call of scenario.calls) {
    const n = (call.repeat ?? 1) * concurrent;
    for (let i = 0; i < n; i++) {
      if (idx >= results.length) {
        return `expected result at index ${idx} but got only ${results.length} results`;
      }
      const r = results[idx++];
      if (!call.expect) continue;

      const exp = call.expect;

      if (exp.result !== undefined) {
        if (r.kind !== 'result') {
          return `call[${idx - 1}] ${call.method}: expected result, got kind=${r.kind} (message=${r.message ?? ''})`;
        }
        if (JSON.stringify(r.result) !== JSON.stringify(exp.result)) {
          return `call[${idx - 1}] ${call.method}: result mismatch: got ${JSON.stringify(r.result)}, want ${JSON.stringify(exp.result)}`;
        }
      } else if (exp.error !== undefined) {
        if (r.ok !== false) {
          return `call[${idx - 1}] ${call.method}: expected error, got ok result: ${JSON.stringify(r.result)}`;
        }
        if (exp.error.code !== undefined && r.code !== exp.error.code) {
          return `call[${idx - 1}] ${call.method}: error code mismatch: got ${r.code}, want ${exp.error.code}`;
        }
        if (exp.error.messageMatches) {
          const re = new RegExp(exp.error.messageMatches, 'i');
          if (!re.test(r.message ?? '')) {
            return `call[${idx - 1}] ${call.method}: message "${r.message}" does not match /${exp.error.messageMatches}/i`;
          }
        }
        if (exp.error.kind && r.kind !== exp.error.kind) {
          return `call[${idx - 1}] ${call.method}: error kind mismatch: got ${r.kind}, want ${exp.error.kind}`;
        }
      } else if (exp.kind === 'notification') {
        if (r.kind !== 'notification') {
          return `call[${idx - 1}] ${call.method}: expected notification ack, got ${r.kind}`;
        }
      }

      // Worker-pool fairness check (applied once, after all repeated calls)
      if (exp.distributionRoughlyEven && i === n - 1) {
        const totalCalls = n;
        const minExpected = Math.floor(totalCalls / 10);
        if (serverACalls < minExpected || serverBCalls < minExpected) {
          return `worker-pool: distribution not even — srv-A=${serverACalls}, srv-B=${serverBCalls}, min expected each=${minExpected}`;
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Redis cleanup
// ---------------------------------------------------------------------------

async function cleanupRedisKeys(keyPrefix: string): Promise<void> {
  const { default: IORedis } = await import('ioredis');
  const r = new IORedis(REDIS_URL, { lazyConnect: false });
  try {
    const keys = await r.keys(`${keyPrefix}:*`);
    if (keys.length > 0) await r.del(...keys);
  } finally {
    await r.quit().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Schema-hash scenario
// ---------------------------------------------------------------------------

async function runSchemaHashScenario(s: Scenario): Promise<RunResult> {
  const dir = 'schema-hash';
  const tmp1 = path.join(tmpdir(), `clam-interop-schema-hash-${Date.now()}-1`);
  const tmp2 = path.join(tmpdir(), `clam-interop-schema-hash-${Date.now()}-2`);
  try {
    await regenFixtures(tmp1);
    await regenFixtures(tmp2);
    const m1 = readFileSync(path.join(tmp1, 'manifest.json'), 'utf-8').trim();
    const m2 = readFileSync(path.join(tmp2, 'manifest.json'), 'utf-8').trim();
    if (m1 !== m2) {
      return { name: s.name, direction: dir, passed: false, reason: 'manifest byte-mismatch between two codegen runs' };
    }
    return { name: s.name, direction: dir, passed: true };
  } catch (e) {
    return { name: s.name, direction: dir, passed: false, reason: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Main scenario runner
// ---------------------------------------------------------------------------

async function runDirectionalScenario(
  s: Scenario,
  serverLang: 'ts' | 'py',
  clientLang: 'ts' | 'py',
): Promise<RunResult> {
  const dirLabel = `${serverLang}→${clientLang}`;
  const tag = `clam-interop-${s.name.replace(/\W+/g, '-')}-${serverLang}${clientLang}-${Math.random().toString(36).slice(2, 6)}`;

  let serverA: ChildProcessWithoutNullStreams | null = null;
  let serverB: ChildProcessWithoutNullStreams | null = null;

  try {
    const serverCfgBase: Record<string, unknown> = {
      contract: s.contract,
      redisUrl: REDIS_URL,
      keyPrefix: tag,
      consumerClaimIdleMs: s.consumerClaimIdleMs ?? 60_000,
      generatedDir: path.join(ROOT, 'tests/interop/generated/py'),
    };

    // Spawn server A
    serverA = spawnServer(serverLang, { ...serverCfgBase, instanceId: 'srv-A' });
    attachServerStderr(serverA, `${s.name}/${dirLabel}/srv-A`);
    await waitForReady(serverA, `${s.name}/${dirLabel}/srv-A`);

    // Spawn server B if needed
    if ((s.servers ?? 1) >= 2) {
      serverB = spawnServer(serverLang, { ...serverCfgBase, instanceId: 'srv-B' });
      attachServerStderr(serverB, `${s.name}/${dirLabel}/srv-B`);
      await waitForReady(serverB, `${s.name}/${dirLabel}/srv-B`);
    }

    // Schedule crash if requested
    let crashTimer: ReturnType<typeof setTimeout> | null = null;
    if (s.crashServerAfterMs != null && s.crashServerAfterMs > 0) {
      crashTimer = setTimeout(() => {
        if (serverA) killProc(serverA, 'SIGKILL');
      }, s.crashServerAfterMs);
    }

    // Build client call list. When concurrent > 1, the driver fans out the call list
    // N times in parallel — the runner passes the base list and concurrent count.
    const concurrent = s.client?.concurrent ?? 1;
    const baseCalls = expandCallsForClient(s.calls);

    const clientCfg: Record<string, unknown> = {
      redisUrl: REDIS_URL,
      keyPrefix: tag,
      defaultTimeoutMs: s.client?.defaultTimeoutMs ?? 5000,
      calls: baseCalls,
      concurrent: concurrent > 1 ? concurrent : undefined,
      generatedDir: path.join(ROOT, 'tests/interop/generated/py'),
    };

    const clientProc = spawnClient(clientLang, clientCfg);
    const clientOutput = await readClientOutput(clientProc, `${s.name}/${dirLabel}/client`);

    if (crashTimer !== null) clearTimeout(crashTimer);

    // Save references before we kill+null the server vars, so we can parse HANDLED counts
    const serverARef = serverA;
    const serverBRef = serverB;

    // Kill servers and wait for them to exit so HANDLED lines are flushed to stderr
    if (serverA) { killProc(serverA, 'SIGTERM'); await waitForExit(serverA); serverA = null; }
    if (serverB) { killProc(serverB, 'SIGTERM'); await waitForExit(serverB); serverB = null; }

    // Collect server-side handled counts when a distributionRoughlyEven check is present.
    // Other multi-server scenarios (e.g. crash recovery) don't need this.
    const needsDistributionCheck = s.calls.some(c => c.expect?.distributionRoughlyEven);
    let serverACalls = 0;
    let serverBCalls = 0;
    if (needsDistributionCheck && (s.servers ?? 1) >= 2) {
      const aCount = serverARef ? parseHandledCount(serverARef) : null;
      const bCount = serverBRef ? parseHandledCount(serverBRef) : null;
      if (aCount === null) {
        return { name: s.name, direction: dirLabel, passed: false,
          reason: 'srv-A did not emit HANDLED:<n> line on shutdown' };
      }
      if (bCount === null) {
        return { name: s.name, direction: dirLabel, passed: false,
          reason: 'srv-B did not emit HANDLED:<n> line on shutdown' };
      }
      serverACalls = aCount;
      serverBCalls = bCount;
      console.log(`  [worker-pool] srv-A: ${serverACalls}, srv-B: ${serverBCalls}`);
    }

    const failure = checkExpectations(s, clientOutput.results, serverACalls, serverBCalls);
    return {
      name: s.name,
      direction: dirLabel,
      passed: failure === null,
      reason: failure ?? undefined,
    };
  } catch (e) {
    return {
      name: s.name,
      direction: dirLabel,
      passed: false,
      reason: String(e),
    };
  } finally {
    if (serverA) { killProc(serverA, 'SIGTERM'); await waitForExit(serverA); }
    if (serverB) { killProc(serverB, 'SIGTERM'); await waitForExit(serverB); }
    await cleanupRedisKeys(tag);
  }
}

async function runScenario(s: Scenario): Promise<RunResult[]> {
  // Special case: schema-hash (ts-only, runner-internal)
  if (s.name === 'schema-hash manifest cross-side equality') {
    return [await runSchemaHashScenario(s)];
  }

  const directions: Array<{ server: 'ts' | 'py'; client: 'ts' | 'py' }> =
    s.matrix === 'ts-only'
      ? [{ server: 'ts', client: 'ts' }]
      : s.matrix === 'py-only'
        ? [{ server: 'py', client: 'py' }]
        : [{ server: 'ts', client: 'py' }, { server: 'py', client: 'ts' }];

  const results: RunResult[] = [];
  for (const dir of directions) {
    results.push(await runDirectionalScenario(s, dir.server, dir.client));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!USE_EXTERNAL_REDIS) {
    dockerComposeUp(COMPOSE_FILE);
  } else {
    console.log('[runner] Using external Redis at', REDIS_URL);
  }

  try {
    await waitForRedis(REDIS_URL);
    console.log('[runner] Redis ready');

    await regenFixtures();
    console.log('[runner] Fixtures regenerated');

    const scenarios = loadScenarios();
    console.log(`[runner] Loaded ${scenarios.length} scenario(s)`);

    const allResults: RunResult[] = [];
    for (const s of scenarios) {
      console.log(`\n[runner] Running: ${s.name}`);
      const results = await runScenario(s);
      allResults.push(...results);
      for (const r of results) {
        console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.name}  (${r.direction})${r.reason ? `\n       ${r.reason}` : ''}`);
      }
    }

    console.log('\n--- Summary ---');
    for (const r of allResults) {
      console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}  (${r.direction})${r.reason ? `\n     ${r.reason}` : ''}`);
    }

    const failed = allResults.filter(r => !r.passed);
    if (failed.length > 0) {
      console.error(`\n${failed.length} scenario(s) FAILED`);
      process.exit(1);
    }
    console.log('\nAll scenarios PASSED');
  } finally {
    if (!USE_EXTERNAL_REDIS && !KEEP_DOCKER) {
      dockerComposeDown(COMPOSE_FILE);
    }
  }
}

main().catch(e => {
  console.error('[runner] Fatal:', e);
  process.exit(1);
});
