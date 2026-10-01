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

/**
 * Classify every line of a file as 'code', 'comment' or 'blank'.
 * Deliberately approximate: it only has to be right often enough to flag a
 * citation that is entirely prose.
 */
export function classifyLines(text, path) {
  const syntax = SYNTAX[extname(path).toLowerCase()];
  const lines = text.split(/\r?\n/);
  if (!syntax) return lines.map((line) => (line.trim() ? 'code' : 'blank'));

  const out = [];
  let openTriple = null;
  let inBlock = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (openTriple) {
      out.push('comment');
      if (line.includes(openTriple)) openTriple = null;
      continue;
    }
    if (inBlock) {
      out.push('comment');
      if (syntax.block && line.includes(syntax.block[1])) inBlock = false;
      continue;
    }
    if (!line) { out.push('blank'); continue; }

    const triple = (syntax.triple || []).find((mark) => line.startsWith(mark) || line.startsWith(`r${mark}`) || line.startsWith(`f${mark}`));
    if (triple) {
      out.push('comment');
      const body = line.slice(line.indexOf(triple) + triple.length);
      if (!body.includes(triple)) openTriple = triple;
      continue;
    }
    if (syntax.line.some((mark) => line.startsWith(mark))) { out.push('comment'); continue; }
    if (syntax.block && line.startsWith(syntax.block[0])) {
      out.push('comment');
      if (!line.includes(syntax.block[1])) inBlock = true;
      continue;
    }
    // A string that opens mid-line (`PROMPT = """\`) leaves an odd count of the
    // mark behind. Without tracking it, the string's closing line would be read
    // as a docstring *opening* and flip every later line to comment.
    const opened = (syntax.triple || []).find((mark) => line.split(mark).length % 2 === 0);
    if (opened) openTriple = opened;
    out.push('code');
  }
  return out;
}

/**
 * @returns {{total:number, code:number, comment:number, ratio:number}} over the
 * non-blank lines of the cited range. `ratio` is the share that is code.
 */
export function evidenceQuality(text, path, start, end) {
  const kinds = classifyLines(text, path).slice(start - 1, end);
  const comment = kinds.filter((k) => k === 'comment').length;
  const code = kinds.filter((k) => k === 'code').length;
  const total = comment + code;
  return { total, code, comment, ratio: total ? code / total : 1 };
}
