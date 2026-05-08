#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  if (opts.watch) {
    console.warn('--watch is not implemented in v0.1; performing a single run and exiting');
    return;
  }
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
    const cliOpts: CliOptions = { src: opts.src as string };
    if (opts['outTs']) cliOpts.outTs = opts['outTs'] as string;
    if (opts['outPy']) cliOpts.outPy = opts['outPy'] as string;
    if (opts.manifest) cliOpts.manifest = opts.manifest as string;
    if (opts['jsonSchemaTarget']) cliOpts.jsonSchemaTarget = opts['jsonSchemaTarget'] as 'jsonSchema7' | 'openApi3';
    if (opts['tsContractImport']) cliOpts.tsContractImport = opts['tsContractImport'] as string;
    if (opts.watch) cliOpts.watch = opts.watch as boolean;
    await runCli(cliOpts);
  });

// Compare real (symlink-resolved) paths so the guard works under pnpm's
// hard-link virtual store, npm's regular symlinks, and direct `node dist/cli.js`
// invocation. The naive `import.meta.url === \`file://${process.argv[1]}\``
// guard fails on pnpm because the two paths are different strings even though
// they resolve to the same inode.
function isInvokedAsCli(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isInvokedAsCli()) {
  program.parseAsync().catch(err => { console.error(err); process.exit(1); });
}
