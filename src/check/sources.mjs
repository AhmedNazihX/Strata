/**
 * Resolving a `sources` entry to a file, once, for everything that reads one.
 *
 * Validation and snippet embedding used to parse citations separately, each
 * with a `startsWith(root)` containment test. That test accepts a sibling whose
 * name merely extends the root's, and follows a symlink anywhere, and the
 * embedder copies whatever it reaches into a page made to be shared. One
 * resolver means one rule.
 */

import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';

export const SOURCE_PATTERN = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/;

/* Files whose content is a secret by its name alone. A citation of one would
   embed the secret in the HTML; there is never a diagram that needs that. */
const SECRET_NAMES = [
  /^\.env(\..*)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^\.(netrc|npmrc|pypirc|pgpass)$/i,
];

/**
 * @returns {{ok: true, file: string, path: string, start: number|null, end: number|null}
 *   | {ok: false, problem: string, hint?: string}}
 */
export function resolveSource(raw, repoRoot) {
  const match = SOURCE_PATTERN.exec(raw);
  const path = match[1];
  const root = realpathSync(resolve(repoRoot));
  const candidate = resolve(root, path);

  if (!isInside(root, candidate)) return { ok: false, problem: 'points outside the repository root', hint: raw };
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    return { ok: false, problem: 'names a file that does not exist', hint: `${path} relative to ${root}` };
  }
  const file = realpathSync(candidate);
  if (!isInside(root, file)) return { ok: false, problem: 'is a link that leads outside the repository', hint: raw };
  if (SECRET_NAMES.some((pattern) => pattern.test(basename(file)))) {
    return { ok: false, problem: 'names a file that holds secrets by its kind', hint: 'cite the code that reads it, never the file itself' };
  }

  const start = match[2] ? Number(match[2]) : null;
  const end = match[3] ? Number(match[3]) : start;
  return { ok: true, file, path, start, end };
}

function isInside(root, file) {
  const rel = relative(root, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
