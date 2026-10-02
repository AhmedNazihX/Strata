/**
 * Orthogonal link routing with node avoidance.
 *
 * Every link is a polyline of horizontal and vertical runs. A run that would
 * pass through a node box is slid sideways to the nearest clear corridor rather
 * than drawn over it, because a line crossing a box reads as a connection that
 * is not in the source.
 */

import { GEO } from '../render/tokens.mjs';

const CORRIDOR_STEP = 1;
const CORRIDOR_LIMIT = 420;
const CORNER_RADIUS = 9;

export function rectOf(node) {
  return {
    id: node.id, x: node.x, y: node.y, w: node.w, h: node.h,
    cx: node.x + node.w / 2, cy: node.y + node.h / 2,
    right: node.x + node.w, bottom: node.y + node.h,
  };
}

const ANCHOR_INSET = 26;

/**
 * Where a link meets a box.
 *
 * A link leaves the point on that edge nearest the thing it is going to, not
 * the middle of the edge. On an ordinary box the two are nearly the same; on a
 * node spanning most of the page they are not, and anchoring at the centre
 * sends every link on a long sideways run through empty space before it can
 * drop — which reads as a detour the diagram never explains.
 */
export function anchor(rect, side, toward = null) {
  const alongX = () => (toward
    ? clamp(toward.cx, rect.x + inset(rect.w), rect.right - inset(rect.w))
    : rect.cx);
  const alongY = () => (toward
    ? clamp(toward.cy, rect.y + inset(rect.h), rect.bottom - inset(rect.h))
    : rect.cy);

  switch (side) {
    case 'top': return [alongX(), rect.y];
    case 'bottom': return [alongX(), rect.bottom];
    case 'left': return [rect.x, alongY()];
    case 'right': return [rect.right, alongY()];
    default: return [rect.cx, rect.cy];
  }
}

function inset(extent) {
  return Math.min(ANCHOR_INSET, extent / 4);
}

function clamp(value, low, high) {
  return low > high ? (low + high) / 2 : Math.min(Math.max(value, low), high);
}

/**
 * Pick sides when the author did not.
 *
 * On the axis where the boxes actually have a gap between them, not the axis
 * where their centres happen to be furthest apart. Two boxes stacked in one
 * column have centres 90px apart vertically and 0 apart horizontally, but if
 * you only compare centres a wide box pair can still come out "horizontal" —
 * and then the route leaves one side, doubles back through its own box and
 * crosses both.
 */
export function autoSides(a, b) {
  const gapX = Math.max(b.x - a.right, a.x - b.right);
  const gapY = Math.max(b.y - a.bottom, a.y - b.bottom);
  const horizontal = gapX > 0 && gapY <= 0 ? true
    : gapY > 0 && gapX <= 0 ? false
      : Math.abs(b.cx - a.cx) > Math.abs(b.cy - a.cy);

  if (horizontal) return b.cx >= a.cx ? ['right', 'left'] : ['left', 'right'];
  return b.cy >= a.cy ? ['bottom', 'top'] : ['top', 'bottom'];
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

/**
 * Is a run at `at` (an x for a vertical run, a y for a horizontal one) clear of
 * every line already drawn? `lines` holds only the lines this link may not
 * merge with — those sharing no box with it. Two such lines on one track read
 * as one line with two meanings.
 */
function trackFree(vertical, at, lo, hi, lines) {
  return !lines.some((seg) => seg.vertical === vertical
    && Math.abs(seg.at - at) < GEO.lineGap
    && overlaps1d(Math.min(lo, hi), Math.max(lo, hi), seg.lo, seg.hi));
}

/**
 * Slide outward from `x` until the vertical run clears every box and every
 * taken track. When the gutter has no free track left, a shared one is
 * better than none, so it falls back to boxes alone. Null when nothing is.
 */
export function nearestClearX(x, yA, yB, obstacles, skip = [], lines = []) {
  const ok = (cx, withLines) => clearX(cx, yA, yB, obstacles, GEO.linkGap, skip)
    && (!withLines || trackFree(true, cx, yA, yB, lines));
  for (const withLines of lines.length ? [true, false] : [false]) {
    if (ok(x, withLines)) return x;
    for (let d = CORRIDOR_STEP; d <= CORRIDOR_LIMIT; d += CORRIDOR_STEP) {
      if (ok(x - d, withLines)) return x - d;
      if (ok(x + d, withLines)) return x + d;
    }
  }
  return null;
}

export function nearestClearY(y, xA, xB, obstacles, skip = [], lines = []) {
  const ok = (cy, withLines) => clearY(cy, xA, xB, obstacles, GEO.linkGap, skip)
    && (!withLines || trackFree(false, cy, xA, xB, lines));
  for (const withLines of lines.length ? [true, false] : [false]) {
    if (ok(y, withLines)) return y;
    for (let d = CORRIDOR_STEP; d <= CORRIDOR_LIMIT; d += CORRIDOR_STEP) {
      if (ok(y - d, withLines)) return y - d;
      if (ok(y + d, withLines)) return y + d;
    }
  }
  return null;
}

/** A routed polyline as track segments, for the links routed after it. */
export function tracksOf(points, ends) {
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    if (Math.abs(ax - bx) < 0.5) out.push({ vertical: true, at: ax, lo: Math.min(ay, by), hi: Math.max(ay, by), ends });
    else if (Math.abs(ay - by) < 0.5) out.push({ vertical: false, at: ay, lo: Math.min(ax, bx), hi: Math.max(ax, bx), ends });
  }
  return out;
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
export function route(from, to, spec = {}, obstacles = [], tracks = []) {
  const skip = [from.id, to.id];
  const lines = tracks.filter((seg) => !seg.ends.some((id) => id === from.id || id === to.id));
  const [autoFrom, autoTo] = autoSides(from, to);
  const fromSide = spec.fromSide || autoFrom;
  const toSide = spec.toSide || autoTo;
  if (Array.isArray(spec.via) && spec.via.length) {
    // Each end aims at its own first bend, not at the far box: the far box
    // can be anywhere, and anchoring toward it put a slanted stroke between
    // the anchor and a via point that was laid out from the box's centre.
    const via = spec.via.map((p) => [p[0], p[1]]);
    const toward = ([x, y]) => ({ cx: x, cy: y });
    const points = dedupe([
      anchor(from, fromSide, toward(via[0])),
      ...via,
      anchor(to, toSide, toward(via[via.length - 1])),
    ]);
    return { points, sides: [fromSide, toSide], clean: isClean(points, obstacles, skip) };
  }

  const attempt = (f, t) => {
    const pts = (f === 'top' || f === 'bottom')
      ? routeVertical(anchor(from, f, to), anchor(to, t, from), obstacles, skip, lines)
      : routeHorizontal(anchor(from, f, to), anchor(to, t, from), obstacles, skip, lines);
    return { points: pts, sides: [f, t], clean: isClean(pts, obstacles, skip) };
  };

  const first = attempt(fromSide, toSide);
  // A side hint is a preference, not a licence to draw through a box. Explicit
  // geometry (`via`) is the only hard override, and it returned above.
  if (first.clean) return first;

  // The chosen axis does not work here. The other one often does, and a clean
  // route on the second axis beats a tidy-looking one that crosses a box.
  const [altFrom, altTo] = fromSide === 'top' || fromSide === 'bottom'
    ? (to.cx >= from.cx ? ['right', 'left'] : ['left', 'right'])
    : (to.cy >= from.cy ? ['bottom', 'top'] : ['top', 'bottom']);
  const second = attempt(altFrom, altTo);
  return second.clean ? second : first;
}

function routeVertical(start, end, obstacles, skip, lines) {
  const [x1, y1] = start;
  const [x2, y2] = end;

  if (Math.abs(x1 - x2) < 1 && clearX(x1, y1, y2, obstacles, GEO.linkGap, skip)
    && trackFree(true, x1, y1, y2, lines)) {
    return [start, end];
  }

  const midSeed = (y1 + y2) / 2;
  const midY = nearestClearY(midSeed, x1, x2, obstacles, skip, lines) ?? midSeed;
  const legA = nearestClearX(x1, y1, midY, obstacles, skip, lines) ?? x1;
  const legB = nearestClearX(x2, midY, y2, obstacles, skip, lines) ?? x2;

  return dedupe([
    start,
    [legA, y1], [legA, midY],
    [legB, midY], [legB, y2],
    end,
  ]);
}

function routeHorizontal(start, end, obstacles, skip, lines) {
  const [x1, y1] = start;
  const [x2, y2] = end;

  if (Math.abs(y1 - y2) < 1 && clearY(y1, x1, x2, obstacles, GEO.linkGap, skip)
    && trackFree(false, y1, x1, x2, lines)) {
    return [start, end];
  }

  const midSeed = (x1 + x2) / 2;
  const midX = nearestClearX(midSeed, y1, y2, obstacles, skip, lines) ?? midSeed;
  const legA = nearestClearY(y1, x1, midX, obstacles, skip, lines) ?? y1;
  const legB = nearestClearY(y2, midX, x2, obstacles, skip, lines) ?? y2;

  return dedupe([
    start,
    [x1, legA], [midX, legA],
    [midX, legB], [x2, legB],
    end,
  ]);
}

const ANCHOR_ALLOWANCE = 3;
const OWN_BOX_INSET = 2;

/**
 * How far a segment runs inside a rectangle.
 *
 * An axis-aligned segment has zero extent on one axis, so an intersection test
 * that demands overlap on both will never fire for the lines this router draws.
 * That is how routes crossing their own boxes went unnoticed.
 */
export function runInside(ax, ay, bx, by, r, pad = 0) {
  const overlapX = Math.min(Math.max(ax, bx), r.right - pad) - Math.max(Math.min(ax, bx), r.x + pad);
  const overlapY = Math.min(Math.max(ay, by), r.bottom - pad) - Math.max(Math.min(ay, by), r.y + pad);
  if (overlapX < 0 || overlapY < 0) return 0;
  return Math.max(overlapX, overlapY);
}

/**
 * Every run clears every box — including the two it connects, which a link may
 * touch at its anchor but must never travel through.
 */
export function isClean(points, obstacles, skip = []) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    for (const rect of obstacles) {
      const own = skip.includes(rect.id);
      // A link legitimately runs *along* its own edge on the way out, so the
      // own-box test is strictly-inside; other boxes keep their clearance band.
      const run = runInside(ax, ay, bx, by, rect, own ? OWN_BOX_INSET : -(GEO.linkGap - 2));
      if (run > (own ? ANCHOR_ALLOWANCE : 0)) return false;
    }
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
