/**
 * The browser gate.
 *
 * The static checks reason about a layout; this one loads the file a person
 * will actually open and asks the rendering engine what it drew. It is the only
 * thing that can see a clipped label, a script that threw, or a step that
 * lights nothing — so when it cannot run, it reports that rather than passing.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT = 20000;
const DEFAULT_BROWSERS = ['chromium', 'webkit'];
const COMPARE_VIEWPORT = { width: 1280, height: 760 };
const COMPARE_TOLERANCE = 3.0; // greyscale levels, averaged over the frame
const CANDIDATES = ['playwright', '@playwright/test', 'playwright-core'];

/**
 * Find Playwright wherever it actually is.
 *
 * This skill is installed globally, so a bare import only ever searches beside
 * the skill. Almost every project that has Playwright has it in its own
 * node_modules, so the working directory is searched as well — resolved
 * explicitly rather than hoped for.
 */
export async function resolvePlaywright(cwd = process.cwd()) {
  for (const name of CANDIDATES) {
    try {
      const engines = enginesOf(await import(name));
      if (engines) return { engines, pkg: name, from: 'skill' };
    } catch { /* not beside the skill */ }
  }

  const require = createRequire(join(cwd, 'package.json'));
  for (const name of CANDIDATES) {
    try {
      const entry = require.resolve(name);
      const engines = enginesOf(await import(pathToFileURL(entry).href));
      if (engines) return { engines, pkg: name, from: cwd };
    } catch { /* not in the project either */ }
  }
  return null;
}

/* Playwright ships CommonJS, and the named export is not always detectable
   through an ESM import, so the default object is the reliable route. */
function enginesOf(mod) {
  const root = mod?.chromium ? mod : mod?.default;
  if (!root?.chromium) return null;
  return { chromium: root.chromium, webkit: root.webkit || null };
}

export async function checkInBrowser(htmlPath, options = {}) {
  const timeout = Number(options.timeout || DEFAULT_TIMEOUT);
  const found = await resolvePlaywright();
  if (!found) {
    return {
      status: 'unavailable',
      reason: `Playwright is not resolvable from ${process.cwd()} or from the skill`,
      remedy: 'npm i -D playwright && npx playwright install chromium webkit — or rerun with --no-browser',
      findings: [],
    };
  }

  const wanted = (options.browsers || DEFAULT_BROWSERS)
    .filter((name) => DEFAULT_BROWSERS.includes(name));
  const findings = [];
  const ran = [];
  const absent = [];

  for (const name of wanted) {
    const engine = found.engines[name];
    if (!engine) { absent.push(name); continue; }

    let browser;
    try {
      browser = await engine.launch();
    } catch (error) {
      absent.push(`${name} (${firstLine(error.message)})`);
      continue;
    }

    try {
      findings.push(...(await runChecks(browser, htmlPath, timeout)).map((f) => ({ ...f, engine: name })));
      ran.push(name);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  if (!ran.length) {
    return {
      status: 'unavailable',
      reason: `no browser engine would start (${absent.join('; ')})`,
      remedy: 'npx playwright install chromium webkit',
      findings,
    };
  }

  if (ran.length > 1) {
    findings.push(...await compareEngines(found, ran, htmlPath, timeout));
  }

  const errors = findings.filter((f) => f.level === 'error');
  return {
    status: errors.length ? 'failed' : 'passed',
    engine: ran.join(' + ') + (absent.length ? ` (${absent.join(', ')} not available)` : ''),
    partial: absent.length > 0,
    findings,
  };
}

/**
 * Do the engines draw the same picture?
 *
 * Checking computed styles is not enough: WebKit will happily report a
 * `filter: drop-shadow()` it never paints, and ignore an `rx` it does not
 * implement, so a diagram can pass every property check and still arrive in
 * Safari with no glow and square corners. This renders the same frame in each
 * engine, reduces both to a small greyscale signature, and compares them.
 */
async function compareEngines(found, ran, htmlPath, timeout) {
  const shots = {};
  for (const name of ran) {
    const browser = await found.engines[name].launch().catch(() => null);
    if (!browser) return [];
    try {
      const page = await browser.newPage({ viewport: COMPARE_VIEWPORT });
      await page.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout });
      // Animation phase differs between engines by definition, so freeze it.
      await page.evaluate(() => { if (window.TL) window.TL.setMotion('off', false); });
      await page.waitForTimeout(400);
      shots[name] = (await page.screenshot({ type: 'png' })).toString('base64');
      await page.close();
    } finally {
      await browser.close().catch(() => {});
    }
  }

  const [a, b] = ran;
  const browser = await found.engines.chromium.launch().catch(() => null);
  if (!browser) return [];
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    const diff = await page.evaluate(compareInPage, [shots[a], shots[b]]);
    const detail = `${a} and ${b} differ by ${diff.mean.toFixed(2)} of 255 on average`
      + ` (worst cell ${diff.max.toFixed(0)})`;
    return [{
      level: diff.mean > COMPARE_TOLERANCE ? 'error' : 'info',
      what: 'cross-engine',
      detail: diff.mean > COMPARE_TOLERANCE
        ? `${detail} — one of them is not drawing something the other is`
        : detail,
    }];
  } finally {
    await browser.close().catch(() => {});
  }
}

/* Runs inside a page, where a PNG can actually be decoded. */
function compareInPage(pair) {
  const load = (b64) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('could not decode a screenshot'));
    image.src = `data:image/png;base64,${b64}`;
  });

  const signature = (image) => {
    const W = 112;
    const H = 63;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    const out = new Float64Array(W * H);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
    }
    return out;
  };

  return Promise.all(pair.map(load)).then((images) => {
    const a = signature(images[0]);
    const b = signature(images[1]);
    let sum = 0;
    let max = 0;
    for (let i = 0; i < a.length; i += 1) {
      const d = Math.abs(a[i] - b[i]);
      sum += d;
      if (d > max) max = d;
    }
    return { mean: sum / a.length, max };
  });
}

/* Chromium and WebKit disagree often enough — on motion, on offset paths, on
   how a system preference reaches the page — that passing in one proves
   nothing about the other. Both run, and a failure in either fails the gate. */
async function runChecks(browser, htmlPath, timeout) {
  const findings = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') findings.push({ level: 'error', what: 'console', detail: msg.text() });
    });
    page.on('pageerror', (error) => {
      findings.push({ level: 'error', what: 'script', detail: error.message });
    });

    await page.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout });
    await page.waitForTimeout(350);

    findings.push(...await measureText(page));
    findings.push(...await walkSteps(page, timeout));
    findings.push(...await openCitation(page, timeout));
    findings.push(...await checkMotion(page));
    findings.push(...await checkPortability(page));
    findings.push(...await toggleTheme(page));
  } catch (error) {
    findings.push({ level: 'error', what: 'gate', detail: error.message });
  }
  return findings;
}

function firstLine(text) {
  return String(text).split('\n')[0].slice(0, 120);
}

/**
 * The pulses must actually travel.
 *
 * This exists because a diagram can be perfectly correct and completely still:
 * the page honours the system's reduced-motion preference, so an animation that
 * runs in one browser can be silently dead in another on the same machine.
 */
async function checkMotion(page) {
  const declared = await page.evaluate(() => Boolean(window.TL) && window.TL.data.meta.motion !== 'off');
  if (!declared) return [];

  await page.evaluate(() => { if (window.TL && !window.TL.motion) window.TL.setMotion('on', false); });
  await page.waitForTimeout(120);

  // A step that lights no link has nothing to animate, and an opening overview
  // step is often exactly that — so find a step that does before judging.
  const dots = await page.$$('.dot');
  let lit = await page.$$eval('.link.on', (els) => els.length);
  for (let i = 0; i < dots.length && lit === 0; i += 1) {
    await dots[i].click().catch(() => {});
    await page.waitForTimeout(110);
    lit = await page.$$eval('.link.on', (els) => els.length);
  }
  if (lit === 0) return [];

  const sample = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.link.on .pulse'))
      .map((c) => { const r = c.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}`; }));

  const before = await sample();
  if (!before.length) {
    return [{ level: 'error', what: 'motion', detail: `${lit} links are lit but none of them draw a pulse` }];
  }
  await page.waitForTimeout(320);
  const after = await sample();

  const moved = before.filter((value, i) => value !== after[i]).length;
  return moved === 0
    ? [{ level: 'error', what: 'motion', detail: `${before.length} pulses are drawn but none of them move` }]
    : [];
}

/** Exact overflow detection: every text run measured against the box it sits in. */
function measureText(page) {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.node').forEach((node) => {
      const box = node.querySelector('.node-box');
      if (!box) return;
      const limit = box.getBBox();
      node.querySelectorAll('.node-label, .node-sub, .node-tag').forEach((text) => {
        const bounds = text.getBBox();
        const overshootX = (bounds.x + bounds.width) - (limit.x + limit.width - 4);
        const overshootY = (bounds.y + bounds.height) - (limit.y + limit.height - 2);
        if (overshootX > 0.5 || overshootY > 0.5) {
          out.push({
            level: 'error',
            what: 'text-overflow',
            detail: `${node.getAttribute('data-node')}: "${text.textContent}" overruns its box by ${Math.max(overshootX, overshootY).toFixed(1)}px`,
          });
        }
      });
    });

    const page_ = document.querySelector('.tl-page').getBoundingClientRect();
    document.querySelectorAll('.tl-caption, .tl-stage, header').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > page_.bottom + 1 || r.right > page_.right + 1) {
        out.push({ level: 'error', what: 'layout-overflow', detail: `${el.className || el.tagName} extends past the page` });
      }
    });

    const caption = document.querySelector('.tl-caption');
    if (caption && caption.scrollHeight > caption.clientHeight + 1) {
      out.push({ level: 'error', what: 'caption-overflow', detail: `the caption needs ${caption.scrollHeight}px and has ${caption.clientHeight}px` });
    }
    return out;
  });
}

/** Click every step and confirm it lights something and says something. */
async function walkSteps(page, timeout) {
  const findings = [];
  const dots = await page.$$('.dot');
  if (!dots.length) return findings;

  for (let i = 0; i < dots.length; i += 1) {
    await dots[i].click({ timeout });
    await page.waitForTimeout(90);
    const observed = await page.evaluate(() => ({
      title: (document.getElementById('tl-cap-title') || {}).textContent || '',
      lede: (document.getElementById('tl-cap-lede') || {}).textContent || '',
      nodes: document.querySelectorAll('.node.on').length,
      links: document.querySelectorAll('.link.on').length,
      chips: document.querySelectorAll('.tl-chip').length,
    }));
    if (!observed.title.trim()) {
      findings.push({ level: 'error', what: 'step', detail: `step ${i + 1} renders no title` });
    }
    if (observed.nodes === 0 && observed.links === 0) {
      findings.push({ level: 'error', what: 'step', detail: `step ${i + 1} lights no node and no link` });
    }
  }
  await dots[0].click({ timeout }).catch(() => {});
  return findings;
}

/**
 * Open a node and expand one of its citations.
 *
 * Worth a gate of its own because the failure is invisible from the outside:
 * the code block can be present and correct in the DOM while the panel holding
 * it is hidden, which is exactly what happened once.
 */
async function openCitation(page, timeout) {
  const hasSnippets = await page.evaluate(() =>
    Boolean(window.TL && window.TL.data.snippets && Object.keys(window.TL.data.snippets).length));
  if (!hasSnippets) return [];

  // A box that opens is not necessarily one that cites code: some only explain
  // themselves. Pick one whose panel holds an embedded citation, its own or one
  // of its links', or the gate fails a page that is fine.
  const citing = await page.evaluate(() => {
    const { nodes = {}, snippets = {} } = window.TL.data;
    const embedded = (list) => (list || []).some((source) => snippets[source]);
    return Object.keys(nodes).find((id) => embedded(nodes[id].sources)
      || (nodes[id].links || []).some((link) => embedded(link.sources))) || null;
  });
  const node = citing ? await page.$(`.node.has-detail[data-node="${citing}"]`) : null;
  if (!node) return [{ level: 'error', what: 'citation', detail: 'code was embedded but no node that cites it is clickable' }];

  await node.click({ timeout });
  await page.waitForTimeout(120);

  const button = await page.$('.tl-src:not([disabled])');
  if (!button) return [{ level: 'error', what: 'citation', detail: 'the detail panel offers no citation to open' }];

  await button.click({ timeout });
  await page.waitForTimeout(220);

  const observed = await page.evaluate(() => {
    const panel = document.getElementById('tl-detail');
    const code = panel && panel.querySelector('.tl-code:not([hidden])');
    const box = panel ? panel.getBoundingClientRect() : { width: 0, height: 0 };
    return {
      panelShown: Boolean(panel) && getComputedStyle(panel).display !== 'none' && box.width > 0 && box.height > 0,
      lines: code ? code.querySelectorAll('.tl-line').length : 0,
      cited: code ? code.querySelectorAll('.tl-line.cited').length : 0,
    };
  });

  const out = [];
  if (!observed.panelShown) out.push({ level: 'error', what: 'citation', detail: 'expanding a citation hid the panel holding it' });
  if (!observed.lines) out.push({ level: 'error', what: 'citation', detail: 'the citation opened no code' });
  if (!observed.cited) out.push({ level: 'error', what: 'citation', detail: 'the opened code marks no cited line' });

  await page.keyboard.press('Escape').catch(() => {});
  return out;
}

/**
 * Properties the engines disagree about.
 *
 * Two real bugs reached a reader through this gap. WebKit reports a
 * `filter: drop-shadow()` in its computed style and then paints nothing, and it
 * does not implement `rx` as a CSS property at all — so a diagram passed every
 * check and still arrived in Safari with no glow and square corners. Both are
 * now stated as rules about the markup rather than hoped for.
 */
async function checkPortability(page) {
  return page.evaluate(() => {
    const out = [];
    const svg = document.querySelector('.tl-stage');
    if (!svg) return out;

    // url(#id) references an SVG <filter>, which WebKit does paint. The
    // functional forms — drop-shadow(), blur() — are the ones it ignores.
    const filtered = Array.from(svg.querySelectorAll('*')).filter((el) => {
      const value = getComputedStyle(el).filter;
      return value && value !== 'none' && !/^url\(/.test(value.trim());
    });
    if (filtered.length) {
      const names = Array.from(new Set(filtered.map((el) => el.getAttribute('class') || el.tagName)));
      out.push({
        level: 'error',
        what: 'portability',
        detail: `${filtered.length} SVG elements carry a CSS filter (${names.slice(0, 3).join(', ')}) — WebKit will not paint it`,
      });
    }

    const rounded = [
      ['.node-box', 'node'],
      ['.rail', 'rail'],
    ];
    for (const [selector, label] of rounded) {
      const rect = svg.querySelector(selector);
      if (rect && !(rect.rx && rect.rx.baseVal.value > 0)) {
        out.push({
          level: 'error',
          what: 'portability',
          detail: `the ${label} rectangle has no rx attribute — a radius set in CSS squares off in WebKit`,
        });
      }
    }

    const ring = svg.querySelector('.node.on .node-ring');
    if (ring && Number(getComputedStyle(ring).opacity) <= 0) {
      out.push({ level: 'error', what: 'portability', detail: 'an active node draws no ring' });
    }
    return out;
  });
}

async function toggleTheme(page) {
  const button = await page.$('#tl-theme');
  if (!button) return [];
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('.tl-page')).backgroundColor);
  await button.click();
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => getComputedStyle(document.querySelector('.tl-page')).backgroundColor);
  await button.click();
  return before === after
    ? [{ level: 'error', what: 'theme', detail: 'the theme toggle did not change the background' }]
    : [];
}
