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
