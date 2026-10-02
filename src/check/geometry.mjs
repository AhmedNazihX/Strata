/**
 * Geometry checks against the computed layout.
 *
 * These are the failures a schema cannot see: two boxes in the same place, a
 * connector drawn through a component it does not touch, a label clipped to
 * something that no longer says what the author wrote. They run on the scene,
 * so they check what will actually be drawn rather than what was asked for.
 */

import { Issue } from '../schema/kit.mjs';
import { TYPE } from '../render/tokens.mjs';
import { measureText, wrapText } from '../layout/measure.mjs';
import { CAPTION_LAYOUT } from '../render/shell.mjs';
import { LABEL_REACH, pathDistance, rectOfLabel } from '../layout/scene.mjs';
import { textBox } from '../layout/boxes.mjs';

const EPSILON = 0.5;
const LABEL_CLEARANCE = 2;

/* How close a link may run beside a box it does not connect. Deliberately its
   own number rather than the router's `linkGap`: the gate judges what the
   reader sees, and a gate defined by the router's setting loosens silently
   whenever that setting does — which is how 6px lines, drawn as touching,
   passed every run. */
export const MIN_LINK_CLEARANCE = 10;
/* A run shorter than this is a line passing a corner, not a line hugging an edge. */
const MIN_ALONGSIDE_RUN = 16;

export function checkGeometry(scene) {
  const issues = [];
  const warnings = [];

  issues.push(...checkOverlaps(scene));
  issues.push(...checkBounds(scene));
  issues.push(...checkText(scene));
  issues.push(...checkLinks(scene));
  issues.push(...checkClearance(scene));
  issues.push(...checkSharedTracks(scene));
  issues.push(...checkCaption(scene));
  const labels = checkLabels(scene);
  issues.push(...labels.issues);
  warnings.push(...labels.warnings);
  warnings.push(...checkDensity(scene));
  warnings.push(...checkDirection(scene));

  return { ok: issues.length === 0, issues, warnings };
}

function intersects(a, b, slack = EPSILON) {
  return a.x < b.x + b.w - slack && b.x < a.x + a.w - slack
    && a.y < b.y + b.h - slack && b.y < a.y + a.h - slack;
}

function checkOverlaps(scene) {
  const issues = [];
  const nodes = scene.nodes;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (intersects(nodes[i], nodes[j])) {
        issues.push(new Issue(
          `nodes[${nodes[i].id}]`,
          `overlaps nodes[${nodes[j].id}]`,
          'give one of them a different col, or widen the canvas with meta.width',
        ));
      }
    }
  }
  return issues;
}

function checkBounds(scene) {
  const { canvas } = scene.frame;
  const issues = [];
  for (const node of scene.nodes) {
    const outside = node.x < canvas.x - EPSILON
      || node.y < canvas.y - EPSILON
      || node.x + node.w > canvas.x + canvas.w + EPSILON
      || node.y + node.h > canvas.y + canvas.h + EPSILON;
    if (outside) {
      issues.push(new Issue(
        `nodes[${node.id}]`,
        'falls outside the drawing area',
        `box is ${fmt(node)} and the canvas is ${fmt(canvas)}`,
      ));
    }
  }
  // Lines are drawn too. A sequence's messages are links, so a check over
  // nodes alone passed one drawn through its own caption and off the page.
  const inside = (x, y) => x >= canvas.x - EPSILON && x <= canvas.x + canvas.w + EPSILON
    && y >= canvas.y - EPSILON && y <= canvas.y + canvas.h + EPSILON;
  for (const link of scene.links) {
    const stray = link.points.filter(([x, y]) => !inside(x, y));
    if (stray.length) {
      issues.push(new Issue(
        `links[${link.id}]`,
        `runs outside the drawing area at ${stray.length} point${stray.length === 1 ? '' : 's'}`,
        `the canvas is ${fmt(canvas)} — the page grows to fit up to its limit, so drop a rail or a message`,
      ));
    }
    if (link.labelAt) {
      const r = rectOfLabel(link.labelAt);
      if (!inside(r.x, r.y) || !inside(r.x + r.w, r.y + r.h)) {
        issues.push(new Issue(`links[${link.id}].label`, `"${link.label}" falls outside the drawing area`));
      }
    }
  }
  return issues;
}

function checkText(scene) {
  const issues = [];
  for (const node of scene.nodes) {
    if (node.fit.truncated) {
      issues.push(new Issue(
        `nodes[${node.id}]`,
        'the label or sublabel is clipped',
        `"${node.label}"${node.sublabel ? ` / "${node.sublabel}"` : ''} does not fit ${Math.round(node.w)}px — shorten it, raise span, or reduce how many columns share the row`,
      ));
    }
    if (node.fit.overflowsBox) {
      issues.push(new Issue(
        `nodes[${node.id}]`,
        'the text is taller than its box',
        `drop the sublabel to one line, or give the layer more height`,
      ));
    }
  }
  return issues;
}

function checkLinks(scene) {
  const issues = [];
  for (const link of scene.links) {
    if (!link.clean) {
      issues.push(new Issue(
        `links[${link.id}]`,
        `is drawn through a node it does not connect`,
        'move an endpoint, set fromSide/toSide, or supply via points',
      ));
    }
    if (link.points.length < 2) {
      issues.push(new Issue(`links[${link.id}]`, 'has no route'));
    }
    for (let i = 0; i < link.points.length - 1; i += 1) {
      const [ax, ay] = link.points[i];
      const [bx, by] = link.points[i + 1];
      if (Math.abs(ax - bx) > EPSILON && Math.abs(ay - by) > EPSILON) {
        issues.push(new Issue(
          `links[${link.id}]`,
          `has a segment that is neither horizontal nor vertical, (${Math.round(ax)},${Math.round(ay)}) to (${Math.round(bx)},${Math.round(by)})`,
          'a skill bug when no via points were given; with via, make each via point share an axis with its neighbour',
        ));
        break;
      }
    }
  }
  return issues;
}

/**
 * A link that clears a box by a few pixels is drawn as touching it: the eye
 * reads the line as part of that box's outline. Measured on the scene, not
 * taken from the router's own `clean` flag.
 */
function checkClearance(scene) {
  const issues = [];
  for (const link of scene.links) {
    for (const node of scene.nodes) {
      if (node.id === link.from || node.id === link.to) continue;
      const gap = tightestRunBeside(link.points, node);
      if (gap === null) continue;
      issues.push(new Issue(
        `links[${link.id}]`,
        `runs alongside nodes[${node.id}] ${gap.toFixed(1)}px from its edge, which reads as touching`,
        `at least ${MIN_LINK_CLEARANCE}px is needed — reorder the columns so the route is direct, or set fromSide/toSide`,
      ));
    }
  }
  return issues;
}

/* Two parallel runs closer than this, for longer than the run length, are
   drawn as one line. */
const SHARED_TRACK_DISTANCE = 4;
const SHARED_TRACK_RUN = 12;

/**
 * Two links that share no box, drawn on one track, read as one line with two
 * meanings: the reader cannot tell which source reaches which target. Links
 * that share a box may merge, because a fan-out from one node reads as a trunk.
 */
function checkSharedTracks(scene) {
  const issues = [];
  const runs = scene.links.map((link) => ({ link, runs: axisRuns(link.points) }));
  for (let i = 0; i < runs.length; i += 1) {
    for (let j = i + 1; j < runs.length; j += 1) {
      const a = runs[i];
      const b = runs[j];
      if ([a.link.from, a.link.to].some((id) => id === b.link.from || id === b.link.to)) continue;
      const shared = longestShared(a.runs, b.runs);
      if (shared < SHARED_TRACK_RUN) continue;
      issues.push(new Issue(
        `links[${a.link.id}]`,
        `runs on the same track as links[${b.link.id}] for ${Math.round(shared)}px, so the two read as one line`,
        'the gutter between them has no free lane — reorder the columns so they part, or move one end',
      ));
    }
  }
  return issues;
}

function axisRuns(points) {
  const runs = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    if (Math.abs(ax - bx) < EPSILON) runs.push({ vertical: true, at: ax, lo: Math.min(ay, by), hi: Math.max(ay, by) });
    else if (Math.abs(ay - by) < EPSILON) runs.push({ vertical: false, at: ay, lo: Math.min(ax, bx), hi: Math.max(ax, bx) });
  }
  return runs;
}

function longestShared(a, b) {
  let longest = 0;
  for (const p of a) {
    for (const q of b) {
      if (p.vertical !== q.vertical || Math.abs(p.at - q.at) > SHARED_TRACK_DISTANCE) continue;
      longest = Math.max(longest, Math.min(p.hi, q.hi) - Math.max(p.lo, q.lo));
    }
  }
  return longest;
}

/** The smallest gap of any axis-aligned run travelling beside `box`, or null. */
function tightestRunBeside(points, box) {
  let tightest = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const horizontal = Math.abs(ay - by) < EPSILON;
    if (!horizontal && Math.abs(ax - bx) >= EPSILON) continue;
    const span = horizontal ? [ax, bx, box.x, box.x + box.w] : [ay, by, box.y, box.y + box.h];
    const run = Math.min(Math.max(span[0], span[1]), span[3]) - Math.max(Math.min(span[0], span[1]), span[2]);
    if (run < MIN_ALONGSIDE_RUN) continue;
    const at = horizontal ? ay : ax;
    const [near, far] = horizontal ? [box.y, box.y + box.h] : [box.x, box.x + box.w];
    const gap = at < near ? near - at : at > far ? at - far : 0;
    if (gap < MIN_LINK_CLEARANCE && (tightest === null || gap < tightest)) tightest = gap;
  }
  return tightest;
}

/* A label more than this share over a box hides the box's own text. */
const LABEL_COVER_LIMIT = 0.4;

/**
 * A label is a claim about which line it names, so it is judged against
 * every line, every other label and every box — not only the boxes, which
 * is all this checked before labels were found naming the wrong line.
 */
function checkLabels(scene) {
  const issues = [];
  const warnings = [];
  const placed = scene.links.filter((link) => link.labelAt);
  for (const link of scene.links.filter((l) => l.label && !l.labelAt)) {
    issues.push(new Issue(
      `links[${link.id}].label`,
      `"${link.label}" has nowhere it reads as naming this line`,
      'shorten or drop it; on a gate branch, leave it empty and the yes/no pill speaks for it',
    ));
  }
  for (const link of placed) {
    const where = `links[${link.id}].label`;
    const box = rectOfLabel(link.labelAt);
    const own = pathDistance(box, link.points);
    if (own > LABEL_REACH) {
      issues.push(new Issue(where, `"${link.label}" sits ${Math.round(own)}px from its own line`, `at most ${LABEL_REACH}px reads as belonging to it`));
    }
    for (const other of scene.links) {
      if (other === link) continue;
      const d = pathDistance(box, other.points);
      if (d === 0) {
        issues.push(new Issue(where, `"${link.label}" is printed across links[${other.id}]`, 'shorten the label, or reorder the columns so the two lines part'));
      } else if (d < own) {
        issues.push(new Issue(where, `"${link.label}" is nearer links[${other.id}] than its own line`, 'shorten the label, or reorder the columns'));
      }
    }
    for (const other of placed) {
      if (other.id > link.id && intersects(box, rectOfLabel(other.labelAt))) {
        issues.push(new Issue(where, `"${link.label}" overlaps the label of links[${other.id}]`, 'shorten one of them'));
      }
    }
    for (const node of scene.nodes) {
      if (intersects(box, textBox(node), 0)) {
        issues.push(new Issue(where, `"${link.label}" is printed over the text of nodes[${node.id}]`, 'shorten or drop the label; the box it covers may already say it'));
        continue;
      }
      const dx = Math.min(box.x + box.w, node.x + node.w) - Math.max(box.x, node.x);
      const dy = Math.min(box.y + box.h, node.y + node.h) - Math.max(box.y, node.y);
      if (dx <= 0 || dy <= 0) continue;
      const covered = (dx * dy) / (box.w * box.h);
      const finding = new Issue(where, `"${link.label}" sits on top of nodes[${node.id}]`, 'shorten the label or let the link route along a clearer run');
      if (covered > LABEL_COVER_LIMIT) issues.push(finding);
      else if (covered > 0.02) warnings.push(finding);
    }
  }
  return { issues, warnings };
}

function checkCaption(scene) {
  const box = scene.frame.caption;
  if (!box) return [];
  const issues = [];
  const { leftW, padX, gap, chipGap, ledeLines } = CAPTION_LAYOUT;
  const chipColW = (box.w - padX * 2 - leftW - gap - chipGap) / 2;
  const available = box.h - CAPTION_LAYOUT.padY * 2 - 60;

  scene.steps.forEach((step, index) => {
    const lede = wrapText(step.lede, leftW, { size: TYPE.caption, maxLines: ledeLines });
    if (lede.join(' ') !== step.lede.replace(/\s+/g, ' ').trim()) {
      issues.push(new Issue(
        `steps[${index}].lede`,
        `does not fit ${ledeLines} lines in the caption`,
        `about ${Math.round(step.lede.length * (ledeLines * leftW) / Math.max(1, measureText(step.lede, { size: TYPE.caption })) )} characters fit — trim it`,
      ));
    }

    const heights = (step.notes || []).map((note) => {
      const lines = wrapText(note.v, chipColW - 26, { size: TYPE.chipVal, maxLines: 2 });
      if (lines.join(' ') !== note.v.replace(/\s+/g, ' ').trim()) {
        issues.push(new Issue(
          `steps[${index}].notes[${note.k}]`,
          'the value is clipped in its chip',
          `"${note.v}" needs more than two lines at ${Math.round(chipColW)}px`,
        ));
      }
      if (measureText(note.k, { font: 'mono', size: TYPE.chipKey, weight: 500 }) > chipColW - 26) {
        issues.push(new Issue(`steps[${index}].notes[${note.k}]`, 'the key is wider than its chip'));
      }
      return 20 + 15 + lines.length * 15;
    });

    const columnHeights = [0, 0];
    heights.forEach((h, i) => { columnHeights[i % 2] += h + chipGap; });
    const tallest = Math.max(...columnHeights, 0) - chipGap;
    if (tallest > available) {
      issues.push(new Issue(
        `steps[${index}].notes`,
        `the chips are ${Math.round(tallest)}px tall and only ${Math.round(available)}px fit`,
        'drop a note, or shorten the longest values',
      ));
    }
  });

  return issues;
}

/**
 * A workflow reads left to right, so a forward step whose target is drawn
 * left of its source reads as the steps happening in the wrong order. The
 * usual cause is a `col` written by hand that disagrees with the flow.
 */
function checkDirection(scene) {
  if (scene.type !== 'workflow') return [];
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  return scene.links
    .filter((link) => link.backEdge === false)
    .filter((link) => {
      const from = byId.get(link.from);
      const to = byId.get(link.to);
      return from && to && to.x + to.w <= from.x + EPSILON;
    })
    .map((link) => new Issue(
      `links[${link.id}]`,
      `points backwards: ${link.from} → ${link.to} is a forward step drawn right to left`,
      'omit col in a workflow and the flow places the nodes, or fix the col that disagrees',
    ));
}

const CRAMPED_WIDTH = 124;

function checkDensity(scene) {
  const warnings = [];

  const squarish = scene.nodes.filter((n) => !n.size && n.w / n.h < 1.45);
  if (squarish.length) {
    warnings.push(new Issue(
      'nodes',
      `${squarish.length} ${squarish.length === 1 ? 'box is' : 'boxes are'} nearly square (${squarish.slice(0, 3).map((n) => n.id).join(', ')})`,
      'the sublabel is wrapping in a narrow column — shorten it, or use fewer columns',
    ));
  }

  const narrow = scene.nodes.filter((n) => !n.size && n.w < CRAMPED_WIDTH);
  if (narrow.length) {
    const widest = Math.round(Math.max(...scene.nodes.map((n) => n.w)));
    warnings.push(new Issue(
      'nodes',
      `${narrow.length} boxes are only ${widest}px wide`,
      'too many columns for the canvas — raise meta.width to about '
        + `${Math.round(scene.frame.width * (CRAMPED_WIDTH + 8) / (widest + 8) / 50) * 50}, or merge columns`,
    ));
  }

  const unclean = scene.links.filter((l) => l.points.length > 4).length;
  if (unclean > scene.links.length / 2 && scene.links.length > 4) {
    warnings.push(new Issue(
      'links',
      `${unclean} of ${scene.links.length} links need three or more bends`,
      'the node order probably does not match the order things are reached in',
    ));
  }
  const crossings = countCrossings(scene.links);
  if (crossings > 0) {
    warnings.push(new Issue(
      'links',
      `${crossings} pair${crossings === 1 ? '' : 's'} of links cross`,
      'crossings are legible in small numbers; past a handful, reorder the columns',
    ));
  }
  return warnings;
}

/** Axis-aligned crossings only, which is all an orthogonal route can produce. */
function countCrossings(links) {
  const segments = [];
  for (const link of links) {
    for (let i = 0; i < link.points.length - 1; i += 1) {
      const [ax, ay] = link.points[i];
      const [bx, by] = link.points[i + 1];
      segments.push({ id: link.id, ax, ay, bx, by, horizontal: Math.abs(ay - by) < EPSILON });
    }
  }
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      if (a.id === b.id || a.horizontal === b.horizontal) continue;
      const h = a.horizontal ? a : b;
      const v = a.horizontal ? b : a;
      const withinX = Math.min(h.ax, h.bx) < v.ax - EPSILON && v.ax < Math.max(h.ax, h.bx) - EPSILON;
      const withinY = Math.min(v.ay, v.by) < h.ay - EPSILON && h.ay < Math.max(v.ay, v.by) - EPSILON;
      if (withinX && withinY) count += 1;
    }
  }
  return count;
}

function fmt(box) {
  return `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.w)}x${Math.round(box.h)}`;
}
