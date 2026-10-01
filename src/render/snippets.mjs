/**
 * Code snapshots for cited sources.
 *
 * A citation that is only a path and a line number asks the reader to go and
 * find it, which nobody does. So the cited lines are read at render time and
 * carried inside the HTML: the file travels with its evidence, and the claim can
 * be checked offline by someone who does not have the repository.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const CONTEXT_LINES = 4;
const MAX_LINES = 44;
const MAX_LINE_CHARS = 170;
const HEADLESS_LINES = 18;   // shown when a source names a file but no line
const TOTAL_BUDGET = 420_000; // characters of snippet text in one document

const SOURCE_PATTERN = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/;

/**
 * @returns {{snippets: Record<string, object>, skipped: string[], truncated: boolean}}
 */
export function collectSnippets(doc, repoRoot) {
  const snippets = {};
  const skipped = [];
  if (!repoRoot) return { snippets, skipped, truncated: false };

  const root = resolve(repoRoot);
  const cache = new Map();
  let budget = TOTAL_BUDGET;
  let truncated = false;

  for (const node of doc.nodes || []) {
    for (const raw of node.sources || []) {
      if (snippets[raw]) continue;

      const parsed = parseSource(raw, root);
      if (!parsed) { skipped.push(raw); continue; }

      const all = readLines(parsed.file, cache);
      if (!all) { skipped.push(raw); continue; }

      const snippet = cut(all, parsed, raw);
      const cost = snippet.lines.reduce((sum, line) => sum + line.text.length, 0);
      if (cost > budget) { truncated = true; skipped.push(raw); continue; }

      budget -= cost;
      snippets[raw] = snippet;
    }
  }

  return { snippets, skipped, truncated };
}

function parseSource(raw, root) {
  const match = SOURCE_PATTERN.exec(raw);
  if (!match) return null;
  const file = resolve(root, match[1]);
  if (!file.startsWith(root)) return null;
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return {
    file,
    path: match[1],
    start: match[2] ? Number(match[2]) : null,
    end: match[3] ? Number(match[3]) : (match[2] ? Number(match[2]) : null),
  };
}

function readLines(file, cache) {
  if (cache.has(file)) return cache.get(file);
  let lines = null;
  try {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('\u0000')) lines = text.split(/\r?\n/);
  } catch { lines = null; }
  cache.set(file, lines);
  return lines;
}

function cut(all, parsed, raw) {
  const total = all.length;
  const hasRange = parsed.start !== null;

  const citedFrom = hasRange ? clamp(parsed.start, 1, total) : 1;
  const citedTo = hasRange ? clamp(parsed.end, citedFrom, total) : 0;

  const from = hasRange ? Math.max(1, citedFrom - CONTEXT_LINES) : 1;
  const span = hasRange ? citedTo - citedFrom + 1 + CONTEXT_LINES * 2 : HEADLESS_LINES;
  const to = Math.min(total, from + Math.min(span, MAX_LINES) - 1);

  const lines = [];
  for (let n = from; n <= to; n += 1) {
    lines.push({ n, text: trim(all[n - 1] ?? ''), cited: hasRange && n >= citedFrom && n <= citedTo });
  }

  return {
    raw,
    path: parsed.path,
    language: languageOf(parsed.path),
    totalLines: total,
    citedFrom: hasRange ? citedFrom : null,
    citedTo: hasRange ? citedTo : null,
    clipped: hasRange && citedTo > to,
    lines,
  };
}

function trim(line) {
  const expanded = line.replace(/\t/g, '  ');
  return expanded.length > MAX_LINE_CHARS ? `${expanded.slice(0, MAX_LINE_CHARS - 1)}…` : expanded;
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

const LANGUAGES = {
  '.py': 'Python', '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript',
  '.mjs': 'JavaScript', '.jsx': 'JavaScript', '.go': 'Go', '.rs': 'Rust',
  '.rb': 'Ruby', '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
  '.sql': 'SQL', '.yaml': 'YAML', '.yml': 'YAML', '.json': 'JSON',
  '.toml': 'TOML', '.sh': 'Shell', '.css': 'CSS', '.html': 'HTML', '.md': 'Markdown',
};

function languageOf(path) {
  return LANGUAGES[extname(path).toLowerCase()] || '';
}
