# @clamator/codegen

CLI plus library that turns a Zod contract module into TypeScript and Python client/server wrappers for clamator.

## Install

```bash
npm install -D @clamator/codegen
```

## CLI usage

```bash
npx @clamator/codegen \
  --src <contracts-dir> \
  --out-ts <ts-output-dir> \
  --out-py <py-output-dir> \
  --manifest <manifest.json> \
  --ts-contract-import <import-path>
```

The interop test runner invokes the CLI like this:

```typescript
  const args = [
    codegenCli,
    '--src', contractsSrc,
    '--out-ts', outTs,
    '--out-py', outPy,
    '--manifest', manifestPath,
    '--ts-contract-import', '../../contracts/index.js',
  ];
```

(Verbatim from `tests/interop/lib/runner.ts:291-298`. `codegenCli` is the path to `dist/cli.js` of this package.)

Pass `--out-py` only when you want Python output. The Python emitter requires the [`datamodel-code-generator`](https://pypi.org/project/datamodel-code-generator/) Python tool on `PATH`.

## Contract input shape

A contract module exports one or more contracts via `defineContract` from `@clamator/protocol`:

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

(Verbatim from `ts/packages/codegen/tests/fixtures/contracts/arith.ts`.)

The codegen scans every `.ts` file in `--src` for `defineContract` calls and emits one wrapper file per contract.

## Output layout

Given a `--src` directory containing contract modules and an `--out-ts <dir>` and `--out-py <dir>`:

- `<out-ts>/<service>.ts` — typed client and server wrappers for each contract; importable from a TS package.
- `<out-py>/<service>.py` — typed client and server wrappers for each contract; importable from a Python package.
- `<manifest>.json` — content-addressed schema hashes per method/notification, used by interop tests to detect drift.

The `--ts-contract-import` flag controls the import path written into the emitted TS wrappers — supply the path that resolves to your contract module from the directory the wrappers will be imported from.

## Links

- Protocol packages: [`@clamator/protocol`](https://www.npmjs.com/package/@clamator/protocol), [`clamator-protocol`](https://pypi.org/project/clamator-protocol/)
- Transports:
  - [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory)
  - [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis)
  - [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/)
  - [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
