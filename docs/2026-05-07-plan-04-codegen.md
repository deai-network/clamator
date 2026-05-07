# Codegen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@clamator/codegen` (TS-only npm package; ships a CLI). Walks Zod-defined contracts, produces TS wrappers and Py Pydantic models + `<Service>Client`/`<Service>Service` ABC + `METHODS` dict and an emitted `Contract` object.

**Architecture:** Three pipeline stages: (a) **load** — use the `tsx` ESM loader to import each `*.ts` file under `--src` and collect every exported `Contract` produced by `defineContract`; (b) **lower** — convert each Zod schema to JSON Schema (`zod-to-json-schema`, target `jsonSchema7`) and to a normalized internal IR; (c) **emit** — emit per-service TS files (string templates) and per-service Py files (Pydantic models via `datamodel-code-generator` shell-out, then hand-written client/service/contract sections appended). Output is deterministic; re-running with no source change produces an empty diff.

**Tech Stack:** TypeScript 5 (ESM), `zod`, `zod-to-json-schema`, `tsx` (ESM loader), `commander` (CLI), `prettier` (NOT used — design says no formatter invocation). Shells out to `datamodel-code-generator` (Python) — requires Python + that tool reachable. Tests use vitest + golden fixtures + a Python invocation (skip if Python unavailable, fail loudly).

**Depends on:** plan 02 (`@clamator/protocol` for type imports in generated TS code; `clamator-protocol` for `Contract`/`MethodEntry` referenced from generated Py).

---

## File Structure

- Create: `ts/packages/codegen/package.json`
- Create: `ts/packages/codegen/tsconfig.json`
- Create: `ts/packages/codegen/AGENTS.md`
- Create: `ts/packages/codegen/LICENSE` — symlink
- Create: `ts/packages/codegen/src/cli.ts` — CLI entry; `bin` field points here
- Create: `ts/packages/codegen/src/load.ts` — discover + import contracts
- Create: `ts/packages/codegen/src/ir.ts` — normalized IR types
- Create: `ts/packages/codegen/src/lower.ts` — Zod → IR + JSON Schema
- Create: `ts/packages/codegen/src/emit-ts.ts` — emit TS wrappers
- Create: `ts/packages/codegen/src/emit-py.ts` — emit Py wrappers (calls `datamodel-code-generator`)
- Create: `ts/packages/codegen/src/manifest.ts` — schema-hash manifest output
- Create: `ts/packages/codegen/src/case.ts` — case conversion utilities (camel↔snake, PascalCase from kebab)
- Create: `ts/packages/codegen/src/index.ts` — programmatic API re-exports (used by tests)
- Create: `ts/packages/codegen/tests/case.test.ts`
- Create: `ts/packages/codegen/tests/load.test.ts`
- Create: `ts/packages/codegen/tests/lower.test.ts`
- Create: `ts/packages/codegen/tests/emit-ts.test.ts`
- Create: `ts/packages/codegen/tests/emit-py.test.ts`
- Create: `ts/packages/codegen/tests/cli.test.ts`
- Create: `ts/packages/codegen/tests/fixtures/contracts/arith.ts`
- Create: `ts/packages/codegen/tests/fixtures/contracts/notifications.ts`
- Create: `ts/packages/codegen/tests/fixtures/expected/ts/arith.ts` — golden
- Create: `ts/packages/codegen/tests/fixtures/expected/py/arith.py` — golden

---

## Task 1: TS scaffold + CLI shell

**Files:**
- Create: `ts/packages/codegen/package.json`
- Create: `ts/packages/codegen/tsconfig.json`
- Create: `ts/packages/codegen/src/cli.ts` (stub)
- Create: `ts/packages/codegen/src/index.ts` (stub)
- Create: `ts/packages/codegen/LICENSE` (symlink)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@clamator/codegen",
  "version": "0.1.0",
  "description": "Codegen CLI: Zod contracts → TS + Py wrappers (pre-1.0).",
  "license": "Apache-2.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": { "clamator-codegen": "./dist/cli.js" },
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist", "LICENSE"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc -p tsconfig.json && chmod +x dist/cli.js",
    "clean": "rm -rf dist .tsbuildinfo",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@clamator/protocol": "0.1.0",
    "commander": "^12.1.0",
    "tsx": "^4.19.0",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "tsBuildInfoFile": ".tsbuildinfo" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Symlink LICENSE**

```bash
ln -s ../../../LICENSE ts/packages/codegen/LICENSE
```

- [ ] **Step 4: Write `src/cli.ts` shebang stub**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();
program
  .name('clamator-codegen')
  .description('Generate TS + Py wrappers from Zod contracts')
  .requiredOption('--src <dir>', 'directory containing *.ts files exporting defineContract calls')
  .option('--out-ts <dir>', 'output dir for generated TS wrappers')
  .option('--out-py <dir>', 'output dir for generated Py wrappers')
  .option('--manifest <path>', 'optional cross-side manifest output')
  .option('--json-schema-target <name>', 'jsonSchema7 | openApi3', 'jsonSchema7')
  .option('--ts-contract-import <path>', 'how generated TS imports the source contract')
  .option('--watch', 'rebuild on src changes')
  .action(async (_opts) => {
    throw new Error('not implemented yet');
  });

program.parseAsync().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Write `src/index.ts` empty stub**

```typescript
export {};
```

- [ ] **Step 6: Install + build**

```bash
cd ts && pnpm install
pnpm --filter @clamator/codegen build
```

Expected: `dist/cli.js` produced, executable bit set.

- [ ] **Step 7: Commit**

```bash
git add ts/packages/codegen/package.json ts/packages/codegen/tsconfig.json ts/packages/codegen/src/cli.ts ts/packages/codegen/src/index.ts ts/packages/codegen/LICENSE ts/pnpm-lock.yaml
git commit -m "feat(ts/codegen): scaffold @clamator/codegen package + CLI stub"
```

---

## Task 2: Case conversion helpers

**Files:**
- Create: `ts/packages/codegen/src/case.ts`
- Create: `ts/packages/codegen/tests/case.test.ts`

- [ ] **Step 1: Write failing test `tests/case.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { camelToSnake, kebabAndCamelToPascal, snakeToCamel } from '../src/case.js';

describe('case conversions', () => {
  it('camelToSnake', () => {
    expect(camelToSnake('processId')).toBe('process_id');
    expect(camelToSnake('alreadySnake')).toBe('already_snake');
    expect(camelToSnake('lower')).toBe('lower');
    expect(camelToSnake('aBC')).toBe('a_b_c');
  });

  it('snakeToCamel', () => {
    expect(snakeToCamel('process_id')).toBe('processId');
    expect(snakeToCamel('alreadyCamel')).toBe('alreadyCamel');
  });

  it('kebabAndCamelToPascal', () => {
    expect(kebabAndCamelToPascal('engine')).toBe('Engine');
    expect(kebabAndCamelToPascal('excavator-engine')).toBe('ExcavatorEngine');
    expect(kebabAndCamelToPascal('processStream')).toBe('ProcessStream');
  });
});
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Write `src/case.ts`**

```typescript
export function camelToSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();
}

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function kebabAndCamelToPascal(s: string): string {
  // Split on hyphens, then PascalCase each segment (preserving inner caps if camelCase).
  return s.split('-').map(seg => seg.charAt(0).toUpperCase() + seg.slice(1)).join('');
}
```

- [ ] **Step 4: Run — passes**

```bash
pnpm --filter @clamator/codegen test
```

- [ ] **Step 5: Commit**

```bash
git add ts/packages/codegen/src/case.ts ts/packages/codegen/tests/case.test.ts
git commit -m "feat(ts/codegen): case conversion helpers"
```

---

## Task 3: Contract loader

**Files:**
- Create: `ts/packages/codegen/src/load.ts`
- Create: `ts/packages/codegen/tests/load.test.ts`
- Create: `ts/packages/codegen/tests/fixtures/contracts/arith.ts`
- Create: `ts/packages/codegen/tests/fixtures/contracts/notifications.ts`

- [ ] **Step 1: Write fixture contracts**

`tests/fixtures/contracts/arith.ts`:
```typescript
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number().int(), b: z.number().int() }),
    result: z.object({ sum: z.number().int() }),
  }),
  divide: defineMethod({
    params: z.object({ a: z.number().int(), b: z.number().int() }),
    result: z.object({ q: z.number(), r: z.number().int() }),
  }),
});
```

`tests/fixtures/contracts/notifications.ts`:
```typescript
import { z } from 'zod';
import { defineContract, defineNotification } from '@clamator/protocol';

export const notificationsContract = defineContract('notifications', {
  ping: defineNotification({ params: z.object({ tag: z.string().optional() }) }),
});
```

- [ ] **Step 2: Write failing test `tests/load.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContracts } from '../src/load.js';

describe('loadContracts', () => {
  it('discovers and imports contracts from a directory', async () => {
    const dir = path.resolve(__dirname, 'fixtures/contracts');
    const contracts = await loadContracts(dir);
    const names = contracts.map(c => c.contract.service).sort();
    expect(names).toEqual(['arith', 'notifications']);
  });

  it('attaches the source file path to each contract', async () => {
    const dir = path.resolve(__dirname, 'fixtures/contracts');
    const contracts = await loadContracts(dir);
    const arith = contracts.find(c => c.contract.service === 'arith')!;
    expect(arith.sourceFile).toMatch(/arith\.ts$/);
  });
});
```

- [ ] **Step 3: Run — fails**

- [ ] **Step 4: Write `src/load.ts`**

```typescript
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import type { Contract } from '@clamator/protocol';

export interface LoadedContract {
  contract: Contract<string, Record<string, never>> | { service: string; methods: Record<string, unknown> };
  sourceFile: string;
}

function isContract(v: unknown): v is { service: string; methods: Record<string, unknown> } {
  return typeof v === 'object' && v !== null
    && typeof (v as { service?: unknown }).service === 'string'
    && typeof (v as { methods?: unknown }).methods === 'object'
    && (v as { methods: unknown }).methods !== null;
}

export async function loadContracts(srcDir: string): Promise<LoadedContract[]> {
  const entries = readdirSync(srcDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.ts'));
  const out: LoadedContract[] = [];
  for (const e of entries) {
    const full = path.join(srcDir, e.name);
    const mod = await tsImport(pathToFileURL(full).href, import.meta.url);
    for (const exportName of Object.keys(mod)) {
      const v = (mod as Record<string, unknown>)[exportName];
      if (isContract(v)) {
        out.push({ contract: v as LoadedContract['contract'], sourceFile: full });
      }
    }
  }
  // Deterministic order: by service name, then by source file.
  out.sort((a, b) =>
    a.contract.service.localeCompare(b.contract.service)
    || a.sourceFile.localeCompare(b.sourceFile));
  return out;
}
```

- [ ] **Step 5: Run — passes**

```bash
pnpm --filter @clamator/codegen test -- load
```

- [ ] **Step 6: Commit**

```bash
git add ts/packages/codegen/src/load.ts ts/packages/codegen/tests/load.test.ts ts/packages/codegen/tests/fixtures/contracts/arith.ts ts/packages/codegen/tests/fixtures/contracts/notifications.ts
git commit -m "feat(ts/codegen): contract loader via tsx ESM"
```

---

## Task 4: IR + lowering

**Files:**
- Create: `ts/packages/codegen/src/ir.ts`
- Create: `ts/packages/codegen/src/lower.ts`
- Create: `ts/packages/codegen/tests/lower.test.ts`

- [ ] **Step 1: Write `src/ir.ts`**

```typescript
export interface IrSchema {
  /** JSON Schema draft 7 (or OpenAPI 3 if configured). */
  jsonSchema: Record<string, unknown>;
  /** Stable hash of the JSON-Schema string. */
  hash: string;
}

export interface IrMethod {
  name: string;             // wire name (camelCase or kebab as defined)
  isNotification: boolean;
  params: IrSchema;
  result: IrSchema | null;  // null iff notification
}

export interface IrContract {
  service: string;          // wire service name (lowercase, kebab allowed)
  sourceFile: string;
  methods: IrMethod[];      // sorted by name for determinism
}
```

- [ ] **Step 2: Write failing test `tests/lower.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContracts } from '../src/load.js';
import { lowerContracts } from '../src/lower.js';

describe('lowerContracts', () => {
  it('produces an IR per contract with sorted methods', async () => {
    const dir = path.resolve(__dirname, 'fixtures/contracts');
    const loaded = await loadContracts(dir);
    const ir = lowerContracts(loaded, { jsonSchemaTarget: 'jsonSchema7' });
    const arith = ir.find(c => c.service === 'arith')!;
    expect(arith.methods.map(m => m.name)).toEqual(['add', 'divide']);
    expect(arith.methods[0].result?.jsonSchema).toMatchObject({ type: 'object' });
    expect(typeof arith.methods[0].params.hash).toBe('string');
    expect(arith.methods[0].params.hash.length).toBeGreaterThan(8);
  });

  it('marks notification methods correctly', async () => {
    const dir = path.resolve(__dirname, 'fixtures/contracts');
    const loaded = await loadContracts(dir);
    const ir = lowerContracts(loaded, { jsonSchemaTarget: 'jsonSchema7' });
    const n = ir.find(c => c.service === 'notifications')!;
    expect(n.methods[0]).toMatchObject({ name: 'ping', isNotification: true, result: null });
  });

  it('hash is stable across runs', async () => {
    const dir = path.resolve(__dirname, 'fixtures/contracts');
    const loaded = await loadContracts(dir);
    const a = lowerContracts(loaded, { jsonSchemaTarget: 'jsonSchema7' });
    const b = lowerContracts(loaded, { jsonSchemaTarget: 'jsonSchema7' });
    expect(a[0].methods[0].params.hash).toBe(b[0].methods[0].params.hash);
  });
});
```

- [ ] **Step 3: Run — fails**

- [ ] **Step 4: Write `src/lower.ts`**

```typescript
import { createHash } from 'node:crypto';
import { zodToJsonSchema, type Options as Z2JOptions } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import type { IrContract, IrMethod, IrSchema } from './ir.js';
import type { LoadedContract } from './load.js';

export interface LowerOptions {
  jsonSchemaTarget: 'jsonSchema7' | 'openApi3';
}

function lowerSchema(z: ZodTypeAny, opts: LowerOptions): IrSchema {
  const z2jOpts: Partial<Z2JOptions> = { target: opts.jsonSchemaTarget, $refStrategy: 'none' };
  const jsonSchema = zodToJsonSchema(z, z2jOpts) as Record<string, unknown>;
  const serialized = JSON.stringify(jsonSchema);
  const hash = createHash('sha256').update(serialized).digest('hex');
  return { jsonSchema, hash };
}

export function lowerContracts(loaded: LoadedContract[], opts: LowerOptions): IrContract[] {
  return loaded.map(({ contract, sourceFile }) => {
    const methods: IrMethod[] = Object.entries(contract.methods)
      .map(([name, def]) => {
        const d = def as { params: ZodTypeAny; result?: ZodTypeAny; notification?: boolean };
        const isNotification = d.notification === true;
        return {
          name,
          isNotification,
          params: lowerSchema(d.params, opts),
          result: isNotification ? null : lowerSchema(d.result!, opts),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { service: contract.service, sourceFile, methods };
  }).sort((a, b) => a.service.localeCompare(b.service));
}
```

- [ ] **Step 5: Run — passes**

- [ ] **Step 6: Commit**

```bash
git add ts/packages/codegen/src/ir.ts ts/packages/codegen/src/lower.ts ts/packages/codegen/tests/lower.test.ts
git commit -m "feat(ts/codegen): IR + Zod→JSON-Schema lowering with stable hashes"
```

---

## Task 5: TS emit

**Files:**
- Create: `ts/packages/codegen/src/emit-ts.ts`
- Create: `ts/packages/codegen/tests/emit-ts.test.ts`
- Create: `ts/packages/codegen/tests/fixtures/expected/ts/arith.ts`

- [ ] **Step 1: Write `src/emit-ts.ts`**

```typescript
import path from 'node:path';
import fs from 'node:fs/promises';
import type { IrContract } from './ir.js';
import { kebabAndCamelToPascal } from './case.js';

const VERSION = '0.1.0';

export interface EmitTsOptions {
  outDir: string;
  contractImportPath: string;  // how the generated file imports the source contract object
}

export async function emitTs(contracts: IrContract[], opts: EmitTsOptions): Promise<string[]> {
  await fs.mkdir(opts.outDir, { recursive: true });
  const written: string[] = [];
  for (const c of contracts) {
    const file = path.join(opts.outDir, `${c.service}.ts`);
    await fs.writeFile(file, renderTsFile(c, opts), 'utf-8');
    written.push(file);
  }
  return written;
}

function renderTsFile(c: IrContract, opts: EmitTsOptions): string {
  const Pascal = kebabAndCamelToPascal(c.service);
  const sourceBase = path.basename(c.sourceFile);
  const exportName = `${c.service.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())}Contract`;

  const typeAliases = c.methods.map(m => {
    const N = upperFirst(m.name);
    const params = `export type ${N}Params = z.infer<typeof ${exportName}.methods.${m.name}.params>;`;
    if (m.isNotification) return params;
    return `${params}\nexport type ${N}Result = z.infer<typeof ${exportName}.methods.${m.name}.result>;`;
  }).join('\n');

  const clientMethods = c.methods.map(m => {
    const N = upperFirst(m.name);
    if (m.isNotification) {
      return `  ${m.name}(params: ${N}Params): Promise<void> {\n    return this.client.notify('${c.service}', '${m.name}', params);\n  }`;
    }
    return `  ${m.name}(params: ${N}Params): Promise<${N}Result> {\n    return this.client.call('${c.service}', '${m.name}', params);\n  }`;
  }).join('\n');

  const serviceMethods = c.methods.map(m => {
    const N = upperFirst(m.name);
    if (m.isNotification) return `  ${m.name}(params: ${N}Params): Promise<void>;`;
    return `  ${m.name}(params: ${N}Params): Promise<${N}Result>;`;
  }).join('\n');

  return `// AUTO-GENERATED by @clamator/codegen v${VERSION} from ${sourceBase}.
// DO NOT EDIT. Re-run codegen to update.
import { ${exportName} } from '${opts.contractImportPath}';
import type { ClamatorClient } from '@clamator/protocol';
import type { z } from 'zod';

${typeAliases}

export class ${Pascal}Client {
  constructor(private client: ClamatorClient) {}
${clientMethods}
}

export interface ${Pascal}Service {
${serviceMethods}
}
`;
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 2: Write expected golden `tests/fixtures/expected/ts/arith.ts`**

```typescript
// AUTO-GENERATED by @clamator/codegen v0.1.0 from arith.ts.
// DO NOT EDIT. Re-run codegen to update.
import { arithContract } from '@/contracts/arith';
import type { ClamatorClient } from '@clamator/protocol';
import type { z } from 'zod';

export type AddParams = z.infer<typeof arithContract.methods.add.params>;
export type AddResult = z.infer<typeof arithContract.methods.add.result>;
export type DivideParams = z.infer<typeof arithContract.methods.divide.params>;
export type DivideResult = z.infer<typeof arithContract.methods.divide.result>;

export class ArithClient {
  constructor(private client: ClamatorClient) {}
  add(params: AddParams): Promise<AddResult> {
    return this.client.call('arith', 'add', params);
  }
  divide(params: DivideParams): Promise<DivideResult> {
    return this.client.call('arith', 'divide', params);
  }
}

export interface ArithService {
  add(params: AddParams): Promise<AddResult>;
  divide(params: DivideParams): Promise<DivideResult>;
}
```

- [ ] **Step 3: Write test `tests/emit-ts.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadContracts } from '../src/load.js';
import { lowerContracts } from '../src/lower.js';
import { emitTs } from '../src/emit-ts.js';

describe('emitTs', () => {
  it('produces the expected golden output for arith', async () => {
    const srcDir = path.resolve(__dirname, 'fixtures/contracts');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clamator-emit-ts-'));
    const ir = lowerContracts(await loadContracts(srcDir), { jsonSchemaTarget: 'jsonSchema7' });
    await emitTs(ir, { outDir, contractImportPath: '@/contracts/arith' });
    const generated = await fs.readFile(path.join(outDir, 'arith.ts'), 'utf-8');
    const expected = await fs.readFile(path.resolve(__dirname, 'fixtures/expected/ts/arith.ts'), 'utf-8');
    expect(generated).toBe(expected);
  });

  it('emits one file per service', async () => {
    const srcDir = path.resolve(__dirname, 'fixtures/contracts');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clamator-emit-ts-'));
    const ir = lowerContracts(await loadContracts(srcDir), { jsonSchemaTarget: 'jsonSchema7' });
    const written = await emitTs(ir, { outDir, contractImportPath: '@/contracts/whatever' });
    expect(written.map(p => path.basename(p)).sort()).toEqual(['arith.ts', 'notifications.ts']);
  });

  it('is idempotent: second emit produces identical bytes', async () => {
    const srcDir = path.resolve(__dirname, 'fixtures/contracts');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clamator-emit-ts-'));
    const ir = lowerContracts(await loadContracts(srcDir), { jsonSchemaTarget: 'jsonSchema7' });
    await emitTs(ir, { outDir, contractImportPath: '@/contracts/arith' });
    const a = await fs.readFile(path.join(outDir, 'arith.ts'), 'utf-8');
    await emitTs(ir, { outDir, contractImportPath: '@/contracts/arith' });
    const b = await fs.readFile(path.join(outDir, 'arith.ts'), 'utf-8');
    expect(a).toBe(b);
  });
});
```

NOTE: The contractImportPath in the golden uses `'@/contracts/arith'`. In real consumers, this is whatever the user passes via `--ts-contract-import`. The fixture pins one specific value to keep the golden stable. For `notifications.ts` you'll need a separate (or per-service) import-path policy. **Decision:** for v0.1, the CLI uses the same `--ts-contract-import` for all services — the consumer is responsible for re-exporting all contracts from one barrel module. (Document this in the codegen `AGENTS.md`.)

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit**

```bash
git add ts/packages/codegen/src/emit-ts.ts ts/packages/codegen/tests/emit-ts.test.ts ts/packages/codegen/tests/fixtures/expected/ts/arith.ts
git commit -m "feat(ts/codegen): emit TS wrappers (clients + service interfaces)"
```

---

## Task 6: Py emit

**Files:**
- Create: `ts/packages/codegen/src/emit-py.ts`
- Create: `ts/packages/codegen/tests/emit-py.test.ts`
- Create: `ts/packages/codegen/tests/fixtures/expected/py/arith.py`

- [ ] **Step 1: Write `src/emit-py.ts`**

```typescript
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { IrContract } from './ir.js';
import { camelToSnake, kebabAndCamelToPascal } from './case.js';

const VERSION = '0.1.0';

export interface EmitPyOptions {
  outDir: string;
  /** Path to `datamodel-codegen` CLI; defaults to "datamodel-codegen". */
  datamodelCodegenBin?: string;
}

/** datamodel-codegen invocation result captured for tests. */
export interface PyEmitResult {
  filesWritten: string[];
}

export async function emitPy(contracts: IrContract[], opts: EmitPyOptions): Promise<PyEmitResult> {
  await fs.mkdir(opts.outDir, { recursive: true });
  const filesWritten: string[] = [];
  const bin = opts.datamodelCodegenBin ?? 'datamodel-codegen';

  for (const c of contracts) {
    // Combine all params/result schemas into one root JSON Schema with $defs, then run datamodel-codegen.
    const defs: Record<string, unknown> = {};
    const ordered: { defName: string; modelName: string }[] = [];
    for (const m of c.methods) {
      const N = upperFirst(m.name);
      defs[`${N}Params`] = m.params.jsonSchema;
      ordered.push({ defName: `${N}Params`, modelName: `${N}Params` });
      if (m.result) {
        defs[`${N}Result`] = m.result.jsonSchema;
        ordered.push({ defName: `${N}Result`, modelName: `${N}Result` });
      }
    }
    const wrapper = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'GeneratedModels',
      type: 'object',
      $defs: defs,
    };
    // Write a temp wrapper schema file.
    const tmp = await fs.mkdtemp(path.join(opts.outDir, '.tmp-'));
    const schemaPath = path.join(tmp, 'schema.json');
    await fs.writeFile(schemaPath, JSON.stringify(wrapper, null, 2));
    const modelsPath = path.join(tmp, 'models.py');
    await runDatamodelCodegen(bin, schemaPath, modelsPath);
    let modelsBody = await fs.readFile(modelsPath, 'utf-8');
    // Strip datamodel-codegen header to keep our own header authoritative.
    modelsBody = modelsBody.replace(/^#.*\n(?:#.*\n)*/m, '').trim();
    await fs.rm(tmp, { recursive: true });

    const tail = renderPyTail(c);
    const header = `# AUTO-GENERATED by @clamator/codegen v${VERSION} from ${path.basename(c.sourceFile)}.
# DO NOT EDIT. Re-run codegen to update.
from __future__ import annotations
from abc import ABC, abstractmethod
from pydantic import BaseModel, ConfigDict
from clamator_protocol import ClamatorClient, Contract, MethodEntry

`;
    const file = path.join(opts.outDir, `${c.service}.py`);
    await fs.writeFile(file, header + modelsBody + '\n\n' + tail, 'utf-8');
    filesWritten.push(file);
  }
  return { filesWritten };
}

function runDatamodelCodegen(bin: string, schemaPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '--input', schemaPath,
      '--input-file-type', 'jsonschema',
      '--output', outPath,
      '--output-model-type', 'pydantic_v2.BaseModel',
      '--target-python-version', '3.11',
      '--field-constraints',
      '--use-double-quotes',
      '--snake-case-field',
      '--enum-field-as-literal', 'all',
      '--reuse-model',
    ];
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`datamodel-codegen exited ${code}: ${stderr}`));
    });
  });
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderPyTail(c: IrContract): string {
  const Pascal = kebabAndCamelToPascal(c.service);

  const clientLines = c.methods.map(m => {
    const N = upperFirst(m.name);
    const snake = camelToSnake(m.name);
    if (m.isNotification) {
      return `    async def ${snake}(self, params: ${N}Params) -> None:
        await self._client.notify("${c.service}", "${m.name}", params.model_dump(by_alias=True))`;
    }
    return `    async def ${snake}(self, params: ${N}Params) -> ${N}Result:
        raw = await self._client.call("${c.service}", "${m.name}", params.model_dump(by_alias=True))
        return ${N}Result.model_validate(raw)`;
  }).join('\n\n');

  const abcLines = c.methods.map(m => {
    const N = upperFirst(m.name);
    const snake = camelToSnake(m.name);
    if (m.isNotification) {
      return `    @abstractmethod\n    async def ${snake}(self, params: ${N}Params) -> None: ...`;
    }
    return `    @abstractmethod\n    async def ${snake}(self, params: ${N}Params) -> ${N}Result: ...`;
  }).join('\n\n');

  const methodsEntries = c.methods.map(m => {
    const N = upperFirst(m.name);
    const snake = camelToSnake(m.name);
    const result = m.isNotification ? 'None' : `${N}Result`;
    return `    "${m.name}": MethodEntry(params_model=${N}Params, result_model=${result}, handler_attr="${snake}"),`;
  }).join('\n');

  const serviceVar = camelToSnake(c.service.replace(/-/g, '_')) + '_contract';

  return `class ${Pascal}Client:
    def __init__(self, client: ClamatorClient) -> None:
        self._client = client

${clientLines}


class ${Pascal}Service(ABC):
${abcLines}


METHODS = {
${methodsEntries}
}

${serviceVar} = Contract(
    service="${c.service}",
    methods=METHODS,
)
`;
}
```

- [ ] **Step 2: Write expected golden `tests/fixtures/expected/py/arith.py`**

> NOTE: The exact body of the Pydantic models depends on `datamodel-code-generator`'s output. The golden test pins both the header + tail exactly and uses a regex check on the models block. Capture the actual `datamodel-codegen` output during the FIRST test run and copy it into the fixture verbatim.

(For the first run: write a minimal expected file with just the header + tail; treat the Pydantic-models region as a wildcard. After running, copy the actual emitted file as the new expected golden if it looks correct, then re-run to confirm idempotency.)

Skeleton expected:
```python
# AUTO-GENERATED by @clamator/codegen v0.1.0 from arith.ts.
# DO NOT EDIT. Re-run codegen to update.
from __future__ import annotations
from abc import ABC, abstractmethod
from pydantic import BaseModel, ConfigDict
from clamator_protocol import ClamatorClient, Contract, MethodEntry

# <<<DATAMODEL CODEGEN OUTPUT>>>


class ArithClient:
    def __init__(self, client: ClamatorClient) -> None:
        self._client = client

    async def add(self, params: AddParams) -> AddResult:
        raw = await self._client.call("arith", "add", params.model_dump(by_alias=True))
        return AddResult.model_validate(raw)

    async def divide(self, params: DivideParams) -> DivideResult:
        raw = await self._client.call("arith", "divide", params.model_dump(by_alias=True))
        return DivideResult.model_validate(raw)


class ArithService(ABC):
    @abstractmethod
    async def add(self, params: AddParams) -> AddResult: ...

    @abstractmethod
    async def divide(self, params: DivideParams) -> DivideResult: ...


METHODS = {
    "add": MethodEntry(params_model=AddParams, result_model=AddResult, handler_attr="add"),
    "divide": MethodEntry(params_model=DivideParams, result_model=DivideResult, handler_attr="divide"),
}

arith_contract = Contract(
    service="arith",
    methods=METHODS,
)
```

- [ ] **Step 3: Write test `tests/emit-py.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadContracts } from '../src/load.js';
import { lowerContracts } from '../src/lower.js';
import { emitPy } from '../src/emit-py.js';

function hasDatamodelCodegen(): boolean {
  const r = spawnSync('datamodel-codegen', ['--version'], { stdio: 'pipe' });
  return r.status === 0;
}

describe.skipIf(!hasDatamodelCodegen())('emitPy', () => {
  it('emits a Python file per service with header + tail', async () => {
    const srcDir = path.resolve(__dirname, 'fixtures/contracts');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clamator-emit-py-'));
    const ir = lowerContracts(await loadContracts(srcDir), { jsonSchemaTarget: 'jsonSchema7' });
    const { filesWritten } = await emitPy(ir, { outDir });
    expect(filesWritten.map(p => path.basename(p)).sort()).toEqual(['arith.py', 'notifications.py']);
    const arith = await fs.readFile(path.join(outDir, 'arith.py'), 'utf-8');
    expect(arith).toContain('# AUTO-GENERATED by @clamator/codegen');
    expect(arith).toContain('class ArithClient');
    expect(arith).toContain('class ArithService(ABC):');
    expect(arith).toMatch(/arith_contract = Contract\(\s*service="arith"/);
  });

  it('is idempotent', async () => {
    const srcDir = path.resolve(__dirname, 'fixtures/contracts');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clamator-emit-py-'));
    const ir = lowerContracts(await loadContracts(srcDir), { jsonSchemaTarget: 'jsonSchema7' });
    await emitPy(ir, { outDir });
    const a = await fs.readFile(path.join(outDir, 'arith.py'), 'utf-8');
    await emitPy(ir, { outDir });
    const b = await fs.readFile(path.join(outDir, 'arith.py'), 'utf-8');
    expect(a).toBe(b);
  });
});
```

If `datamodel-codegen` is not installed, the test suite skips this block but the CI **must** install it (step in plan 07).

- [ ] **Step 4: Install `datamodel-code-generator` for local development**

```bash
cd py && uv pip install datamodel-code-generator
# or globally: pipx install datamodel-code-generator
```

- [ ] **Step 5: Run — passes**

```bash
pnpm --filter @clamator/codegen test
```

- [ ] **Step 6: Capture golden** (after first successful test run)

If `arith.py` content looks correct (Pydantic models present and valid), copy it into `tests/fixtures/expected/py/arith.py`, replacing the `<<<DATAMODEL CODEGEN OUTPUT>>>` placeholder. Add a stricter assertion in the test:

```typescript
const expected = await fs.readFile(path.resolve(__dirname, 'fixtures/expected/py/arith.py'), 'utf-8');
expect(arith).toBe(expected);
```

Re-run; expect pass.

- [ ] **Step 7: Commit**

```bash
git add ts/packages/codegen/src/emit-py.ts ts/packages/codegen/tests/emit-py.test.ts ts/packages/codegen/tests/fixtures/expected/py/arith.py
git commit -m "feat(ts/codegen): emit Py wrappers via datamodel-code-generator"
```

---

## Task 7: Manifest output

**Files:**
- Create: `ts/packages/codegen/src/manifest.ts`

- [ ] **Step 1: Write `src/manifest.ts`**

```typescript
import fs from 'node:fs/promises';
import type { IrContract } from './ir.js';

export interface Manifest {
  generatedBy: string;
  contracts: Record<string, Record<string, { paramsHash: string; resultHash: string | null }>>;
}

export async function writeManifest(contracts: IrContract[], outPath: string): Promise<void> {
  const manifest: Manifest = {
    generatedBy: '@clamator/codegen v0.1.0',
    contracts: {},
  };
  for (const c of contracts) {
    manifest.contracts[c.service] = {};
    for (const m of c.methods) {
      manifest.contracts[c.service][m.name] = {
        paramsHash: m.params.hash,
        resultHash: m.result?.hash ?? null,
      };
    }
  }
  await fs.writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}
```

- [ ] **Step 2: Add minimal manifest test in `tests/lower.test.ts`** (append):

```typescript
import { writeManifest } from '../src/manifest.js';
import os from 'node:os';

it('writeManifest emits stable JSON', async () => {
  const dir = path.resolve(__dirname, 'fixtures/contracts');
  const ir = lowerContracts(await loadContracts(dir), { jsonSchemaTarget: 'jsonSchema7' });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'clam-manifest-'));
  const file = path.join(tmp, 'manifest.json');
  await writeManifest(ir, file);
  const a = await fs.readFile(file, 'utf-8');
  await writeManifest(ir, file);
  const b = await fs.readFile(file, 'utf-8');
  expect(a).toBe(b);
  expect(a).toMatch(/"generatedBy": "@clamator\/codegen v0\.1\.0"/);
});
```

(Adjust imports for `path`, `fs/promises` already in file.)

- [ ] **Step 3: Run — passes**

- [ ] **Step 4: Commit**

```bash
git add ts/packages/codegen/src/manifest.ts ts/packages/codegen/tests/lower.test.ts
git commit -m "feat(ts/codegen): manifest output for cross-language drift detection"
```

---

## Task 8: Wire CLI to pipeline

**Files:**
- Modify: `ts/packages/codegen/src/cli.ts`
- Modify: `ts/packages/codegen/src/index.ts`
- Create: `ts/packages/codegen/tests/cli.test.ts`

- [ ] **Step 1: Replace `src/cli.ts` with full pipeline**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { loadContracts } from './load.js';
import { lowerContracts } from './lower.js';
import { emitTs } from './emit-ts.js';
import { emitPy } from './emit-py.js';
import { writeManifest } from './manifest.js';

interface CliOptions {
  src: string;
  outTs?: string;
  outPy?: string;
  manifest?: string;
  jsonSchemaTarget?: 'jsonSchema7' | 'openApi3';
  tsContractImport?: string;
  watch?: boolean;
}

export async function runCli(opts: CliOptions): Promise<void> {
  const loaded = await loadContracts(opts.src);
  if (loaded.length === 0) {
    console.warn(`[clamator-codegen] no contracts found in ${opts.src}`);
    return;
  }
  const ir = lowerContracts(loaded, { jsonSchemaTarget: opts.jsonSchemaTarget ?? 'jsonSchema7' });
  if (opts.outTs) {
    if (!opts.tsContractImport)
      throw new Error('--out-ts requires --ts-contract-import');
    await emitTs(ir, { outDir: opts.outTs, contractImportPath: opts.tsContractImport });
  }
  if (opts.outPy) {
    await emitPy(ir, { outDir: opts.outPy });
  }
  if (opts.manifest) {
    await writeManifest(ir, opts.manifest);
  }
}

const program = new Command();
program
  .name('clamator-codegen')
  .description('Generate TS + Py wrappers from Zod contracts')
  .requiredOption('--src <dir>', 'directory containing *.ts files exporting defineContract calls')
  .option('--out-ts <dir>', 'output dir for generated TS wrappers')
  .option('--out-py <dir>', 'output dir for generated Py wrappers')
  .option('--manifest <path>', 'optional cross-side manifest output')
  .option('--json-schema-target <name>', 'jsonSchema7 | openApi3', 'jsonSchema7')
  .option('--ts-contract-import <path>', 'how generated TS imports the source contract')
  .option('--watch', 'rebuild on src changes')
  .action(async (opts: Record<string, string | boolean | undefined>) => {
    await runCli({
      src: opts.src as string,
      outTs: opts['outTs'] as string | undefined,
      outPy: opts['outPy'] as string | undefined,
      manifest: opts.manifest as string | undefined,
      jsonSchemaTarget: opts['jsonSchemaTarget'] as 'jsonSchema7' | 'openApi3' | undefined,
      tsContractImport: opts['tsContractImport'] as string | undefined,
      watch: opts.watch as boolean | undefined,
    });
  });

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  program.parseAsync().catch(err => { console.error(err); process.exit(1); });
}
```

(NOTE: `--watch` flag is parsed but not implemented in v0.1; document this clearly and exit with a warning if passed.)

- [ ] **Step 2: Update `src/index.ts`**

```typescript
export { loadContracts, type LoadedContract } from './load.js';
export { lowerContracts, type LowerOptions } from './lower.js';
export type { IrContract, IrMethod, IrSchema } from './ir.js';
export { emitTs, type EmitTsOptions } from './emit-ts.js';
export { emitPy, type EmitPyOptions } from './emit-py.js';
export { writeManifest, type Manifest } from './manifest.js';
export { runCli } from './cli.js';
```

- [ ] **Step 3: Write `tests/cli.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { runCli } from '../src/cli.js';

function hasDatamodelCodegen(): boolean {
  return spawnSync('datamodel-codegen', ['--version'], { stdio: 'pipe' }).status === 0;
}

describe('runCli', () => {
  it('emits TS only when --out-py omitted', async () => {
    const tsOut = await fs.mkdtemp(path.join(os.tmpdir(), 'clamator-cli-ts-'));
    await runCli({
      src: path.resolve(__dirname, 'fixtures/contracts'),
      outTs: tsOut,
      tsContractImport: '@/contracts/arith',
    });
    const arith = await fs.readFile(path.join(tsOut, 'arith.ts'), 'utf-8');
    expect(arith).toContain('class ArithClient');
  });

  it('writes a manifest', async () => {
    const tsOut = await fs.mkdtemp(path.join(os.tmpdir(), 'clamator-cli-mf-'));
    const manifestPath = path.join(tsOut, 'manifest.json');
    await runCli({
      src: path.resolve(__dirname, 'fixtures/contracts'),
      outTs: tsOut,
      tsContractImport: '@/contracts/arith',
      manifest: manifestPath,
    });
    const m = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    expect(m.contracts.arith.add.paramsHash).toMatch(/^[a-f0-9]+$/);
  });

  it.skipIf(!hasDatamodelCodegen())('emits Py when --out-py provided', async () => {
    const tsOut = await fs.mkdtemp(path.join(os.tmpdir(), 'clamator-cli-tsfull-'));
    const pyOut = await fs.mkdtemp(path.join(os.tmpdir(), 'clamator-cli-py-'));
    await runCli({
      src: path.resolve(__dirname, 'fixtures/contracts'),
      outTs: tsOut,
      outPy: pyOut,
      tsContractImport: '@/contracts/arith',
    });
    const arith = await fs.readFile(path.join(pyOut, 'arith.py'), 'utf-8');
    expect(arith).toContain('class ArithClient');
  });
});
```

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit**

```bash
git add ts/packages/codegen/src/cli.ts ts/packages/codegen/src/index.ts ts/packages/codegen/tests/cli.test.ts
git commit -m "feat(ts/codegen): wire CLI to load/lower/emit/manifest"
```

---

## Task 9: Codegen AGENTS.md + final build

**Files:**
- Create: `ts/packages/codegen/AGENTS.md`

- [ ] **Step 1: Write `AGENTS.md`**

```markdown
# @clamator/codegen — agent rules

CLI + library that turns Zod contracts into TS + Py wrappers.

## Public CLI surface

`clamator-codegen` flags:
- `--src <dir>` (required) — directory of `*.ts` files exporting `defineContract(...)` calls.
- `--out-ts <dir>` — emit TS wrappers (requires `--ts-contract-import`).
- `--out-py <dir>` — emit Py wrappers (requires `datamodel-code-generator` on PATH).
- `--manifest <path>` — schema-hash manifest for drift detection.
- `--json-schema-target jsonSchema7|openApi3` — default `jsonSchema7`.
- `--ts-contract-import <module-path>` — import path the generated TS uses to re-import the source contract.
- `--watch` — accepted but **not implemented** in v0.1; warns and exits.

## Emitted file conventions

- Header (TS): `// AUTO-GENERATED by @clamator/codegen vX.Y.Z from <source>.\n// DO NOT EDIT. Re-run codegen to update.`
- Header (Py): `# AUTO-GENERATED ...` (same wording).
- One file per service: `<service>.ts` and `<service>.py`.
- Pascal-case class name from kebab-case (`excavator-engine` → `ExcavatorEngine`).
- Py field names: snake_case via `--snake-case-field`; aliases preserve wire camelCase.
- `model_dump(by_alias=True)` on every outbound payload.
- TS `--ts-contract-import` is single-valued for v0.1; consumers re-export all contracts from one barrel.

## Determinism

- Methods sorted alphabetically before emit.
- Contracts sorted alphabetically by service name.
- `JSON.stringify(jsonSchema)` is fed to sha256 for hashes; ordering is whatever `zodToJsonSchema` yields. If two contracts produce the same schema, the same hash results.
- Re-running with no source change MUST produce empty `git diff` in `--out-*`. CI enforces.

## What lives elsewhere

- Reverse-direction codegen (Pydantic → Zod): out of scope.
- Non-Pydantic Py output: out of scope.
- Doc generation from contracts: out of scope.
- Watch mode: stub only.
```

- [ ] **Step 2: Final build + test**

```bash
pnpm --filter @clamator/codegen build
pnpm --filter @clamator/codegen test
```

- [ ] **Step 3: Smoke run the built CLI against fixtures**

```bash
node ts/packages/codegen/dist/cli.js \
  --src ts/packages/codegen/tests/fixtures/contracts \
  --out-ts /tmp/clam-smoke-ts \
  --out-py /tmp/clam-smoke-py \
  --manifest /tmp/clam-smoke-manifest.json \
  --ts-contract-import "@/contracts/arith"
ls /tmp/clam-smoke-ts /tmp/clam-smoke-py /tmp/clam-smoke-manifest.json
cat /tmp/clam-smoke-manifest.json | head -20
```

Expected: each output present, manifest non-empty.

- [ ] **Step 4: Commit**

```bash
git add ts/packages/codegen/AGENTS.md
git commit -m "docs(ts/codegen): AGENTS.md"
```
