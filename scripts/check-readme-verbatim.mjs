#!/usr/bin/env node
// Verbatim-diff check for clamator package READMEs.
// For every fenced code block whose language is `ts`, `typescript`, `python`, or `py`
// in any file under {ts,py}/packages/*/README.md, expects a citation footer in the
// canonical grammar:
//   (Verbatim from `<repo-relative-path>:<start-line>-<end-line>`.)
// or whole-file:
//   (Verbatim from `<repo-relative-path>`.)
// The script reads the cited source range, strips comments, normalizes whitespace,
// and compares against the same-treatment block. Non-zero exit on any mismatch.

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const READ_LANGS = new Set(['ts', 'typescript', 'python', 'py']);

const README_GLOBS = [
  'ts/packages/protocol/README.md',
  'ts/packages/over-memory/README.md',
  'ts/packages/over-redis/README.md',
  'ts/packages/codegen/README.md',
  'py/packages/protocol/README.md',
  'py/packages/over-memory/README.md',
  'py/packages/over-redis/README.md',
];

const CITATION_RE = /^\(Verbatim from `([^`]+?)(?::(\d+)-(\d+))?`\./;

function stripComments(text, lang) {
  const lines = text.split('\n');
  const out = [];
  if (lang === 'python' || lang === 'py') {
    for (const line of lines) {
      // strip # to end of line, but only when not inside a string literal.
      // Heuristic: if a # appears after an even number of unescaped " or ' on the line,
      // it is a real comment. Conservative: strip # only at start of line or after whitespace
      // and not inside an obvious string.
      const stripped = line.replace(/(^|\s)#.*$/, (m, p1) => p1);
      out.push(stripped);
    }
  } else if (lang === 'ts' || lang === 'typescript') {
    let inBlock = false;
    for (let line of lines) {
      if (inBlock) {
        const end = line.indexOf('*/');
        if (end >= 0) {
          line = line.slice(end + 2);
          inBlock = false;
        } else {
          out.push('');
          continue;
        }
      }
      // strip /* ... */ that opens and possibly closes
      while (true) {
        const start = line.indexOf('/*');
        if (start < 0) break;
        const end = line.indexOf('*/', start + 2);
        if (end < 0) {
          line = line.slice(0, start);
          inBlock = true;
          break;
        }
        line = line.slice(0, start) + line.slice(end + 2);
      }
      // strip // to end of line
      const slash = line.indexOf('//');
      if (slash >= 0) {
        // do not strip inside string literals (heuristic: count unescaped quotes before //)
        const before = line.slice(0, slash);
        const dq = (before.match(/(?<!\\)"/g) || []).length;
        const sq = (before.match(/(?<!\\)'/g) || []).length;
        if (dq % 2 === 0 && sq % 2 === 0) {
          line = before;
        }
      }
      out.push(line);
    }
  } else {
    return text;
  }
  return out.join('\n');
}

function normalizeWhitespace(text) {
  // trim trailing whitespace per line
  let lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  // collapse runs of blank lines
  const collapsed = [];
  let lastBlank = false;
  for (const line of lines) {
    const blank = line.length === 0;
    if (blank && lastBlank) continue;
    collapsed.push(line);
    lastBlank = blank;
  }
  // strip a single leading and trailing blank line
  while (collapsed.length && collapsed[0] === '') collapsed.shift();
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop();
  return collapsed.join('\n');
}

function extractBlocks(markdown) {
  // Returns [{lang, code, citation, blockStartLine, citationLine}].
  const lines = markdown.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^```(\w+)\s*$/);
    if (!m) {
      i++;
      continue;
    }
    const lang = m[1].toLowerCase();
    const codeStart = i + 1;
    let j = codeStart;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
    if (j >= lines.length) {
      throw new Error(`Unclosed fence starting at line ${i + 1}`);
    }
    const code = lines.slice(codeStart, j).join('\n');
    // citation: scan forward up to 5 lines for the citation pattern; first match wins.
    let citation = null;
    let citationLineNo = null;
    for (let k = j + 1; k < Math.min(j + 6, lines.length); k++) {
      const t = lines[k].trim();
      if (t === '') continue;
      const cm = t.match(CITATION_RE);
      if (cm) {
        citation = { path: cm[1], start: cm[2] ? parseInt(cm[2], 10) : null, end: cm[3] ? parseInt(cm[3], 10) : null };
        citationLineNo = k + 1;
      }
      break;
    }
    out.push({ lang, code, citation, blockStartLine: codeStart + 1, citationLineNo });
    i = j + 1;
  }
  return out;
}

async function readSourceRange(repoPath, start, end) {
  const content = await readFile(join(REPO_ROOT, repoPath), 'utf8');
  if (start === null) return content;
  const lines = content.split('\n');
  if (start < 1 || end > lines.length || start > end) {
    throw new Error(`Bad line range ${start}-${end} for ${repoPath} (file has ${lines.length} lines)`);
  }
  return lines.slice(start - 1, end).join('\n');
}

function unifiedDiff(a, b, aLabel, bLabel) {
  const al = a.split('\n');
  const bl = b.split('\n');
  const out = [`--- ${aLabel}`, `+++ ${bLabel}`];
  // simple line-by-line diff (this is a brute-force comparator; not LCS-optimal,
  // but adequate for short README blocks).
  const max = Math.max(al.length, bl.length);
  for (let i = 0; i < max; i++) {
    const la = al[i];
    const lb = bl[i];
    if (la === lb) {
      out.push(`  ${la ?? ''}`);
    } else {
      if (la !== undefined) out.push(`- ${la}`);
      if (lb !== undefined) out.push(`+ ${lb}`);
    }
  }
  return out.join('\n');
}

let failed = false;

for (const readme of README_GLOBS) {
  const markdown = await readFile(join(REPO_ROOT, readme), 'utf8');
  let blocks;
  try {
    blocks = extractBlocks(markdown);
  } catch (e) {
    console.error(`PARSE-FAIL ${readme}: ${e.message}`);
    failed = true;
    continue;
  }
  for (const block of blocks) {
    if (!READ_LANGS.has(block.lang)) continue;
    if (!block.citation) {
      console.error(`MISSING-CITATION ${readme}:${block.blockStartLine} (${block.lang})`);
      failed = true;
      continue;
    }
    let source;
    try {
      source = await readSourceRange(block.citation.path, block.citation.start, block.citation.end);
    } catch (e) {
      console.error(`SOURCE-MISSING ${readme}:${block.blockStartLine} → ${block.citation.path}: ${e.message}`);
      failed = true;
      continue;
    }
    const a = normalizeWhitespace(stripComments(block.code, block.lang));
    const b = normalizeWhitespace(stripComments(source, block.lang));
    if (a !== b) {
      console.error(`FAIL ${readme}`);
      console.error(`  Block at line ${block.blockStartLine} (${block.lang})`);
      const cite = block.citation.start ? `${block.citation.path}:${block.citation.start}-${block.citation.end}` : block.citation.path;
      console.error(`  Citation: ${cite}`);
      console.error(`  Mismatch:`);
      console.error(unifiedDiff(a, b, 'README block (comments stripped)', 'source range (comments stripped)').split('\n').map((l) => '    ' + l).join('\n'));
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log('OK — all README code blocks verbatim against cited sources.');
}
