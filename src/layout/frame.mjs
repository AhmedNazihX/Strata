/**
 * The page frame every diagram type shares: a header, a drawing canvas, and —
 * only when the document narrates steps — a caption panel along the bottom.
 */

import { GEO } from '../render/tokens.mjs';

/* A rail taller than this stops reading as a lane and starts reading as a
   region with a box lost inside it. */
export const RAIL_MAX_HEIGHT = 92;

export function computeFrame(doc) {
  const width = doc.meta.width;
  const height = doc.meta.height;
  const m = GEO.margin;
  const hasSteps = (doc.steps || []).length > 1;
  const captionH = hasSteps ? GEO.captionH : 0;

  const canvasY = GEO.headerH + 8;
  const canvasBottom = height - m - (captionH ? captionH + m : 0);

  return {
    width,
    height,
    margin: m,
    hasSteps,
    header: { x: m + 14, y: 26, w: width - (m + 14) * 2, h: GEO.headerH - 26 },
    canvas: { x: m, y: canvasY, w: width - m * 2, h: Math.max(160, canvasBottom - canvasY) },
    caption: captionH ? { x: m, y: height - m - captionH, w: width - m * 2, h: captionH } : null,
  };
}

/**
 * Horizontal rails, one per layer, filling the canvas height.
 * `gutter` is the left label column; nodes start after it.
 */
export function railBands(frame, layers, options = {}) {
  const gutter = options.gutter ?? GEO.gutter;
  const gap = options.gap ?? GEO.railGap;
  const count = Math.max(1, layers.length);
  const raw = (frame.canvas.h - gap * (count - 1)) / count;
  const h = Math.max(options.minHeight ?? 56, Math.min(options.maxHeight ?? RAIL_MAX_HEIGHT, raw));
  const totalH = h * count + gap * (count - 1);
  const top = frame.canvas.y + Math.max(0, (frame.canvas.h - totalH) / 2);

  return layers.map((layer, i) => ({
    ...layer,
    x: frame.canvas.x,
    y: top + i * (h + gap),
    w: frame.canvas.w,
    h,
    contentX: frame.canvas.x + gutter,
    contentW: frame.canvas.w - gutter - 10,
    labelX: frame.canvas.x + 14,
  }));
}

/** Vertical columns, one per layer — the sequence-diagram reading. */
export function columnBands(frame, layers, options = {}) {
  const gap = options.gap ?? 18;
  const headroom = options.headroom ?? 86;
  const count = Math.max(1, layers.length);
  const raw = (frame.canvas.w - gap * (count - 1)) / count;
  const w = Math.max(options.minWidth ?? 120, Math.min(options.maxWidth ?? 280, raw));
  const totalW = w * count + gap * (count - 1);
  const left = frame.canvas.x + Math.max(0, (frame.canvas.w - totalW) / 2);

  return layers.map((layer, i) => ({
    ...layer,
    x: left + i * (w + gap),
    y: frame.canvas.y,
    w,
    h: frame.canvas.h,
    cx: left + i * (w + gap) + w / 2,
    contentY: frame.canvas.y + headroom,
    contentH: frame.canvas.h - headroom,
  }));
}

/** Evenly divide a width into `cols` columns with a fixed gap. */
export function columnGrid(x, width, cols, gap = GEO.nodeGap) {
  const count = Math.max(1, cols);
  const colW = (width - gap * (count - 1)) / count;
  return {
    colW,
    gap,
    at(col, span = 1) {
      return { x: x + col * (colW + gap), w: span * colW + (span - 1) * gap };
    },
  };
}
