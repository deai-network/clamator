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
    const entry: Record<string, { paramsHash: string; resultHash: string | null }> = {};
    manifest.contracts[c.service] = entry;
    for (const m of c.methods) {
      entry[m.name] = {
        paramsHash: m.params.hash,
        resultHash: m.result?.hash ?? null,
      };
    }
  }
  await fs.writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}
