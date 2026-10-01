/**
 * Fitting text into a box.
 *
 * Shared by every layout engine so a node looks the same whichever diagram it
 * appears in: the label shrinks through a fixed ladder of sizes before it is
 * ever truncated, and the sublabel wraps before it is ever cut.
 */

import { TYPE } from '../render/tokens.mjs';
import { ellipsise, measureText, wrapText } from './measure.mjs';

const LABEL_LADDER = [TYPE.nodeLabel, 12, TYPE.nodeLabelSm, 10];
const PAD_X = 12;
const PAD_Y = 11;
const LINE_GAP = 4;

/**
 * @returns {{labelLines, labelSize, subLines, subSize, truncated, contentHeight}}
 */
export function fitNodeText(node, width, height) {
  const inner = Math.max(24, width - PAD_X * 2);
  const label = String(node.label || '');

  let labelSize = LABEL_LADDER[LABEL_LADDER.length - 1];
  for (const size of LABEL_LADDER) {
    if (measureText(label, { font: 'mono', size, weight: 500 }) <= inner) { labelSize = size; break; }
  }

  const labelOpts = { font: 'mono', size: labelSize, weight: 500 };
  const fits = measureText(label, labelOpts) <= inner;
  const labelLines = fits ? [label] : [ellipsise(label, inner, labelOpts)];

  const subSize = labelSize <= TYPE.nodeLabelSm ? TYPE.nodeSubSm : TYPE.nodeSub;
  const subOpts = { size: subSize };
  const maxSubLines = height >= 78 ? 2 : 1;
  const subLines = node.sublabel ? wrapText(node.sublabel, inner, { ...subOpts, maxLines: maxSubLines }) : [];

  const lineHeights = [labelSize * 1.25, ...subLines.map(() => subSize * 1.35)];
  const contentHeight = lineHeights.reduce((a, b) => a + b, 0) + LINE_GAP * Math.max(0, lineHeights.length - 1);

  return {
    labelLines,
    labelSize,
    subLines,
    subSize,
    truncated: !fits || (node.sublabel ? subLines.join(' ') !== node.sublabel : false),
    contentHeight,
    overflowsBox: contentHeight > height - PAD_Y * 2,
  };
}

/** The y of each text baseline, vertically centred in the box. */
export function textBaselines(fit, boxY, boxHeight) {
  const top = boxY + (boxHeight - fit.contentHeight) / 2;
  const ys = [];
  let cursor = top + fit.labelSize * 0.95;
  ys.push(cursor);
  for (const _ of fit.subLines) {
    cursor += fit.subSize * 1.35 + LINE_GAP;
    ys.push(cursor);
  }
  return ys;
}

/** Width a node needs to show its text without shrinking. */
export function naturalWidth(node) {
  const label = measureText(node.label, { font: 'mono', size: TYPE.nodeLabel, weight: 500 });
  const sub = node.sublabel ? measureText(node.sublabel, { size: TYPE.nodeSub }) / 2 : 0;
  return Math.ceil(Math.max(label, sub) + PAD_X * 2);
}

export const BOX_PAD_X = PAD_X;
