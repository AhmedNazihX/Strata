/**
 * Orthogonal link routing with node avoidance.
 *
 * Every link is a polyline of horizontal and vertical runs. A run that would
 * pass through a node box is slid sideways to the nearest clear corridor rather
 * than drawn over it, because a line crossing a box reads as a connection that
 * is not in the source.
 */

import { GEO } from '../render/tokens.mjs';

const CORRIDOR_STEP = 6;
const CORRIDOR_LIMIT = 420;
const CORNER_RADIUS = 9;

export function rectOf(node) {
  return {
    id: node.id, x: node.x, y: node.y, w: node.w, h: node.h,
    cx: node.x + node.w / 2, cy: node.y + node.h / 2,
    right: node.x + node.w, bottom: node.y + node.h,
  };
}

export function anchor(rect, side) {
  switch (side) {
    case 'top': return [rect.cx, rect.y];
    case 'bottom': return [rect.cx, rect.bottom];
    case 'left': return [rect.x, rect.cy];
    case 'right': return [rect.right, rect.cy];
    default: return [rect.cx, rect.cy];
  }
}

/** Pick sides when the author did not. Vertical separation wins ties. */
export function autoSides(a, b) {
  const dy = b.cy - a.cy;
  const dx = b.cx - a.cx;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  }
  return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
}

function overlaps1d(lo1, hi1, lo2, hi2) {
  return Math.max(lo1, lo2) < Math.min(hi1, hi2);
}

/** Does a vertical run at `x` between two y values clear every obstacle? */
export function clearX(x, yA, yB, obstacles, pad = GEO.linkGap, skip = []) {
  const lo = Math.min(yA, yB);
  const hi = Math.max(yA, yB);
  return !obstacles.some((r) =>
    !skip.includes(r.id) &&
    x > r.x - pad && x < r.right + pad &&
    overlaps1d(lo, hi, r.y - pad, r.bottom + pad));
}

/** Does a horizontal run at `y` between two x values clear every obstacle? */
export function clearY(y, xA, xB, obstacles, pad = GEO.linkGap, skip = []) {
  const lo = Math.min(xA, xB);
  const hi = Math.max(xA, xB);
  return !obstacles.some((r) =>
    !skip.includes(r.id) &&
    y > r.y - pad && y < r.bottom + pad &&
    overlaps1d(lo, hi, r.x - pad, r.right + pad));
}

/** Slide outward from `x` until the vertical run is clear. Null when nothing is. */
export function nearestClearX(x, yA, yB, obstacles, skip = []) {
  if (clearX(x, yA, yB, obstacles, GEO.linkGap, skip)) return x;
  for (let d = CORRIDOR_STEP; d <= CORRIDOR_LIMIT; d += CORRIDOR_STEP) {
    if (clearX(x - d, yA, yB, obstacles, GEO.linkGap, skip)) return x - d;
    if (clearX(x + d, yA, yB, obstacles, GEO.linkGap, skip)) return x + d;
  }
  return null;
}

export function nearestClearY(y, xA, xB, obstacles, skip = []) {
  if (clearY(y, xA, xB, obstacles, GEO.linkGap, skip)) return y;
  for (let d = CORRIDOR_STEP; d <= CORRIDOR_LIMIT; d += CORRIDOR_STEP) {
    if (clearY(y - d, xA, xB, obstacles, GEO.linkGap, skip)) return y - d;
    if (clearY(y + d, xA, xB, obstacles, GEO.linkGap, skip)) return y + d;
  }
  return null;
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 0.5 || Math.abs(last[1] - p[1]) > 0.5) out.push(p);
  }
  return out;
}

/**
 * Route one link.
 *
 * @param {object} from  rect of the source node
 * @param {object} to    rect of the target node
 * @param {object} spec  { fromSide, toSide, via }
 * @param {object[]} obstacles  every node rect on the page
 * @returns {{points: number[][], sides: string[], clean: boolean}}
 */
export function route(from, to, spec = {}, obstacles = []) {
  const skip = [from.id, to.id];
  const [autoFrom, autoTo] = autoSides(from, to);
  const fromSide = spec.fromSide || autoFrom;
  const toSide = spec.toSide || autoTo;
  const start = anchor(from, fromSide);
  const end = anchor(to, toSide);

  if (Array.isArray(spec.via) && spec.via.length) {
    const points = dedupe([start, ...spec.via.map((p) => [p[0], p[1]]), end]);
    return { points, sides: [fromSide, toSide], clean: isClean(points, obstacles, skip) };
  }

  const vertical = fromSide === 'top' || fromSide === 'bottom';
  const points = vertical
    ? routeVertical(start, end, from, to, obstacles, skip)
    : routeHorizontal(start, end, from, to, obstacles, skip);

  return { points, sides: [fromSide, toSide], clean: isClean(points, obstacles, skip) };
}

function routeVertical(start, end, from, to, obstacles, skip) {
  const [x1, y1] = start;
  const [x2, y2] = end;

  if (Math.abs(x1 - x2) < 1 && clearX(x1, y1, y2, obstacles, GEO.linkGap, skip)) {
    return [start, end];
  }

  const midSeed = (y1 + y2) / 2;
  const midY = nearestClearY(midSeed, x1, x2, obstacles, skip) ?? midSeed;
  const legA = nearestClearX(x1, y1, midY, obstacles, skip) ?? x1;
  const legB = nearestClearX(x2, midY, y2, obstacles, skip) ?? x2;

  return dedupe([
    start,
    [legA, y1], [legA, midY],
    [legB, midY], [legB, y2],
    end,
  ]);
}

function routeHorizontal(start, end, from, to, obstacles, skip) {
  const [x1, y1] = start;
  const [x2, y2] = end;

  if (Math.abs(y1 - y2) < 1 && clearY(y1, x1, x2, obstacles, GEO.linkGap, skip)) {
    return [start, end];
  }

  const midSeed = (x1 + x2) / 2;
  const midX = nearestClearX(midSeed, y1, y2, obstacles, skip) ?? midSeed;
  const legA = nearestClearY(y1, x1, midX, obstacles, skip) ?? y1;
  const legB = nearestClearY(y2, midX, x2, obstacles, skip) ?? y2;

  return dedupe([
    start,
    [x1, legA], [midX, legA],
    [midX, legB], [x2, legB],
    end,
  ]);
}

/** Every run clears every obstacle it is not attached to. */
export function isClean(points, obstacles, skip = []) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const ok = Math.abs(ax - bx) < 0.5
      ? clearX(ax, ay, by, obstacles, GEO.linkGap - 2, skip)
      : clearY(ay, ax, bx, obstacles, GEO.linkGap - 2, skip);
    if (!ok) return false;
  }
  return true;
}

/** An SVG path with rounded bends. */
export function pathD(points, radius = CORNER_RADIUS) {
  if (points.length < 2) return '';
  const n = (v) => Math.round(v * 10) / 10;
  if (points.length === 2) {
    return `M ${n(points[0][0])} ${n(points[0][1])} L ${n(points[1][0])} ${n(points[1][1])}`;
  }

  let d = `M ${n(points[0][0])} ${n(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const here = points[i];
    const next = points[i + 1];
    const rIn = Math.min(radius, dist(prev, here) / 2);
    const rOut = Math.min(radius, dist(here, next) / 2);
    const r = Math.min(rIn, rOut);
    if (r < 1) { d += ` L ${n(here[0])} ${n(here[1])}`; continue; }
    const a = towards(here, prev, r);
    const b = towards(here, next, r);
    d += ` L ${n(a[0])} ${n(a[1])} Q ${n(here[0])} ${n(here[1])} ${n(b[0])} ${n(b[1])}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${n(last[0])} ${n(last[1])}`;
}

function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function towards(origin, target, r) {
  const len = dist(origin, target) || 1;
  return [
    origin[0] + ((target[0] - origin[0]) / len) * r,
    origin[1] + ((target[1] - origin[1]) / len) * r,
  ];
}

/** Total run length, used to pace the travelling pulse. */
export function polylineLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) total += dist(points[i], points[i + 1]);
  return total;
}

/** A point partway along the polyline, for placing a label off the busiest run. */
export function pointAt(points, t = 0.5) {
  const total = polylineLength(points);
  if (!total) return points[0] || [0, 0];
  let target = total * t;
  for (let i = 0; i < points.length - 1; i += 1) {
    const seg = dist(points[i], points[i + 1]);
    if (target <= seg) {
      const k = seg ? target / seg : 0;
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * k,
        points[i][1] + (points[i + 1][1] - points[i][1]) * k,
      ];
    }
    target -= seg;
  }
  return points[points.length - 1];
}

/** The longest straight run, which is where a label sits most legibly. */
export function longestRun(points) {
  let best = { length: -1, mid: points[0] || [0, 0], horizontal: true };
  for (let i = 0; i < points.length - 1; i += 1) {
    const len = dist(points[i], points[i + 1]);
    if (len > best.length) {
      best = {
        length: len,
        mid: [(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2],
        horizontal: Math.abs(points[i][1] - points[i + 1][1]) < 0.5,
      };
    }
  }
  return best;
}
