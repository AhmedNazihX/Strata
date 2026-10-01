/**
 * Document validation: shape first, then the things a shape check cannot see —
 * dangling references, duplicate ids, dialect rules, and whether a claimed
 * source file actually exists at the line it names.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Issue, validate as validateShape } from './kit.mjs';
import { LAYERS_REQUIRED, LAYER_NOUN, SPECS, DIAGRAM_TYPES } from './docs.mjs';
import { evidenceQuality } from '../check/evidence.mjs';

export function validateDocument(doc, options = {}) {
  const issues = [];
  const warnings = [];

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, issues: [new Issue('', 'the document must be a JSON object')], warnings };
  }

  const type = doc.diagram_type;
  if (!DIAGRAM_TYPES.includes(type)) {
    return {
      ok: false,
      warnings,
      issues: [new Issue('diagram_type', `must be one of ${DIAGRAM_TYPES.join(', ')}`, `got ${JSON.stringify(type)}`)],
    };
  }

  issues.push(...validateShape(doc, SPECS[type]));
  if (issues.length) return { ok: false, issues, warnings };

  issues.push(...checkIds(doc));
  issues.push(...checkReferences(doc, type));
  issues.push(...checkDialect(doc, type));
  warnings.push(...checkAdvisory(doc, type));

  if (options.repoRoot) {
    const evidence = checkSources(doc, options.repoRoot);
    issues.push(...evidence.issues);
    warnings.push(...evidence.warnings);
  } else if (hasSources(doc)) {
    warnings.push(new Issue('nodes[].sources', 'source references were not checked', 'pass --repo-root to verify them'));
  }

  return { ok: issues.length === 0, issues, warnings };
}

function collectionIds(list = []) {
  return new Set(list.map((item) => item.id).filter(Boolean));
}

function checkIds(doc) {
  const issues = [];
  for (const field of ['layers', 'nodes', 'links']) {
    const seen = new Map();
    (doc[field] || []).forEach((item, i) => {
      if (!item.id) return;
      if (seen.has(item.id)) {
        issues.push(new Issue(`${field}[${i}].id`, `duplicates ${field}[${seen.get(item.id)}].id`, `"${item.id}" must be unique`));
      } else {
        seen.set(item.id, i);
      }
    });
  }
  return issues;
}

function checkReferences(doc, type) {
  const issues = [];
  const layerIds = collectionIds(doc.layers);
  const nodeIds = collectionIds(doc.nodes);
  const linkIds = collectionIds(doc.links);
  const noun = LAYER_NOUN[type];

  (doc.nodes || []).forEach((node, i) => {
    if (node.layer && !layerIds.has(node.layer)) {
      issues.push(new Issue(`nodes[${i}].layer`, `names no declared ${noun}`, listOf(layerIds)));
    }
  });

  (doc.links || []).forEach((link, i) => {
    for (const end of ['from', 'to']) {
      if (link[end] && !nodeIds.has(link[end])) {
        issues.push(new Issue(`links[${i}].${end}`, 'names no declared node', listOf(nodeIds)));
      }
    }
    if (link.from && link.from === link.to && type !== 'sequence' && type !== 'lifecycle') {
      issues.push(new Issue(`links[${i}]`, 'starts and ends on the same node', 'self-links are only meaningful in sequence and lifecycle diagrams'));
    }
  });

  (doc.steps || []).forEach((step, s) => {
    (step.nodes || []).forEach((id, i) => {
      if (id !== '*' && !nodeIds.has(id)) {
        issues.push(new Issue(`steps[${s}].nodes[${i}]`, 'names no declared node', listOf(nodeIds)));
      }
    });
    (step.links || []).forEach((id, i) => {
      if (!linkIds.has(id)) {
        issues.push(new Issue(`steps[${s}].links[${i}]`, 'names no declared link', 'a link needs an explicit id before a step can reference it'));
      }
    });
  });

  return issues;
}

function checkDialect(doc, type) {
  const issues = [];
  const noun = LAYER_NOUN[type];
  const layers = doc.layers || [];

  if (LAYERS_REQUIRED[type] && layers.length === 0) {
    issues.push(new Issue('layers', `a ${type} diagram needs at least one ${noun}`, `its whole reading is which ${noun} a node sits in`));
  }

  if (LAYERS_REQUIRED[type]) {
    (doc.nodes || []).forEach((node, i) => {
      if (!node.layer) {
        issues.push(new Issue(`nodes[${i}].layer`, `is required in a ${type} diagram`, `every node belongs to exactly one ${noun}`));
      }
    });
  }

  if (type === 'sequence') {
    const participants = new Set((doc.nodes || []).map((n) => n.layer));
    if (participants.size !== layers.length && layers.length) {
      const unused = layers.filter((l) => !participants.has(l.id)).map((l) => l.id);
      if (unused.length) {
        issues.push(new Issue('layers', `${unused.join(', ')} ${unused.length === 1 ? 'has' : 'have'} no node`, 'an empty participant draws a lifeline nothing touches'));
      }
    }
  }

  if (type === 'lifecycle') {
    const kinds = (doc.nodes || []).map((n) => n.kind);
    if (!kinds.includes('initial')) {
      issues.push(new Issue('nodes', 'no state is marked "initial"', 'a lifecycle needs an entry point'));
    }
    if (!kinds.includes('terminal') && !kinds.includes('error')) {
      issues.push(new Issue('nodes', 'no state is marked "terminal" or "error"', 'a lifecycle with no exit is a loop, not a lifecycle'));
    }
  }

  if (type === 'workflow') {
    (doc.nodes || []).filter((n) => n.kind === 'gate').forEach((gate) => {
      const out = (doc.links || []).filter((l) => l.from === gate.id);
      if (out.length < 2) {
        issues.push(new Issue(`nodes[id=${gate.id}]`, 'is a gate with fewer than two outgoing links', 'a gate that cannot branch is an action'));
      }
    });
  }

  return issues;
}

function checkAdvisory(doc, type) {
  const warnings = [];
  const nodeIds = collectionIds(doc.nodes);
  const touched = new Set();
  for (const link of doc.links || []) { touched.add(link.from); touched.add(link.to); }

  if ((doc.links || []).length) {
    const orphans = [...nodeIds].filter((id) => !touched.has(id));
    if (orphans.length) {
      warnings.push(new Issue('nodes', `${orphans.join(', ')} ${orphans.length === 1 ? 'is' : 'are'} connected to nothing`, 'an unconnected node usually means a missing link'));
    }
  }

  const steps = doc.steps || [];
  if (steps.length === 1) {
    warnings.push(new Issue('steps', 'one step is not a walkthrough', 'drop steps entirely, or write the whole sequence'));
  }
  if (steps.length > 1) {
    const linked = new Set(steps.flatMap((s) => s.links || []));
    const idless = (doc.links || []).filter((l) => !l.id).length;
    if (idless && linked.size === 0) {
      warnings.push(new Issue('links[].id', `${idless} links have no id`, 'a step can only light a link that has one'));
    }
  }
  if (type === 'architecture' && (doc.layers || []).length > 6) {
    warnings.push(new Issue('layers', `${doc.layers.length} rails is a lot`, 'five or fewer reads at presentation distance'));
  }
  return warnings;
}

function hasSources(doc) {
  return (doc.nodes || []).some((n) => (n.sources || []).length);
}

/* A citation whose range holds no code at all cannot support a claim about
   behaviour — it only shows that somebody wrote a docstring. The commonest
   shape of this is `file.py:1-30`, which lands on the module docstring every
   time. */
const PROSE_WARNING_RATIO = 0.4;

function checkSources(doc, repoRoot) {
  const issues = [];
  const warnings = [];
  const root = resolve(repoRoot);
  if (!existsSync(root)) {
    return { issues: [new Issue('--repo-root', `${root} does not exist`)], warnings };
  }

  (doc.nodes || []).forEach((node, i) => {
    (node.sources || []).forEach((raw, j) => {
      const path = `nodes[${i}].sources[${j}]`;
      const match = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(raw);
      const file = resolve(root, match[1]);
      if (!file.startsWith(root)) {
        issues.push(new Issue(path, 'points outside the repository root', raw));
        return;
      }
      if (!existsSync(file) || !statSync(file).isFile()) {
        issues.push(new Issue(path, 'names a file that does not exist', `${match[1]} relative to ${root}`));
        return;
      }
      if (!match[2]) return;

      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n').length;
      const start = Number(match[2]);
      const end = match[3] ? Number(match[3]) : start;
      if (start < 1 || end > lines || start > end) {
        issues.push(new Issue(path, `names lines ${start}-${end} of a ${lines}-line file`));
        return;
      }

      const quality = evidenceQuality(text, match[1], start, end);
      if (quality.total === 0) {
        warnings.push(new Issue(path, `${raw} cites only blank lines`));
      } else if (quality.code === 0) {
        issues.push(new Issue(
          path,
          `${raw} is ${quality.comment} lines of comment and no code`,
          'cite the implementation the claim rests on, not the docstring about it',
        ));
      } else if (quality.ratio < PROSE_WARNING_RATIO) {
        warnings.push(new Issue(
          path,
          `${raw} is ${Math.round(quality.ratio * 100)}% code`,
          'mostly prose — a tighter range over the implementation reads better',
        ));
      }
    });
  });

  return { issues, warnings };
}

function listOf(ids) {
  const list = [...ids];
  if (!list.length) return 'nothing is declared';
  const shown = list.slice(0, 8).join(', ');
  return `declared: ${shown}${list.length > 8 ? `, +${list.length - 8} more` : ''}`;
}
