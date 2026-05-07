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
