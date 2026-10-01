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

const EPSILON = 0.5;
const LABEL_CLEARANCE = 2;

export function checkGeometry(scene) {
  const issues = [];
  const warnings = [];

  issues.push(...checkOverlaps(scene));
  issues.push(...checkBounds(scene));
  issues.push(...checkText(scene));
  issues.push(...checkLinks(scene));
  issues.push(...checkCaption(scene));
  warnings.push(...checkLabels(scene));
  warnings.push(...checkDensity(scene));

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
  }
  return issues;
}

function checkLabels(scene) {
  const warnings = [];
  const boxes = scene.nodes;
  for (const link of scene.links) {
    if (!link.labelAt) continue;
    const label = {
      x: link.labelAt.x - link.labelAt.w / 2,
      y: link.labelAt.y,
      w: link.labelAt.w,
      h: link.labelAt.h,
    };
    const hit = boxes.find((node) => intersects(label, node, LABEL_CLEARANCE));
    if (hit) {
      warnings.push(new Issue(
        `links[${link.id}].label`,
        `"${link.label}" sits on top of nodes[${hit.id}]`,
        'shorten the label or let the link route along a clearer run',
      ));
    }
  }
  return warnings;
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
