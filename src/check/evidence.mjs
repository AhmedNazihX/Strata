/**
 * Is a citation pointing at the code, or at the prose about the code?
 *
 * A range that is all docstring reads as evidence and is not: it proves the
 * author described the behaviour, not that the behaviour is there. Cheap to
 * detect, and the difference matters precisely because the diagram's whole
 * claim is that it was traced from the source.
 */

import { extname } from 'node:path';

const HASH = { line: ['#'], block: null, triple: ['"""', "'''"] };
const SLASH = { line: ['//'], block: ['/*', '*/'], triple: null };

const SYNTAX = {
  '.py': HASH, '.rb': HASH, '.sh': HASH, '.yaml': HASH, '.yml': HASH, '.toml': HASH,
  '.ts': SLASH, '.tsx': SLASH, '.js': SLASH, '.mjs': SLASH, '.jsx': SLASH,
  '.go': SLASH, '.rs': SLASH, '.java': SLASH, '.kt': SLASH, '.swift': SLASH,
  '.c': SLASH, '.h': SLASH, '.cpp': SLASH, '.cs': SLASH, '.css': { line: [], block: ['/*', '*/'], triple: null },
  '.sql': { line: ['--'], block: ['/*', '*/'], triple: null },
};

/* Documentation, whatever it says, is a description of behaviour. */
const PROSE_EXTENSIONS = new Set(['.md', '.markdown', '.mdx', '.txt', '.rst', '.adoc', '.org']);

export function isProse(path) {
  return PROSE_EXTENSIONS.has(extname(path).toLowerCase());
}

/* An import names a module and proves nothing happens: a docstring followed
   by `import os, sys, json` passed the identifier count on the imported names. */
const IMPORT_LINE = /^(import\s|from\s+\S+\s+import\s|export\s+(\*|\{[^}]*\})\s+from\s|#include\s|using\s+[\w.]+;|use\s+[\w:]+)/;

/**
 * Classify every line of a file as 'code', 'import', 'comment' (a line comment),
 * 'doc' (a docstring or block comment), 'string' (the body of a multi-line string
 * assigned in code, such as a prompt constant) or 'blank'.
 * Deliberately approximate: it only has to be right often enough to flag a
 * citation that is entirely prose.
 */
export function classifyLines(text, path) {
  const syntax = SYNTAX[extname(path).toLowerCase()];
  const lines = text.split(/\r?\n/);
  if (!syntax) return lines.map((line) => (line.trim() ? 'code' : 'blank'));

  const out = [];
  let openTriple = null;
  let tripleKind = 'doc';   // a docstring, or the body of a string assigned mid-line
  let inBlock = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (openTriple) {
      out.push(tripleKind);
      if (line.includes(openTriple)) openTriple = null;
      continue;
    }
    if (inBlock) {
      out.push('doc');
      if (syntax.block && line.includes(syntax.block[1])) inBlock = false;
      continue;
    }
    if (!line) { out.push('blank'); continue; }

    const triple = (syntax.triple || []).find((mark) => line.startsWith(mark) || line.startsWith(`r${mark}`) || line.startsWith(`f${mark}`));
    if (triple) {
      out.push('doc');
      const body = line.slice(line.indexOf(triple) + triple.length);
      if (!body.includes(triple)) { openTriple = triple; tripleKind = 'doc'; }
      continue;
    }
    if (syntax.line.some((mark) => line.startsWith(mark))) { out.push('comment'); continue; }
    if (syntax.block && line.startsWith(syntax.block[0])) {
      out.push('doc');
      if (!line.includes(syntax.block[1])) inBlock = true;
      continue;
    }
    // A string that opens mid-line (`PROMPT = """\`) leaves an odd count of the
    // mark behind. Without tracking it, the string's closing line would be read
    // as a docstring *opening* and flip every later line to comment.
    const opened = (syntax.triple || []).find((mark) => line.split(mark).length % 2 === 0);
    if (opened) { openTriple = opened; tripleKind = 'string'; }
    out.push(IMPORT_LINE.test(line) ? 'import' : 'code');
  }
  return out;
}

/**
 * @returns {{total:number, code:number, comment:number, imports:number, ratio:number,
 *   first:string|null, last:string|null}} over the non-blank lines of the cited
 * range. `ratio` is the share that is code; `first` and `last` are the kinds of
 * the range's first and last non-blank lines.
 */
export function evidenceQuality(text, path, start, end) {
  const kinds = classifyLines(text, path).slice(start - 1, end);
  // A string body is prose for this purpose: it describes, it does not run.
  const comment = kinds.filter((k) => k === 'comment' || k === 'doc' || k === 'string').length;
  const code = kinds.filter((k) => k === 'code').length;
  const imports = kinds.filter((k) => k === 'import').length;
  const total = comment + code + imports;
  const filled = kinds.filter((k) => k !== 'blank');
  return {
    total, code, comment, imports,
    ratio: total ? code / total : 1,
    first: filled[0] || null,
    last: filled[filled.length - 1] || null,
  };
}

/* Words that carry no evidence on their own: a citation made only of these is a
   fragment of control flow, not a demonstration that anything happens. */
const STRUCTURAL = new Set([
  'try', 'except', 'finally', 'else', 'elif', 'if', 'return', 'raise', 'for', 'while',
  'with', 'async', 'await', 'pass', 'break', 'continue', 'const', 'let', 'var',
  'function', 'class', 'def', 'import', 'from', 'in', 'not', 'and', 'or', 'is',
  'none', 'null', 'true', 'false', 'self', 'this', 'new', 'case', 'switch', 'do',
  'then', 'end', 'catch', 'throw', 'yield', 'export', 'default',
]);

/**
 * How many distinct names a cited range mentions.
 *
 * `return 0` and `try:` are code by any classifier and still prove nothing. A
 * citation worth opening names something — a function, a variable, a call.
 */
export function identifierCount(text) {
  const seen = new Set();
  for (const match of String(text).matchAll(/[A-Za-z_][A-Za-z0-9_]+/g)) {
    const word = match[0].toLowerCase();
    if (!STRUCTURAL.has(word)) seen.add(word);
  }
  return seen.size;
}

/** The cited lines only, with comments and blanks dropped. */
export function citedCode(text, path, start, end) {
  const kinds = classifyLines(text, path);
  return text.split(/\r?\n/)
    .slice(start - 1, end)
    .filter((_, i) => kinds[start - 1 + i] === 'code')
    .join('\n');
}
