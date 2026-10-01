/**
 * The commands.
 *
 * Every gate either passes, fails with something actionable, or is reported as
 * skipped. Nothing is ever reported as passed because it did not run.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { validateDocument } from '../schema/validate.mjs';
import { buildScene } from '../render/index.mjs';
import { renderHtml } from '../render/shell.mjs';
import { checkGeometry } from '../check/geometry.mjs';
import { checkInBrowser, resolvePlaywright } from '../check/browser.mjs';
import { toJsonSchema } from '../schema/kit.mjs';
import { DIAGRAM_TYPES, SPECS } from '../schema/docs.mjs';
import { createReceipt, finish, printReceipt, recordGate } from './report.mjs';
import { EXAMPLES } from '../../examples/index.mjs';

function readDocument(path) {
  const full = resolve(path);
  let raw;
  try {
    raw = readFileSync(full, 'utf8');
  } catch {
    throw new Error(`cannot read ${full}`);
  }
  try {
    return { doc: JSON.parse(raw), path: full };
  } catch (error) {
    throw new Error(`${full} is not valid JSON: ${error.message}`);
  }
}

function outputPath(doc, candidatePath, explicit) {
  const named = explicit || doc.meta?.output;
  if (!named) throw new Error('no output path: set meta.output or pass one as the second argument');
  return isAbsolute(named) ? named : resolve(dirname(candidatePath), named);
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

/** Shared front half: schema, then geometry on the computed layout. */
function inspect(doc, flags, receipt) {
  const schema = validateDocument(doc, { repoRoot: flags['repo-root'] });
  receipt.warnings.push(...schema.warnings.map(String));
  if (!schema.ok) {
    recordGate(receipt, 'schema', 'failed', { issues: schema.issues.map(String) });
    return null;
  }
  recordGate(receipt, 'schema', 'passed', {
    note: flags['repo-root'] ? 'shape, references and source evidence' : 'shape and references',
  });

  const scene = buildScene(doc);
  const geometry = checkGeometry(scene);
  receipt.warnings.push(...geometry.warnings.map(String));
  if (!geometry.ok) {
    recordGate(receipt, 'geometry', 'failed', { issues: geometry.issues.map(String) });
    return null;
  }
  recordGate(receipt, 'geometry', 'passed', {
    note: `${scene.nodes.length} nodes, ${scene.links.length} links, no overlap or clipping`,
  });
  return scene;
}

export async function validate(positional, flags) {
  const { doc } = readDocument(positional[0]);
  const receipt = createReceipt(positional[0]);
  inspect(doc, flags, receipt);
  finish(receipt);
  printReceipt(receipt, flags);
  return receipt.ok ? 0 : 1;
}

export async function render(positional, flags) {
  const { doc, path } = readDocument(positional[0]);
  const receipt = createReceipt(positional[0]);
  const scene = inspect(doc, flags, receipt);
  if (!scene) { finish(receipt); printReceipt(receipt, flags); return 1; }

  const target = outputPath(doc, path, positional[1]);
  write(target, renderHtml(scene, { repoRoot: flags['repo-root'] }));
  recordGate(receipt, 'render', 'passed', { note: renderNote(flags) });
  receipt.output = target;
  finish(receipt);
  printReceipt(receipt, flags);
  return 0;
}

export async function check(positional, flags) {
  const target = resolve(positional[0]);
  const receipt = createReceipt(positional[0]);
  const result = await checkInBrowser(target, browserOptions(flags));
  recordBrowser(receipt, result, flags);
  finish(receipt);
  printReceipt(receipt, flags);
  return receipt.ok ? 0 : 1;
}

export async function finalize(positional, flags) {
  const { doc, path } = readDocument(positional[0]);
  const receipt = createReceipt(positional[0]);

  const scene = inspect(doc, flags, receipt);
  if (!scene) { finish(receipt); printReceipt(receipt, flags); return 1; }

  const target = outputPath(doc, path, positional[1]);
  write(target, renderHtml(scene, { repoRoot: flags['repo-root'] }));
  recordGate(receipt, 'render', 'passed', { note: renderNote(flags) });
  receipt.output = target;

  if (flags['no-browser']) {
    recordGate(receipt, 'browser', 'skipped', {
      note: 'not run because --no-browser was passed; clipped text and script errors are unverified',
    });
  } else {
    recordBrowser(receipt, await checkInBrowser(target, browserOptions(flags)), flags);
  }

  finish(receipt);
  printReceipt(receipt, flags);
  return receipt.ok ? 0 : 1;
}

function browserOptions(flags) {
  return {
    timeout: flags['browser-timeout'],
    browsers: typeof flags.browsers === 'string'
      ? flags.browsers.split(',').map((name) => name.trim()).filter(Boolean)
      : undefined,
  };
}

function renderNote(flags) {
  return flags['repo-root']
    ? 'self-contained HTML written, with the cited code embedded'
    : 'self-contained HTML written';
}

function recordBrowser(receipt, result, flags) {
  const errors = (result.findings || []).filter((f) => f.level === 'error');
  receipt.warnings.push(...(result.findings || [])
    .filter((f) => f.level !== 'error')
    .map((f) => `${f.what}: ${f.detail}`));

  if (result.status === 'unavailable') {
    recordGate(receipt, 'browser', 'failed', {
      note: result.reason,
      issues: [result.remedy],
    });
    return;
  }
  recordGate(receipt, 'browser', result.status === 'passed' ? 'passed' : 'failed', {
    note: result.engine,
    issues: errors.map((f) => `${f.what}: ${f.detail}`),
  });
  void flags;
}

export async function schema(positional) {
  const dir = resolve(positional[0] || 'schemas');
  mkdirSync(dir, { recursive: true });
  for (const type of DIAGRAM_TYPES) {
    const json = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `strata/${type}.schema.json`,
      title: `Strata ${type} diagram`,
      ...toJsonSchema(SPECS[type]),
    };
    write(join(dir, `${type}.schema.json`), `${JSON.stringify(json, null, 2)}\n`);
  }
  process.stdout.write(`wrote ${DIAGRAM_TYPES.length} schemas to ${dir}\n`);
  return 0;
}

export async function demo(positional, flags) {
  const dir = resolve(positional[0] || 'strata-demo');
  let failures = 0;
  for (const [type, doc] of Object.entries(EXAMPLES)) {
    const candidate = join(dir, `${type}.json`);
    write(candidate, `${JSON.stringify(doc, null, 2)}\n`);
    const code = await finalize([candidate], { ...flags, 'no-browser': true });
    if (code !== 0) failures += 1;
  }
  process.stdout.write(`\n${failures ? `${failures} of 5 failed` : 'five examples written and rendered'} in ${dir}\n`);
  return failures ? 1 : 0;
}

export async function doctor() {
  const lines = [`node ${process.version}`];
  const found = await resolvePlaywright();
  const browser = found ? `${found.pkg} (from ${found.from})` : 'not available';
  lines.push(`browser gate: ${browser}`);
  if (!found) {
    lines.push('  install with: npm i -D playwright && npx playwright install chromium');
    lines.push('  or run finalize with --no-browser, which reports the gate as skipped');
  }
  lines.push(`diagram types: ${DIAGRAM_TYPES.join(', ')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}
