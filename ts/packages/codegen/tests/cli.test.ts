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
