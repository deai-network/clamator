import { createHash } from 'node:crypto';
import { zodToJsonSchema, type Options as Z2JOptions, type Targets as Z2JTargets } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import type { IrContract, IrMethod, IrSchema } from './ir.js';
import type { LoadedContract } from './load.js';

export interface LowerOptions {
  jsonSchemaTarget: 'jsonSchema7' | 'openApi3';
}

function lowerSchema(z: ZodTypeAny, opts: LowerOptions): IrSchema {
  const z2jOpts: Partial<Z2JOptions<Z2JTargets>> = { target: opts.jsonSchemaTarget, $refStrategy: 'none' };
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
