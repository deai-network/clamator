#!/usr/bin/env node
import { Command } from 'commander';

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
  .action(async (_opts) => {
    throw new Error('not implemented yet');
  });

program.parseAsync().catch(err => {
  console.error(err);
  process.exit(1);
});
