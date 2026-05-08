# README Gaps + Verbatim-Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clarify the AGENTS.md verbatim-quote rule to permit code-comment annotations, add a CI check enforcing the new rule, bring the four transport READMEs into compliance by quoting real proxy-style fixtures, and close the nine documentation gaps the porting experiment surfaced.

**Architecture:** Three sequential phases. Phase 1 lands the rule update + a non-blocking CI check. Phase 2 adds proxy-style runnable fixtures under each transport package, requotes the four transport READMEs to be verbatim against those fixtures, and flips the CI check to blocking. Phase 3 closes the nine gaps by adding code comments, prose subsections, and one Markdown table to the relevant READMEs (and a small protocol-level fixture for `RpcError`).

**Tech Stack:** Markdown, Node.js (Node 20+), TypeScript (the existing pnpm workspace), Python (the existing uv workspace). The CI check is a Node `.mjs` script run via `node`. Codegen is the existing `@clamator/codegen` CLI invoked locally via `node ts/packages/codegen/dist/cli.js`. No new runtime dependencies; the script uses Node stdlib only.

**Spec:** `docs/2026-05-08-readme-gaps-design.md`.

**Decisions locked in by this plan (deferred from spec):**

1. **Script language.** Node `.mjs` (ES module). Justification: repo CI is Node-heavy (`pnpm` workflow is the natural home), Node 20+ stdlib has everything needed (`fs/promises`, `path`, regex), no markdown parser dependency required, and the script is invoked from `make check-readmes` with `node scripts/check-readme-verbatim.mjs`. Path: `scripts/check-readme-verbatim.mjs`.
2. **Fixture homes.** Per-package, under each transport package's `tests/` directory. Each transport package gets its own contract source (TS-side only), its own committed codegen output (TS in `ts/.../tests/generated/arith.ts`, Py in `py/.../tests/generated/arith.py`), and its own proxy test. Same Zod contract source drives both languages' generated outputs via `--out-ts`/`--out-py`.
3. **Generated-proxy source path.** Per-package committed codegen output (option 2 from spec). Reasoning: keeps the README's import path readable (`from .generated.arith import ...`) and avoids cross-package relative imports that would surface in quoted README code as `../../../../tests/interop/generated/...`.
4. **Contract content per transport.** over-memory: a single `add` method (smallest demonstration). over-redis: `add` method plus a `ping` notification (matches the existing user-facing message that over-redis showcases notifications and worker-pool semantics).

---

## File Structure

**Files created (new):**

- `scripts/check-readme-verbatim.mjs` — Node script that audits README code blocks against cited sources.
- `ts/packages/over-memory/tests/contracts/arith.ts` — Zod contract source for over-memory proxy fixtures.
- `ts/packages/over-memory/tests/generated/arith.ts` — codegen TS output for the above contract (committed).
- `ts/packages/over-memory/tests/proxy-loopback.test.ts` — runnable test exercising `MemoryRpc{Server,Client}` through codegen-emitted typed proxies.
- `py/packages/over-memory/tests/generated/__init__.py` — empty marker to make `generated/` a package.
- `py/packages/over-memory/tests/generated/arith.py` — codegen Py output (committed).
- `py/packages/over-memory/tests/test_proxy_loopback.py` — runnable test, Py side.
- `ts/packages/over-redis/tests/contracts/arith.ts` — Zod contract for over-redis proxy fixtures.
- `ts/packages/over-redis/tests/generated/arith.ts` — codegen TS output (committed).
- `ts/packages/over-redis/tests/proxy-round-trip.test.ts` — runnable test, skipped without `REDIS_URL`.
- `py/packages/over-redis/tests/generated/__init__.py` — empty marker.
- `py/packages/over-redis/tests/generated/arith.py` — codegen Py output (committed).
- `py/packages/over-redis/tests/test_proxy_round_trip.py` — runnable test, skipped without `REDIS_URL`.
- `ts/packages/protocol/tests/rpc-error.test.ts` — protocol-package-local test demonstrating `new RpcError({ code, message, data })` and asserting envelope shape (used as the source of the gap-#2 RpcError example in `ts/packages/protocol/README.md`).
- `py/packages/protocol/tests/test_rpc_error.py` — Py equivalent.

**Files modified:**

- `AGENTS.md` — § 6 updated with the new rule wording (Phase 1.1).
- `Makefile` — new `check-readmes` target.
- `.github/workflows/ts.yml` — new `Check READMEs verbatim` step (non-blocking in Phase 1, blocking after Phase 2).
- `ts/packages/over-memory/README.md` — Phase 2 requote + Phase 3 gap comments.
- `py/packages/over-memory/README.md` — same.
- `ts/packages/over-redis/README.md` — same.
- `py/packages/over-redis/README.md` — same.
- `ts/packages/protocol/README.md` — Phase 3 gaps #1, #2.
- `py/packages/protocol/README.md` — Phase 3 gaps #1, #2.
- `ts/packages/codegen/README.md` — Phase 3 gap #3.

---

## Phase 1 — Rule update + non-blocking CI check

### Task 1: Update `AGENTS.md` § 6 with the clarified rule

**Files:**
- Modify: `AGENTS.md` (lines 79–87, the current "Examples in code documentation must run" subsection)

- [ ] **Step 1: Confirm current wording**

Run:

```bash
sed -n '79,87p' AGENTS.md
```

Expected output:

```
### Examples in code documentation must run

Code examples in the README and docs that demonstrate API usage must either:
1. Be checked by a typecheck-only fixture (or a runnable scenario) in `tests/interop/`, or
2. Be a verbatim quote of a working example file in the repo.

No "example-only" code that has never executed.
```

If output differs, stop and report.

- [ ] **Step 2: Replace the subsection**

Use `Edit` to replace the entire subsection. Old string:

```
### Examples in code documentation must run

Code examples in the README and docs that demonstrate API usage must either:
1. Be checked by a typecheck-only fixture (or a runnable scenario) in `tests/interop/`, or
2. Be a verbatim quote of a working example file in the repo.

No "example-only" code that has never executed.
```

New string:

```
### Examples in code documentation must run

Code examples in the README and docs that demonstrate API usage must be verbatim quotes of working test or fixture code in the repo, **except for code comments — comments may be added freely in the README copy for documentation purposes.** A "comment" means any token sequence the source language treats as a comment: `#` lines and `# trailing` segments in Python, `//` lines and `// trailing` segments and `/* ... */` blocks in TypeScript, and so on. Whitespace around comments is similarly free.

**Update-coupling rule (test → README).** When updating a test or fixture that is quoted in a README, also update the README's quoted block so it remains verbatim. Comments that exist only in the README copy are preserved.

**Update-coupling rule (README → test).** When updating demo code in a README, the code must originate from a working source file. Update the source file (test or fixture) first, then propagate the change to the README. Existing README-only comments are preserved across the propagation.

**Comment placement guidance.**
- Use end-of-line comments for short keyword annotations: `await server.start()  # must follow register_service`.
- Use above-statement comments for full sentences. End-of-line full sentences are stranded when a variable rename forces a wrap.
- Avoid mid-block standalone comment lines that depend on neighbor context (e.g., "the next line is critical because…"). They break silently when the next line moves.

A `make check-readmes` target verifies every code block in every package README is verbatim (modulo comments) against its cited source.
```

- [ ] **Step 3: Verify**

```bash
grep -c "comments may be added freely" AGENTS.md
grep -c "Update-coupling rule" AGENTS.md
grep -c "make check-readmes" AGENTS.md
```

Expected: each prints 1 or higher.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): clarify verbatim-quote rule to permit code-comment annotations"
```

(No `Co-Authored-By` trailer per AGENTS.md § 8.)

---

### Task 2: Write `scripts/check-readme-verbatim.mjs`

**Files:**
- Create: `scripts/check-readme-verbatim.mjs`

- [ ] **Step 1: Create the script**

Create `scripts/check-readme-verbatim.mjs` with exactly this content:

```javascript
#!/usr/bin/env node
// Verbatim-diff check for clamator package READMEs.
// For every fenced code block whose language is `ts`, `typescript`, `python`, or `py`
// in any file under {ts,py}/packages/*/README.md, expects a citation footer in the
// canonical grammar:
//   (Verbatim from `<repo-relative-path>:<start-line>-<end-line>`.)
// or whole-file:
//   (Verbatim from `<repo-relative-path>`.)
// The script reads the cited source range, strips comments, normalizes whitespace,
// and compares against the same-treatment block. Non-zero exit on any mismatch.

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const READ_LANGS = new Set(['ts', 'typescript', 'python', 'py']);

const README_GLOBS = [
  'ts/packages/protocol/README.md',
  'ts/packages/over-memory/README.md',
  'ts/packages/over-redis/README.md',
  'ts/packages/codegen/README.md',
  'py/packages/protocol/README.md',
  'py/packages/over-memory/README.md',
  'py/packages/over-redis/README.md',
];

const CITATION_RE = /^\(Verbatim from `([^`]+?)(?::(\d+)-(\d+))?`\.\)\s*$/;

function stripComments(text, lang) {
  const lines = text.split('\n');
  const out = [];
  if (lang === 'python' || lang === 'py') {
    for (const line of lines) {
      // strip # to end of line, but only when not inside a string literal.
      // Heuristic: if a # appears after an even number of unescaped " or ' on the line,
      // it is a real comment. Conservative: strip # only at start of line or after whitespace
      // and not inside an obvious string.
      const stripped = line.replace(/(^|\s)#.*$/, (m, p1) => p1);
      out.push(stripped);
    }
  } else if (lang === 'ts' || lang === 'typescript') {
    let inBlock = false;
    for (let line of lines) {
      if (inBlock) {
        const end = line.indexOf('*/');
        if (end >= 0) {
          line = line.slice(end + 2);
          inBlock = false;
        } else {
          out.push('');
          continue;
        }
      }
      // strip /* ... */ that opens and possibly closes
      while (true) {
        const start = line.indexOf('/*');
        if (start < 0) break;
        const end = line.indexOf('*/', start + 2);
        if (end < 0) {
          line = line.slice(0, start);
          inBlock = true;
          break;
        }
        line = line.slice(0, start) + line.slice(end + 2);
      }
      // strip // to end of line
      const slash = line.indexOf('//');
      if (slash >= 0) {
        // do not strip inside string literals (heuristic: count unescaped quotes before //)
        const before = line.slice(0, slash);
        const dq = (before.match(/(?<!\\)"/g) || []).length;
        const sq = (before.match(/(?<!\\)'/g) || []).length;
        if (dq % 2 === 0 && sq % 2 === 0) {
          line = before;
        }
      }
      out.push(line);
    }
  } else {
    return text;
  }
  return out.join('\n');
}

function normalizeWhitespace(text) {
  // trim trailing whitespace per line
  let lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  // collapse runs of blank lines
  const collapsed = [];
  let lastBlank = false;
  for (const line of lines) {
    const blank = line.length === 0;
    if (blank && lastBlank) continue;
    collapsed.push(line);
    lastBlank = blank;
  }
  // strip a single leading and trailing blank line
  while (collapsed.length && collapsed[0] === '') collapsed.shift();
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop();
  return collapsed.join('\n');
}

function extractBlocks(markdown) {
  // Returns [{lang, code, citation, blockStartLine, citationLine}].
  const lines = markdown.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^```(\w+)\s*$/);
    if (!m) {
      i++;
      continue;
    }
    const lang = m[1].toLowerCase();
    const codeStart = i + 1;
    let j = codeStart;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
    if (j >= lines.length) {
      throw new Error(`Unclosed fence starting at line ${i + 1}`);
    }
    const code = lines.slice(codeStart, j).join('\n');
    // citation: scan forward up to 5 lines for the citation pattern; first match wins.
    let citation = null;
    let citationLineNo = null;
    for (let k = j + 1; k < Math.min(j + 6, lines.length); k++) {
      const t = lines[k].trim();
      if (t === '') continue;
      const cm = t.match(CITATION_RE);
      if (cm) {
        citation = { path: cm[1], start: cm[2] ? parseInt(cm[2], 10) : null, end: cm[3] ? parseInt(cm[3], 10) : null };
        citationLineNo = k + 1;
      }
      break;
    }
    out.push({ lang, code, citation, blockStartLine: codeStart + 1, citationLineNo });
    i = j + 1;
  }
  return out;
}

async function readSourceRange(repoPath, start, end) {
  const content = await readFile(join(REPO_ROOT, repoPath), 'utf8');
  if (start === null) return content;
  const lines = content.split('\n');
  if (start < 1 || end > lines.length || start > end) {
    throw new Error(`Bad line range ${start}-${end} for ${repoPath} (file has ${lines.length} lines)`);
  }
  return lines.slice(start - 1, end).join('\n');
}

function unifiedDiff(a, b, aLabel, bLabel) {
  const al = a.split('\n');
  const bl = b.split('\n');
  const out = [`--- ${aLabel}`, `+++ ${bLabel}`];
  // simple line-by-line diff (this is a brute-force comparator; not LCS-optimal,
  // but adequate for short README blocks).
  const max = Math.max(al.length, bl.length);
  for (let i = 0; i < max; i++) {
    const la = al[i];
    const lb = bl[i];
    if (la === lb) {
      out.push(`  ${la ?? ''}`);
    } else {
      if (la !== undefined) out.push(`- ${la}`);
      if (lb !== undefined) out.push(`+ ${lb}`);
    }
  }
  return out.join('\n');
}

let failed = false;

for (const readme of README_GLOBS) {
  const markdown = await readFile(join(REPO_ROOT, readme), 'utf8');
  let blocks;
  try {
    blocks = extractBlocks(markdown);
  } catch (e) {
    console.error(`PARSE-FAIL ${readme}: ${e.message}`);
    failed = true;
    continue;
  }
  for (const block of blocks) {
    if (!READ_LANGS.has(block.lang)) continue;
    if (!block.citation) {
      console.error(`MISSING-CITATION ${readme}:${block.blockStartLine} (${block.lang})`);
      failed = true;
      continue;
    }
    let source;
    try {
      source = await readSourceRange(block.citation.path, block.citation.start, block.citation.end);
    } catch (e) {
      console.error(`SOURCE-MISSING ${readme}:${block.blockStartLine} → ${block.citation.path}: ${e.message}`);
      failed = true;
      continue;
    }
    const a = normalizeWhitespace(stripComments(block.code, block.lang));
    const b = normalizeWhitespace(stripComments(source, block.lang));
    if (a !== b) {
      console.error(`FAIL ${readme}`);
      console.error(`  Block at line ${block.blockStartLine} (${block.lang})`);
      const cite = block.citation.start ? `${block.citation.path}:${block.citation.start}-${block.citation.end}` : block.citation.path;
      console.error(`  Citation: ${cite}`);
      console.error(`  Mismatch:`);
      console.error(unifiedDiff(a, b, 'README block (comments stripped)', 'source range (comments stripped)').split('\n').map((l) => '    ' + l).join('\n'));
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log('OK — all README code blocks verbatim against cited sources.');
}
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/check-readme-verbatim.mjs
```

- [ ] **Step 3: Test parse-only on the two protocol READMEs (which are known verbatim)**

```bash
node scripts/check-readme-verbatim.mjs
```

Expected: the script exits non-zero with violations for the four transport READMEs (Phase 2 will fix), but reports OK-style processing for ts/protocol, py/protocol, and ts/codegen. Manually confirm the output mentions only the expected eight violations from the audit — not the three known-clean READMEs.

If the script fails on a known-clean README (false positive), stop and report. The known-clean READMEs are:
- `ts/packages/protocol/README.md` (1 block)
- `py/packages/protocol/README.md` (1 block)
- `ts/packages/codegen/README.md` (2 blocks)

If any of these fail, the script logic has a bug; do not work around it by editing the README — fix the script.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-readme-verbatim.mjs
git commit -m "scripts: add check-readme-verbatim verbatim-diff tool"
```

---

### Task 3: Add `check-readmes` Makefile target

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Confirm current `.PHONY` line**

```bash
sed -n '1p' Makefile
```

Expected: `.PHONY: install build test lint clean release interop help`

- [ ] **Step 2: Update `.PHONY` and add the target**

Edit `Makefile`:

Replace:
```
.PHONY: install build test lint clean release interop help
```
with:
```
.PHONY: install build test lint clean release interop help check-readmes
```

Then append a new target after the `interop:` block, before `clean:`:

```
check-readmes: ## verify README code blocks are verbatim against cited sources
	node scripts/check-readme-verbatim.mjs
```

(Use a real tab before `node`, not spaces — `Makefile` requires tabs.)

- [ ] **Step 3: Verify**

```bash
grep -c "check-readmes" Makefile
make help | grep check-readmes
```

Expected: first command prints 2 (one in `.PHONY`, one as target). Second command prints the target line with description.

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "make: add check-readmes target"
```

---

### Task 4: Add non-blocking CI step in `ts.yml`

**Files:**
- Modify: `.github/workflows/ts.yml`

- [ ] **Step 1: Confirm current `Install` step**

```bash
sed -n '28,35p' .github/workflows/ts.yml
```

Expected:

```
      - name: Install
        run: cd ts && pnpm install --frozen-lockfile
      - name: Lint
        run: cd ts && pnpm -r lint
      - name: Build
        run: cd ts && pnpm -r build
      - name: Test
        run: cd ts && pnpm -r test
```

- [ ] **Step 2: Insert the new step**

Edit `.github/workflows/ts.yml` to insert a new step between `Install` and `Lint`:

```yaml
      - name: Install
        run: cd ts && pnpm install --frozen-lockfile
      - name: Check READMEs verbatim
        continue-on-error: true
        run: node scripts/check-readme-verbatim.mjs
      - name: Lint
        run: cd ts && pnpm -r lint
```

The `continue-on-error: true` line makes this step non-blocking. Phase 2.4 (Task 12) flips it.

- [ ] **Step 3: Verify**

```bash
grep -c "Check READMEs verbatim" .github/workflows/ts.yml
grep -c "continue-on-error: true" .github/workflows/ts.yml
```

Expected: each prints 1.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ts.yml
git commit -m "ci(ts): add non-blocking check-readme-verbatim step"
```

---

### Task 5: Run `make check-readmes` locally to confirm expected violations

- [ ] **Step 1: Run**

```bash
make check-readmes
```

Expected: non-zero exit. Output should list the eight expected violations across the four transport READMEs:

- `ts/packages/over-memory/README.md` — 2 blocks (contracts, loopback)
- `py/packages/over-memory/README.md` — 1 block (loopback)
- `ts/packages/over-redis/README.md` — 3 blocks (contracts, server, client)
- `py/packages/over-redis/README.md` — 2 blocks (server, client)

For each, the violation is either `MISSING-CITATION` or `SOURCE-MISSING` — the existing READMEs have no citation footers for these blocks.

If a block in `ts/packages/protocol/README.md`, `py/packages/protocol/README.md`, or `ts/packages/codegen/README.md` is reported as a violation, the script has a false-positive bug — stop and fix.

- [ ] **Step 2: No commit**

This task only confirms the script behaves as expected on the current state.

---

## Phase 2 — Verbatim compliance fix for the four transport READMEs

### Task 6: Build codegen and verify CLI works

**Files:**
- (None modified; verification step)

- [ ] **Step 1: Build codegen**

```bash
cd ts && pnpm -F @clamator/codegen build
```

Expected: builds without errors. Confirm `ts/packages/codegen/dist/cli.js` exists and is executable.

- [ ] **Step 2: Run codegen `--help` to confirm flags**

```bash
node ts/packages/codegen/dist/cli.js --help 2>&1 | head -30
```

Expected: usage output mentions `--src`, `--out-ts`, `--out-py`, `--manifest`, `--ts-contract-import`. If a flag is missing, stop and report — the plan's codegen invocations assume all five.

- [ ] **Step 3: No commit**

---

### Task 7: over-memory proxy fixtures (TS + Py)

**Files:**
- Create: `ts/packages/over-memory/tests/contracts/arith.ts`
- Create: `ts/packages/over-memory/tests/generated/arith.ts`
- Create: `ts/packages/over-memory/tests/proxy-loopback.test.ts`
- Create: `py/packages/over-memory/tests/generated/__init__.py`
- Create: `py/packages/over-memory/tests/generated/arith.py`
- Create: `py/packages/over-memory/tests/test_proxy_loopback.py`

- [ ] **Step 1: Write the Zod contract**

Create `ts/packages/over-memory/tests/contracts/arith.ts` with exactly this content:

```typescript
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
});
```

- [ ] **Step 2: Run codegen to produce both language outputs**

```bash
mkdir -p ts/packages/over-memory/tests/generated
mkdir -p py/packages/over-memory/tests/generated
node ts/packages/codegen/dist/cli.js \
  --src ts/packages/over-memory/tests/contracts \
  --out-ts ts/packages/over-memory/tests/generated \
  --out-py py/packages/over-memory/tests/generated \
  --manifest /tmp/clam-overmemory-manifest.json \
  --ts-contract-import ../contracts/arith.js
```

Expected: command exits 0. The two output directories now contain `arith.ts` and `arith.py` respectively.

- [ ] **Step 3: Verify the generated files exist and inspect their shapes**

```bash
test -f ts/packages/over-memory/tests/generated/arith.ts
test -f py/packages/over-memory/tests/generated/arith.py
head -30 ts/packages/over-memory/tests/generated/arith.ts
head -30 py/packages/over-memory/tests/generated/arith.py
```

Expected: TS file exports an `ArithClient` class and an `ArithService` interface or type; Py file exports an `ArithClient` class, an `ArithService` ABC, and Pydantic models. Note the exact import paths each file uses — these inform the next steps.

- [ ] **Step 4: Add `__init__.py` for the Py generated package**

Create `py/packages/over-memory/tests/generated/__init__.py` with an empty content (just a newline).

- [ ] **Step 5: Write the TS proxy test**

Create `ts/packages/over-memory/tests/proxy-loopback.test.ts`. The test imports the proxy from the local `./generated/arith.js`, the contract from `./contracts/arith.js`, and the transport from the package's own source. The test must:

1. Construct a `MemoryBus`.
2. Construct a `MemoryRpcServer({ bus })` and register handlers typed as `ArithService` for the `arithContract`.
3. Call `await server.start()`.
4. Construct a `MemoryRpcClient({ bus })` and `await client.start()`.
5. Construct an `ArithClient` proxy wrapping the client (the exact constructor depends on what codegen emits — verify in Step 3 above).
6. Call `await arith.add({ a: 2, b: 3 })` and assert the result equals `{ sum: 5 }`.
7. `await client.stop()` and `await server.stop()`.

Write this in vitest style matching `ts/packages/over-memory/tests/loopback.test.ts`. The key shape:

```typescript
import { describe, it, expect } from 'vitest';
import { MemoryBus, MemoryRpcServer, MemoryRpcClient } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import { ArithClient, type ArithService } from './generated/arith.js';

describe('memory loopback via codegen typed proxy', () => {
  it('round-trips a successful call through ArithClient', async () => {
    const bus = new MemoryBus();
    const server = new MemoryRpcServer({ bus });
    const handlers: ArithService = {
      add: async ({ a, b }) => ({ sum: a + b }),
    };
    server.registerService(arithContract, handlers);
    await server.start();
    const client = new MemoryRpcClient({ bus });
    await client.start();
    const arith = new ArithClient(client);
    const r = await arith.add({ a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop();
    await server.stop();
  });
});
```

If the actual `ArithClient` constructor signature emitted by codegen is different from `new ArithClient(client)` (e.g., it takes an options object), update the test to match the real signature and report the divergence so the plan can be improved.

- [ ] **Step 6: Run the TS test to verify**

```bash
cd ts && pnpm -F @clamator/over-memory build
cd ts && pnpm -F @clamator/over-memory test -- proxy-loopback
```

Expected: test passes.

- [ ] **Step 7: Write the Py proxy test**

Create `py/packages/over-memory/tests/test_proxy_loopback.py`. The test must:

1. Build a `MemoryBus`.
2. Construct a `MemoryRpcServer(bus=bus)`.
3. Register a handler that subclasses `ArithService` (the ABC from the generated module) and implements `add`.
4. `await server.start()`.
5. Construct a `MemoryRpcClient(bus=bus)` and `await client.start()`.
6. Construct an `ArithClient(client)` proxy (verify exact constructor against the generated file).
7. Call `r = await arith.add(AddParams(a=2, b=3))` (or the equivalent signature emitted by codegen — the proxy may accept a Pydantic model or a dict; match what the generated file expects).
8. Assert `r.sum == 5` (or the equivalent shape).
9. `await client.stop()` and `await server.stop()`.

Skeleton (adjust types/imports to match the actual generated file):

```python
import pytest
from clamator_over_memory import MemoryBus, MemoryRpcServer, MemoryRpcClient
from .generated.arith import ArithClient, ArithService, arith_contract, AddParams, AddResult


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)


@pytest.mark.asyncio
async def test_round_trip_via_codegen_typed_proxy():
    bus = MemoryBus()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith_contract, Arith())
    await server.start()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    assert r.sum == 5
    await client.stop()
    await server.stop()
```

If the imports listed (`AddParams`, `AddResult`, `arith_contract`) do not match what codegen emitted in Step 3, update the imports to match. **Do not invent symbols that codegen did not emit.** If codegen emits a different name (e.g., `arith` rather than `arith_contract`), use the real name. If a Pydantic model has a different name (e.g., `AddP`), use the real name.

- [ ] **Step 8: Run the Py test**

```bash
cd py && uv run pytest packages/over-memory/tests/test_proxy_loopback.py -v
```

Expected: test passes. If `pytest-asyncio` is not configured, the test may need `@pytest.mark.asyncio` annotations or the existing `pytest.ini` / `pyproject.toml` already handles it (check `py/packages/over-memory/tests/test_loopback.py` for the existing pattern and match it).

- [ ] **Step 9: Commit**

```bash
git add ts/packages/over-memory/tests/contracts/arith.ts \
        ts/packages/over-memory/tests/generated/arith.ts \
        ts/packages/over-memory/tests/proxy-loopback.test.ts \
        py/packages/over-memory/tests/generated/__init__.py \
        py/packages/over-memory/tests/generated/arith.py \
        py/packages/over-memory/tests/test_proxy_loopback.py
git commit -m "test(over-memory): add codegen typed-proxy fixtures"
```

---

### Task 8: over-memory README requote (TS + Py)

**Files:**
- Modify: `ts/packages/over-memory/README.md`
- Modify: `py/packages/over-memory/README.md`

The current quickstart blocks in these two READMEs are hand-written. Replace them with verbatim quotes of the proxy test files and the contract source.

- [ ] **Step 1: Determine the TS quickstart line range**

```bash
wc -l ts/packages/over-memory/tests/proxy-loopback.test.ts
sed -n '1,$p' ts/packages/over-memory/tests/proxy-loopback.test.ts
```

Note the file's total line count `<L>`. The README quote will cite `ts/packages/over-memory/tests/proxy-loopback.test.ts:1-<L>`.

Also note the contract source line range:

```bash
wc -l ts/packages/over-memory/tests/contracts/arith.ts
```

Note `<C>`. The contract block will cite `ts/packages/over-memory/tests/contracts/arith.ts:1-<C>`.

- [ ] **Step 2: Replace the existing TS README quickstart blocks**

Open `ts/packages/over-memory/README.md` and find the two current code blocks (the contract block and the loopback block). Replace each block's content with the verbatim content of the corresponding source file, immediately followed by the canonical citation footer.

The contract block's content becomes:

```typescript
<verbatim content of ts/packages/over-memory/tests/contracts/arith.ts>
```

with the line below the closing fence reading exactly:

```
(Verbatim from `ts/packages/over-memory/tests/contracts/arith.ts:1-<C>`.)
```

The loopback block's content becomes:

```typescript
<verbatim content of ts/packages/over-memory/tests/proxy-loopback.test.ts>
```

with the citation:

```
(Verbatim from `ts/packages/over-memory/tests/proxy-loopback.test.ts:1-<L>`.)
```

Preserve any surrounding prose in the README (intro paragraphs, "Configuration", "Key surface", etc.). Only the code blocks themselves and their citation footers change.

- [ ] **Step 3: Verify TS README compiles against the check**

```bash
make check-readmes 2>&1 | grep -E "(over-memory/README|FAIL|MISSING|SOURCE-MISSING)" | head -20
```

Expected: `ts/packages/over-memory/README.md` no longer reports violations. If it still fails, the README content does not match the source verbatim — fix the README, not the source.

- [ ] **Step 4: Repeat for the Py README**

Determine the Py quickstart line range:

```bash
wc -l py/packages/over-memory/tests/test_proxy_loopback.py
```

Note `<P>`. Replace the existing quickstart code block in `py/packages/over-memory/README.md` with verbatim content of `py/packages/over-memory/tests/test_proxy_loopback.py:1-<P>`, followed by the citation footer:

```
(Verbatim from `py/packages/over-memory/tests/test_proxy_loopback.py:1-<P>`.)
```

(There is no separate "contract block" in the Py over-memory README — Py contracts live as imported `arith_contract` symbols, not as a separate code block. Skip the contract-block step on the Py side.)

- [ ] **Step 5: Verify Py README**

```bash
make check-readmes 2>&1 | grep -E "(over-memory/README|FAIL|MISSING|SOURCE-MISSING)"
```

Expected: neither `ts/packages/over-memory/README.md` nor `py/packages/over-memory/README.md` reports violations.

- [ ] **Step 6: Commit**

```bash
git add ts/packages/over-memory/README.md py/packages/over-memory/README.md
git commit -m "docs(over-memory): requote quickstart against proxy-fixture tests"
```

---

### Task 9: over-redis proxy fixtures (TS + Py)

**Files:**
- Create: `ts/packages/over-redis/tests/contracts/arith.ts`
- Create: `ts/packages/over-redis/tests/generated/arith.ts`
- Create: `ts/packages/over-redis/tests/proxy-round-trip.test.ts`
- Create: `py/packages/over-redis/tests/generated/__init__.py`
- Create: `py/packages/over-redis/tests/generated/arith.py`
- Create: `py/packages/over-redis/tests/test_proxy_round_trip.py`

- [ ] **Step 1: Write the Zod contract**

Create `ts/packages/over-redis/tests/contracts/arith.ts`:

```typescript
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  ping: defineNotification({ params: z.object({}) }),
});
```

- [ ] **Step 2: Run codegen**

```bash
mkdir -p ts/packages/over-redis/tests/generated
mkdir -p py/packages/over-redis/tests/generated
node ts/packages/codegen/dist/cli.js \
  --src ts/packages/over-redis/tests/contracts \
  --out-ts ts/packages/over-redis/tests/generated \
  --out-py py/packages/over-redis/tests/generated \
  --manifest /tmp/clam-overredis-manifest.json \
  --ts-contract-import ../contracts/arith.js
```

Expected: command exits 0; both `arith.ts` and `arith.py` are produced.

- [ ] **Step 3: Verify and inspect generated outputs**

```bash
head -40 ts/packages/over-redis/tests/generated/arith.ts
head -40 py/packages/over-redis/tests/generated/arith.py
```

Note the actual symbol names (proxy class, ABC, params/result models, contract symbol, notification handler signature).

- [ ] **Step 4: Add `__init__.py` for the Py generated package**

Create `py/packages/over-redis/tests/generated/__init__.py` with empty content (just a newline).

- [ ] **Step 5: Write the TS proxy round-trip test**

Create `ts/packages/over-redis/tests/proxy-round-trip.test.ts`. Mirror the structure of the existing `ts/packages/over-redis/tests/round-trip.test.ts` (skipped without `REDIS_URL`, sets up unique key prefix per test, tears down via key deletion + redis.quit), but use codegen-emitted typed proxies instead of raw `client.call(...)`:

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import IORedis from 'ioredis';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import { ArithClient, type ArithService } from './generated/arith.js';

const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!REDIS_URL)('redis round-trip via codegen typed proxy', () => {
  let prefix: string;

  afterEach(async () => {
    if (!REDIS_URL) return;
    const r = new IORedis(REDIS_URL!);
    const keys = await r.keys(`${prefix}:*`);
    if (keys.length) await r.del(...keys);
    await r.quit();
  });

  it('round-trips a successful call through ArithClient', async () => {
    prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    const handlers: ArithService = {
      add: async ({ a, b }) => ({ sum: a + b }),
      ping: async () => {},
    };
    server.registerService(arithContract, handlers);
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    const arith = new ArithClient(client);
    const r = await arith.add({ a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop();
    await server.stop();
    await sredis.quit();
    await credis.quit();
  });
});
```

If the actual `ArithClient` constructor signature differs from `new ArithClient(client)`, adjust to match the real signature.

- [ ] **Step 6: Run the TS test (locally, with REDIS_URL exported)**

If a local Redis is running:

```bash
REDIS_URL=redis://127.0.0.1:6379 pnpm -F @clamator/over-redis test -- proxy-round-trip
```

Expected: test passes. If no local Redis, run without `REDIS_URL`:

```bash
cd ts && pnpm -F @clamator/over-redis test -- proxy-round-trip
```

Expected: test is skipped (matches existing pattern). The CI environment also runs without Redis for this gate.

- [ ] **Step 7: Write the Py proxy round-trip test**

Create `py/packages/over-redis/tests/test_proxy_round_trip.py`. Mirror the structure of `py/packages/over-redis/tests/test_round_trip.py` (existing pattern: takes `redis_url` and `key_prefix` fixtures, skipped without `REDIS_URL`), substituting the typed proxy:

```python
import pytest
from redis.asyncio import Redis
from clamator_over_redis import RedisRpcServer, RedisRpcClient
from .generated.arith import ArithClient, ArithService, arith_contract, AddParams, AddResult


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)
    async def ping(self, params) -> None:
        return None


@pytest.mark.asyncio
async def test_round_trip_via_codegen_typed_proxy(redis_url, key_prefix, cleanup):
    rs = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith_contract, Arith())
    await server.start()
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    assert r.sum == 5
    await client.stop()
    await server.stop()
    await rs.aclose()
    await rc.aclose()
```

Use the real symbol names from the generated file. The `redis_url`, `key_prefix`, and `cleanup` fixtures are likely defined in a `conftest.py` in `py/packages/over-redis/tests/`; check that file and reuse the existing fixtures rather than defining new ones.

- [ ] **Step 8: Run the Py test**

```bash
cd py && uv run pytest packages/over-redis/tests/test_proxy_round_trip.py -v
```

Expected: test passes (with REDIS_URL) or is skipped (without). Both are acceptable.

- [ ] **Step 9: Commit**

```bash
git add ts/packages/over-redis/tests/contracts/arith.ts \
        ts/packages/over-redis/tests/generated/arith.ts \
        ts/packages/over-redis/tests/proxy-round-trip.test.ts \
        py/packages/over-redis/tests/generated/__init__.py \
        py/packages/over-redis/tests/generated/arith.py \
        py/packages/over-redis/tests/test_proxy_round_trip.py
git commit -m "test(over-redis): add codegen typed-proxy fixtures"
```

---

### Task 10: over-redis README requote (TS + Py)

**Files:**
- Modify: `ts/packages/over-redis/README.md`
- Modify: `py/packages/over-redis/README.md`

- [ ] **Step 1: Determine line ranges**

```bash
wc -l ts/packages/over-redis/tests/contracts/arith.ts
wc -l ts/packages/over-redis/tests/proxy-round-trip.test.ts
wc -l py/packages/over-redis/tests/test_proxy_round_trip.py
```

Note the three line counts. The README will cite each at `1-<count>`.

- [ ] **Step 2: Replace the TS README's three hand-written blocks**

Open `ts/packages/over-redis/README.md`. Find the three current code blocks: contracts, server, client. The new layout consolidates them into a single quickstart that quotes `proxy-round-trip.test.ts` (which contains both server and client setup) plus a contracts block that quotes `contracts/arith.ts`.

Replace the existing structure with:

1. **Contract block** — verbatim quote of `ts/packages/over-redis/tests/contracts/arith.ts`, followed by:
   ```
   (Verbatim from `ts/packages/over-redis/tests/contracts/arith.ts:1-<C>`.)
   ```
2. **Quickstart block** — verbatim quote of `ts/packages/over-redis/tests/proxy-round-trip.test.ts`, followed by:
   ```
   (Verbatim from `ts/packages/over-redis/tests/proxy-round-trip.test.ts:1-<L>`.)
   ```

If the README currently has separate "Server" and "Client" sections each with its own code block, consolidate them: this single test demonstrates both sides round-trip together. Remove the now-redundant separate server/client blocks. Preserve all surrounding prose ("Configuration", "Key surface", "When to reach for this vs.", "Links").

- [ ] **Step 3: Verify**

```bash
make check-readmes 2>&1 | grep -E "ts/packages/over-redis/README"
```

Expected: no FAIL/MISSING for that README.

- [ ] **Step 4: Replace the Py README's two hand-written blocks**

Open `py/packages/over-redis/README.md`. The Py side has two non-compliant blocks: `server.py` (drifted) and `client.py` (hand-written). Consolidate into a single quickstart quoting `py/packages/over-redis/tests/test_proxy_round_trip.py`:

```
(Verbatim from `py/packages/over-redis/tests/test_proxy_round_trip.py:1-<P>`.)
```

Remove any now-redundant separate server/client blocks. Preserve surrounding prose.

- [ ] **Step 5: Verify**

```bash
make check-readmes 2>&1 | grep -E "py/packages/over-redis/README"
```

Expected: no FAIL/MISSING.

- [ ] **Step 6: Commit**

```bash
git add ts/packages/over-redis/README.md py/packages/over-redis/README.md
git commit -m "docs(over-redis): requote quickstart against proxy-fixture tests"
```

---

### Task 11: Run the full check + per-language tests

- [ ] **Step 1: Full check**

```bash
make check-readmes
```

Expected: exits zero. Output: `OK — all README code blocks verbatim against cited sources.`

- [ ] **Step 2: TS tests**

```bash
cd ts && pnpm -r test
```

Expected: all package tests pass (over-redis proxy test skips without `REDIS_URL`).

- [ ] **Step 3: Py tests**

```bash
cd py && uv run pytest
```

Expected: passes (over-redis proxy test skips without `REDIS_URL`).

- [ ] **Step 4: TS lint**

```bash
cd ts && pnpm -r lint
```

Expected: clean.

- [ ] **Step 5: No commit**

Verification only. If any step fails, fix and re-commit on the relevant earlier task.

---

### Task 12: Flip the CI step to blocking

**Files:**
- Modify: `.github/workflows/ts.yml`

- [ ] **Step 1: Remove `continue-on-error`**

Edit `.github/workflows/ts.yml`. Find:

```yaml
      - name: Check READMEs verbatim
        continue-on-error: true
        run: node scripts/check-readme-verbatim.mjs
```

Replace with:

```yaml
      - name: Check READMEs verbatim
        run: node scripts/check-readme-verbatim.mjs
```

(Just remove the `continue-on-error: true` line.)

- [ ] **Step 2: Verify**

```bash
grep -c "continue-on-error" .github/workflows/ts.yml
```

Expected: prints `0`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ts.yml
git commit -m "ci(ts): make check-readme-verbatim a blocking gate"
```

---

## Phase 3 — Gap closure

### Task 13: Add gap #1 (notify-vs-method) to both protocol READMEs

**Files:**
- Modify: `ts/packages/protocol/README.md`
- Modify: `py/packages/protocol/README.md`

- [ ] **Step 1: Read both protocol READMEs** to find the right insertion point. Look for the section that introduces methods and notifications (typically near "Defining a contract" or "Key exports"). The new subsection lands directly after that section.

- [ ] **Step 2: Insert the notify-vs-method subsection in `ts/packages/protocol/README.md`**

After the "Defining a contract" or "Key exports" section, insert the following Markdown subsection:

```markdown
## Method or notification?

Both methods and notifications send a request envelope; only methods produce a response envelope. Pick by the caller's needs, not the handler's.

- **Use a method** when the caller needs to know whether the operation succeeded, get a value back, surface a structured `RpcError`, or sequence subsequent calls on completion. Methods carry a request id and the caller waits for the matching response or a timeout.
- **Use a notification** when the caller is doing fire-and-forget work where neither success/failure nor a return value matters in the moment — telemetry, cache-busting, status pings. Notifications have no request id and produce no response; the caller cannot tell whether the handler ran, succeeded, or threw.

If you would otherwise add a method that returns nothing solely to confirm delivery, prefer a method returning `z.object({})` over a notification — the response envelope is the confirmation. Pick a notification only when "did this run?" is genuinely not a question the caller will ever ask.
```

- [ ] **Step 3: Insert the symmetric subsection in `py/packages/protocol/README.md`**

Same content, with the Zod reference adjusted: replace `z.object({})` with `BaseModel` so the reference matches the Py-side surface:

```markdown
## Method or notification?

Both methods and notifications send a request envelope; only methods produce a response envelope. Pick by the caller's needs, not the handler's.

- **Use a method** when the caller needs to know whether the operation succeeded, get a value back, surface a structured `RpcError`, or sequence subsequent calls on completion. Methods carry a request id and the caller waits for the matching response or a timeout.
- **Use a notification** when the caller is doing fire-and-forget work where neither success/failure nor a return value matters in the moment — telemetry, cache-busting, status pings. Notifications have no request id and produce no response; the caller cannot tell whether the handler ran, succeeded, or threw.

If you would otherwise add a method that returns nothing solely to confirm delivery, prefer a method returning an empty Pydantic model over a notification — the response envelope is the confirmation. Pick a notification only when "did this run?" is genuinely not a question the caller will ever ask.
```

- [ ] **Step 4: Verify the check still passes**

```bash
make check-readmes
```

Expected: zero violations. The new subsection contains no fenced code blocks in `ts`/`typescript`/`python`/`py`, so the check has nothing to validate against in the new content.

- [ ] **Step 5: Commit**

```bash
git add ts/packages/protocol/README.md py/packages/protocol/README.md
git commit -m "docs(protocol): add 'method or notification?' guidance to both READMEs"
```

---

### Task 14: Add gap #2 (RpcError shape) — fixture + READMEs

**Files:**
- Create: `ts/packages/protocol/tests/rpc-error.test.ts`
- Create: `py/packages/protocol/tests/test_rpc_error.py`
- Modify: `ts/packages/protocol/README.md`
- Modify: `py/packages/protocol/README.md`

- [ ] **Step 1: Confirm the protocol package has a tests directory and check the existing test pattern**

```bash
ls ts/packages/protocol/tests/ 2>/dev/null || echo "no ts protocol tests dir"
ls py/packages/protocol/tests/ 2>/dev/null || echo "no py protocol tests dir"
```

If a tests directory does not exist, create it. If it does, look at one existing test to confirm imports and runner conventions match what this task uses.

- [ ] **Step 2: Read the protocol package source for `RpcError`**

```bash
grep -rn "class RpcError\|export class RpcError" ts/packages/protocol/src/
grep -rn "class RpcError" py/packages/protocol/src/
```

Note the exact constructor signature on each side. The fixture must use the real signature, not a guessed one.

- [ ] **Step 3: Write the TS RpcError fixture**

Create `ts/packages/protocol/tests/rpc-error.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { RpcError } from '../src/index.js';

describe('RpcError', () => {
  it('constructs with code, message, and data', () => {
    const err = new RpcError({ code: -32001, message: 'forbidden', data: { reason: 'no-token' } });
    expect(err.code).toBe(-32001);
    expect(err.message).toBe('forbidden');
    expect(err.data).toEqual({ reason: 'no-token' });
  });
});
```

If the actual constructor signature is `new RpcError(code, message, data)` (positional) rather than the options-object shape, update accordingly. Step 2 produces the canonical signature; use it.

- [ ] **Step 4: Run the TS test**

```bash
cd ts && pnpm -F @clamator/protocol test -- rpc-error
```

Expected: passes. If `RpcError` exports differently, adjust the import; the fixture must compile and run.

- [ ] **Step 5: Write the Py RpcError fixture**

Create `py/packages/protocol/tests/test_rpc_error.py`:

```python
from clamator_protocol import RpcError


def test_rpc_error_construction():
    err = RpcError(code=-32001, message="forbidden", data={"reason": "no-token"})
    assert err.code == -32001
    assert err.message == "forbidden"
    assert err.data == {"reason": "no-token"}
```

If the actual Py constructor signature differs (positional args, different attribute names), match the real signature.

- [ ] **Step 6: Run the Py test**

```bash
cd py && uv run pytest packages/protocol/tests/test_rpc_error.py -v
```

Expected: passes.

- [ ] **Step 7: Determine line ranges for the README quotes**

```bash
wc -l ts/packages/protocol/tests/rpc-error.test.ts
wc -l py/packages/protocol/tests/test_rpc_error.py
```

Note `<T>` (TS) and `<P>` (Py).

- [ ] **Step 8: Add an "Errors" subsection to `ts/packages/protocol/README.md`**

After the "Key exports" section, insert:

````markdown
## Errors

Throw `RpcError` from a handler to surface a structured JSON-RPC error to the caller. The constructor takes a `code`, a `message`, and an optional `data` payload:

```typescript
<verbatim content of ts/packages/protocol/tests/rpc-error.test.ts>
```

(Verbatim from `ts/packages/protocol/tests/rpc-error.test.ts:1-<T>`.)

Reserved JSON-RPC error codes (`-32600` to `-32603` for protocol-level errors, `-32000` to `-32099` reserved for transport implementations) are owned by the protocol layer; pick application-specific codes outside that range.
````

- [ ] **Step 9: Add the symmetric subsection to `py/packages/protocol/README.md`**

````markdown
## Errors

Raise `RpcError` from a handler to surface a structured JSON-RPC error to the caller. The constructor takes a `code`, a `message`, and an optional `data` payload:

```python
<verbatim content of py/packages/protocol/tests/test_rpc_error.py>
```

(Verbatim from `py/packages/protocol/tests/test_rpc_error.py:1-<P>`.)

Reserved JSON-RPC error codes (`-32600` to `-32603` for protocol-level errors, `-32000` to `-32099` reserved for transport implementations) are owned by the protocol layer; pick application-specific codes outside that range.
````

- [ ] **Step 10: Verify**

```bash
make check-readmes
```

Expected: zero violations.

- [ ] **Step 11: Commit**

```bash
git add ts/packages/protocol/tests/rpc-error.test.ts \
        py/packages/protocol/tests/test_rpc_error.py \
        ts/packages/protocol/README.md \
        py/packages/protocol/README.md
git commit -m "docs(protocol): document RpcError shape with fixture-backed example"
```

---

### Task 15: Add gap #3 (codegen ABC shape) to `ts/packages/codegen/README.md`

**Files:**
- Modify: `ts/packages/codegen/README.md`

- [ ] **Step 1: Identify a representative ABC slice in an existing generated file**

The generated Py file under `py/packages/over-redis/tests/generated/arith.py` (from Task 9) contains both an ABC (`ArithService`) and a typed proxy (`ArithClient`). Find a small contiguous slice that shows the ABC method signatures clearly.

```bash
grep -n "class ArithService\|class ArithClient\|async def " py/packages/over-redis/tests/generated/arith.py
```

Pick a line range — for example, the `class ArithService` declaration through the end of its last method. Note the exact start and end line numbers.

- [ ] **Step 2: Add an "Emitted ABC shape" subsection to `ts/packages/codegen/README.md`**

After the "Output layout" section, insert:

````markdown
## Emitted ABC shape (Python side)

For each method in a contract, the Py emitter produces an abstract method on a `<Service>Service` ABC, typed in terms of the Pydantic models for params and result. Notifications produce abstract methods returning `None`. A representative slice:

```python
<verbatim content of py/packages/over-redis/tests/generated/arith.py:<start>-<end>>
```

(Verbatim from `py/packages/over-redis/tests/generated/arith.py:<start>-<end>`.)

Method-name conversion: a Zod method declared as `addEvent` on the contract becomes `add_event` on the ABC (camelCase in TS, snake_case in Py). Subclass the ABC to register a service: `class MyService(ArithService): async def add(self, params): ...`. The TS side emits a sibling `<Service>Service` interface plus a `<Service>Client` proxy class; consult the matching `arith.ts` under the same `tests/generated/` directory for the TS surface.
````

- [ ] **Step 3: Verify**

```bash
make check-readmes 2>&1 | grep -E "ts/packages/codegen"
```

Expected: no violations.

- [ ] **Step 4: Commit**

```bash
git add ts/packages/codegen/README.md
git commit -m "docs(codegen): document emitted ABC shape with verbatim slice from generated fixture"
```

---

### Task 16: Source-read pass for gaps #4–9

This task produces the canonical wording for the gap-#4–9 comments. The output is internal notes used by Tasks 17–20. **Do not commit notes.** Save them to `/tmp/clam-gap-notes.md` for the duration of the implementation.

- [ ] **Step 1: Gap #4 — `register_service` timing**

Read both transport-package server source files for the `register_service` method and any associated lifecycle invariants:

```bash
grep -rn "register_service\|registerService" py/packages/over-redis/src/ ts/packages/over-redis/src/ | head -20
```

Read the surrounding code: does it raise if called after `start()`? Does it queue? Document the exact behavior in `/tmp/clam-gap-notes.md` under a `## Gap 4` heading, with `path:line` references.

- [ ] **Step 2: Gap #5 — `stop()` drain semantics**

```bash
grep -rn "async def stop\|async stop\(" py/packages/over-redis/src/ ts/packages/over-redis/src/ | head -10
```

Read the body of `stop()` on each side. Does it await in-flight handlers? Does it have a grace period? What is the grace-period option name and default value? Note `path:line` for each fact.

- [ ] **Step 3: Gap #6 — owned redis keys**

```bash
grep -rn "key_prefix\|keyPrefix" py/packages/over-redis/src/ ts/packages/over-redis/src/ | grep -E ":\s*['\"]\\\$" | head -20
grep -rn "f.*key_prefix\|`\\\${keyPrefix}" py/packages/over-redis/src/ ts/packages/over-redis/src/ | head -30
```

Find every place the source constructs a Redis key from `key_prefix` / `keyPrefix`. List each pattern (e.g., `${keyPrefix}:requests`, `${keyPrefix}:responses`, `${keyPrefix}:cg:<service>`). Document the full set with one-line purposes.

- [ ] **Step 4: Gap #7 — consumer-group / worker-pool semantics**

```bash
grep -rn "XGROUP\|xgroup\|consumer_group\|consumerGroup" py/packages/over-redis/src/ ts/packages/over-redis/src/ | head -20
```

Determine whether multiple `RedisRpcServer` instances sharing a `keyPrefix` form a competing-consumers pool (single consumer group, multiple consumer names) or fan-out (each server reads every message). Document the behavior with `path:line`.

- [ ] **Step 5: Gap #8 — connection ownership**

```bash
grep -rn "self\.redis\|this\.redis" py/packages/over-redis/src/ ts/packages/over-redis/src/ | grep -E "close|quit|aclose|disconnect" | head -20
```

Determine: when `redis=` is passed to `RedisRpcServer`, does `stop()` close it? Document with `path:line`.

- [ ] **Step 6: Gap #9 — client retry, default timeout, cancel propagation**

```bash
grep -rn "default_timeout\|defaultTimeoutMs\|retry\|cancel" py/packages/over-redis/src/ ts/packages/over-redis/src/ | head -30
```

Document:
- Default timeout value if no `defaultTimeoutMs` / `default_timeout_ms` is passed.
- Retry policy on disconnect (likely none — confirm).
- Cancel propagation: when the client cancels (e.g., timeout fires), does the server learn? Likely no — confirm.

- [ ] **Step 7: Confirm `/tmp/clam-gap-notes.md` is complete**

The file should now have one section per gap (#4–9), each with the canonical wording suitable for use as a code comment, plus `path:line` references for the underlying behavior. Tasks 17–20 will quote from these notes.

- [ ] **Step 8: No commit**

The notes file is intentionally not committed.

---

### Task 17: Add gaps #4, #5, #7, #8, #9 comments + gap #6 table to `ts/packages/over-redis/README.md`

**Files:**
- Modify: `ts/packages/over-redis/README.md`

These edits go **into the README** as comments inside the verbatim-quoted code blocks (permitted by the new rule from Task 1) plus one Markdown table for gap #6.

- [ ] **Step 1: Add inline comments to the quickstart code block**

Find the verbatim quickstart block introduced by Task 10. Add the following comments **in the README copy only** (the source test does not gain these comments). Use canonical wording from `/tmp/clam-gap-notes.md`:

- On the `server.registerService(arithContract, handlers)` line, append an end-of-line comment: `// must precede start()` (gap #4).
- On the `await server.start()` line, append an above-statement comment line `// listens for incoming requests; idempotent if already started` (or whatever Phase 3.0 source-read confirmed; if not idempotent, document as such).
- On the `new RedisRpcServer({ redis: sredis, ... })` line, append above-statement comment: `// injected ioredis instance; not closed by server.stop() — caller owns its lifecycle` (gap #8).
- On the `new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 3000 })` line, append above-statement comments listing: default timeout if not set (per Phase 3.0), no automatic retry on disconnect, server-side cancel propagation y/n per Phase 3.0 (gap #9).
- On the `await server.stop()` line, append end-of-line comment: `// drains in-flight handlers, then cancels` (gap #5; include the actual grace-period option and default value if applicable).

The exact comment wording comes from `/tmp/clam-gap-notes.md`. Do not invent. If a fact is uncertain, the source-read pass produces evidence; cite it.

- [ ] **Step 2: Add a "Worker-pool semantics" subsection (gap #7)**

After the "Configuration" section, insert:

```markdown
## Worker-pool semantics

Multiple `RedisRpcServer` instances sharing a `keyPrefix` form a competing-consumers pool — they share a single Redis consumer group keyed by service. Each request is delivered to exactly one server in the pool; a request claimed by an idle/crashed consumer is reclaimed after `consumerClaimIdleMs`. To run a single-consumer scenario, run one server.
```

(Wording to be tightened against the Phase 3.0 source-read; if behavior differs from the above, match what the source actually does.)

- [ ] **Step 3: Add a "Keys owned under `keyPrefix`" subsection (gap #6)**

After the "Worker-pool semantics" section, insert a Markdown table with one row per Redis key pattern the source-read identified:

```markdown
## Keys owned under `keyPrefix`

| Pattern | Type | Purpose |
|---|---|---|
| `<keyPrefix>:requests` | stream | inbound request envelopes |
| `<keyPrefix>:responses` | stream | outbound response envelopes |
| `<keyPrefix>:cg:<service>` | consumer group | competing-consumers pool per service |
| ... | ... | ... |
```

Replace the placeholder rows with the actual patterns enumerated in `/tmp/clam-gap-notes.md` § Gap 6. **Do not ship a placeholder row**; if Phase 3.0 found four patterns, the table has four rows.

- [ ] **Step 4: Verify**

```bash
make check-readmes
```

Expected: zero violations. The added comments do not break verbatim because they are comments, and the new prose subsections contain no quoted code blocks.

- [ ] **Step 5: Commit**

```bash
git add ts/packages/over-redis/README.md
git commit -m "docs(over-redis): document timing, drain, ownership, retry, keys, worker-pool"
```

---

### Task 18: Mirror Task 17 onto `py/packages/over-redis/README.md`

**Files:**
- Modify: `py/packages/over-redis/README.md`

The Py-side mirror of Task 17. The same six gaps; same canonical wording from `/tmp/clam-gap-notes.md`; comment syntax becomes `#` instead of `//`; argument names become snake_case.

- [ ] **Step 1: Add inline comments to the Py quickstart block**

For each comment Task 17 placed in the TS quickstart, place its Py-syntactic mirror in the Py quickstart:

- `server.register_service(arith_contract, Arith())  # must precede start()` (gap #4).
- Above `await server.start()`: `# listens for incoming requests; idempotent if already started` (gap #4 sequel).
- Above `RedisRpcServer(redis=rs, key_prefix=key_prefix)`: `# injected redis.asyncio instance; not closed by server.stop() — caller owns its lifecycle` (gap #8).
- Above `RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)`: comments per gap #9 (default timeout, no automatic retry, cancel propagation y/n).
- `await server.stop()  # drains in-flight handlers, then cancels` (gap #5).

- [ ] **Step 2: Add the symmetric Py-side `## Worker-pool semantics` subsection**

Same content as Task 17 Step 2, with Py-side names where appropriate.

- [ ] **Step 3: Add the symmetric Py-side `## Keys owned under \`key_prefix\`` subsection**

Same table as Task 17 Step 3, with `<key_prefix>` placeholder. The patterns themselves are language-neutral (Redis keys are bytes; both sides use the same prefix).

- [ ] **Step 4: Verify**

```bash
make check-readmes
```

Expected: zero violations.

- [ ] **Step 5: Commit**

```bash
git add py/packages/over-redis/README.md
git commit -m "docs(over-redis): mirror gap closures onto Py README"
```

---

### Task 19: Add symmetric gap entries (and N/A notes) to `ts/packages/over-memory/README.md`

**Files:**
- Modify: `ts/packages/over-memory/README.md`

The over-memory README receives the same gap closures, but with N/A notes where the concept does not apply.

- [ ] **Step 1: Add inline comments to the quickstart block**

- `server.registerService(arithContract, handlers)  // must precede start()` (gap #4 — applies identically).
- Above `await server.start()`: `// in-process loopback; idempotent if already started` (gap #4 sequel; symmetry phrasing).
- Above `new MemoryRpcServer({ bus })`: no connection-ownership note (gap #8 N/A; see new subsection below).
- Above `new MemoryRpcClient({ bus })`: gap #9 reduced — only timeout + cancel apply; no retry because calls are local.
- `await server.stop()  // drains in-flight handlers; cancels after grace` (gap #5; same as redis side, note grace-period default if applicable per Phase 3.0).

- [ ] **Step 2: Add a "Worker-pool semantics" subsection with N/A note (gap #7)**

```markdown
## Worker-pool semantics

N/A — this transport is a single-process loopback. Multiple `MemoryRpcServer` instances on the same `MemoryBus` do not form a competing-consumers pool because there is no shared substrate; each bus is in-memory to its constructing process. For cross-process worker-pool behavior, use `@clamator/over-redis`.
```

- [ ] **Step 3: Add a "Keys owned" subsection with N/A note (gap #6)**

```markdown
## Owned external state

N/A — `MemoryBus` owns no external state. There are no Redis keys, no streams, no files, no sockets. The bus is garbage-collected with the process.
```

- [ ] **Step 4: Add a "Connection ownership" subsection with N/A note (gap #8)**

```markdown
## Connection ownership

N/A — there is no external connection to own. `MemoryRpcServer` and `MemoryRpcClient` share a `MemoryBus` that lives entirely in-process; `stop()` releases its references without closing any external resource.
```

- [ ] **Step 5: Verify**

```bash
make check-readmes
```

Expected: zero violations.

- [ ] **Step 6: Commit**

```bash
git add ts/packages/over-memory/README.md
git commit -m "docs(over-memory): document timing, drain, and explicit N/A for redis-only concerns"
```

---

### Task 20: Mirror Task 19 onto `py/packages/over-memory/README.md`

**Files:**
- Modify: `py/packages/over-memory/README.md`

- [ ] **Step 1: Add inline `#`-syntax comments mirroring Task 19 Step 1**

Same comment content; Py syntax. snake_case argument names. Use canonical wording from `/tmp/clam-gap-notes.md`.

- [ ] **Step 2: Add the three N/A subsections** ("Worker-pool semantics", "Owned external state", "Connection ownership"), same content as Task 19 Steps 2–4.

- [ ] **Step 3: Verify**

```bash
make check-readmes
```

Expected: zero violations.

- [ ] **Step 4: Commit**

```bash
git add py/packages/over-memory/README.md
git commit -m "docs(over-memory): mirror gap closures and N/A notes onto Py README"
```

---

### Task 21: Final verification

- [ ] **Step 1: Full check**

```bash
make check-readmes
```

Expected: `OK — all README code blocks verbatim against cited sources.`

- [ ] **Step 2: Per-language unit tests**

```bash
make test
```

Expected: TS and Py per-package tests pass. Over-redis proxy tests skip without `REDIS_URL`.

- [ ] **Step 3: Lint**

```bash
make lint
```

Expected: clean.

- [ ] **Step 4: Manual eyeball pass**

Open all seven READMEs in a Markdown viewer (or in GitHub by pushing to a branch and viewing the rendered README). Confirm:

- Quickstarts read sensibly with the new contract/proxy fixtures.
- The new prose subsections (notify-vs-method, errors, worker-pool, keys-owned, connection-ownership, emitted ABC shape) flow with the surrounding sections — no abrupt topic shifts, no orphaned subsections.
- Code-comment annotations are placed sensibly per the comment-placement guidance from AGENTS.md (end-of-line for short keywords, above-statement for full sentences).

- [ ] **Step 5: No commit**

Verification only. Hand off to user for the validation experiment (re-run the original porting experiment with a fresh agent and the updated READMEs).

---

## Self-review summary

After all tasks complete, confirm:

- AGENTS.md § 6 has the new wording (Task 1).
- `scripts/check-readme-verbatim.mjs` exists, the Makefile target works, the CI step runs blocking (Tasks 2, 3, 4, 12).
- The four transport READMEs and their proxy fixtures exist and are tested (Tasks 7–10).
- The 9 gaps are addressed across 7 READMEs, with symmetric N/A notes on the over-memory side for redis-only concerns (Tasks 13–20).
- `make check-readmes` returns zero, `make test` returns zero, `make lint` returns zero (Task 21).
- No new fixture files were committed beyond those listed in the File Structure section.
- No `Co-Authored-By` trailers in commit messages (per AGENTS.md § 8).

If any of these is not true, stop before declaring the work done.

## Out of scope (do not do these)

- No `make interop` runs, no docker invocations, no Redis-touching commands.
- No edits to existing design or plan documents under `docs/`.
- No CHANGELOG entries.
- No new top-level READMEs.
- No edits to per-package `AGENTS.md` files.
- No changes to `package.json` or `pyproject.toml` beyond what fixture additions require (and currently no such change is foreseen).
