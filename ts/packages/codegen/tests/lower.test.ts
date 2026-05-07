import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadContracts } from '../src/load.js';
import { lowerContracts } from '../src/lower.js';
import { writeManifest } from '../src/manifest.js';

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
