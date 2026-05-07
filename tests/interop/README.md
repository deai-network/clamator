# Interop tests

Cross-language end-to-end tests for `over-redis`. Memory transport is in-process and is tested per-language under `ts/packages/over-memory/tests` and `py/packages/over-memory/tests`.

## Run

```bash
make interop
```

Requires: docker compose, pnpm, uv.

## Layout

- `contracts/` — source-of-truth Zod contracts.
- `generated/` — regenerated each run; gitignored.
- `drivers/{ts,py}/` — minimal CLI drivers used as server/client subprocesses.
- `scenarios/*.yaml` — declarative test cases, directional matrix.
- `lib/runner.ts` — scenario expansion + subprocess orchestration.
- `run.sh` — entrypoint.

## Adding a scenario

1. Add a YAML file under `scenarios/`.
2. If the scenario needs a new contract method, add it to `contracts/`. Both languages pick it up automatically through codegen + drivers.
3. Run `make interop`. Iterate until both directions pass.
