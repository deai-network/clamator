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
