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
