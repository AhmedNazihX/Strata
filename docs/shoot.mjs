#!/usr/bin/env node
/**
 * Regenerates every image the README shows, from the current renderer.
 *
 *   node docs/shoot.mjs
 *
 * Renders the five worked examples and docs/src/finalize.json (which cites this
 * repository, so it can show the code panel), then photographs them in both
 * themes with Playwright and turns one walkthrough into a GIF with ffmpeg.
 * Every shot loads a fresh page: a URL that differs only in its hash does not
 * reload, and the viewer reads its deep link once, at load.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePlaywright } from '../src/check/browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, '.strata', 'docs');
const OUT = join(ROOT, 'docs', 'img');

const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;
const SETTLE_MS = 700;
const THEMES = ['dark', 'light'];
const TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'];
const HERO = { type: 'architecture', step: 4 };
const CITATION = { node: 'geometry', step: 2 };

const GIF = { type: 'architecture', theme: 'dark', steps: 5, stepMs: 2400, width: 800, fps: 10 };

function run(args) {
  const result = spawnSync(process.execPath, [join(ROOT, 'bin', 'strata.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`strata ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  }
}

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (result.error) throw new Error(`ffmpeg is needed for the walkthrough GIF: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg failed:\n${result.stderr}`);
}

function url(name, hash) {
  const parts = Object.entries(hash).map(([key, value]) => `${key}=${value}`);
  return `file://${join(WORK, `${name}.html`)}#${parts.join('&')}`;
}

async function freshPage(browser, theme, options = {}) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: theme,
    reducedMotion: 'reduce',
    ...options,
  });
  return { context, page: await context.newPage() };
}

/** The stage rectangle, and where the caption panel starts inside it. */
async function regions(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return { stage: rect('.tl-stage'), caption: rect('.tl-caption') };
  });
}

async function shoot(browser, { name, theme, hash, file, diagramOnly = false, openCode = false }) {
  const { context, page } = await freshPage(browser, theme);
  try {
    await page.goto(url(name, { ...hash, theme, motion: 'off' }));
    await page.waitForTimeout(SETTLE_MS);
    if (openCode) {
      await page.click('.tl-detail .tl-src:not([disabled])');
      await page.waitForTimeout(SETTLE_MS);
    }
    const { stage, caption } = await regions(page);
    const clip = diagramOnly ? { ...stage, height: caption.y - stage.y } : stage;
    await page.screenshot({ path: join(OUT, file), clip });
  } finally {
    await context.close();
  }
}

async function recordWalkthrough(browser) {
  const videoDir = join(WORK, 'video');
  rmSync(videoDir, { recursive: true, force: true });
  const { context, page } = await freshPage(browser, GIF.theme, {
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  await page.goto(url(GIF.type, { step: 1, theme: GIF.theme, motion: 'on' }));
  const { stage } = await regions(page);
  await page.waitForTimeout(GIF.stepMs);
  for (let step = 1; step < GIF.steps; step += 1) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(GIF.stepMs);
  }
  const video = page.video();
  await context.close();
  return { path: await video.path(), stage };
}

function toGif({ path, stage }) {
  const crop = `crop=${Math.round(stage.width)}:${Math.round(stage.height)}:${Math.round(stage.x)}:${Math.round(stage.y)}`;
  const filters = `${crop},fps=${GIF.fps},scale=${GIF.width}:-1:flags=lanczos`;
  const palette = join(WORK, 'palette.png');
  // The first second is the page loading; skip it.
  ffmpeg(['-ss', '1', '-i', path, '-vf', `${filters},palettegen=stats_mode=diff`, palette]);
  ffmpeg(['-ss', '1', '-i', path, '-i', palette, '-lavfi', `${filters}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=4`, join(OUT, 'walkthrough.gif')]);
}

async function main() {
  const found = await resolvePlaywright();
  if (!found) throw new Error('Playwright is not resolvable — npm i -D playwright && npx playwright install chromium');
  const { chromium } = found.engines;

  mkdirSync(OUT, { recursive: true });
  run(['demo', WORK]);
  run(['finalize', 'docs/src/finalize.json', '--repo-root', '.', '--no-browser']);

  const browser = await chromium.launch();
  try {
    for (const theme of THEMES) {
      await shoot(browser, { name: HERO.type, theme, hash: { step: HERO.step }, file: `hero-${theme}.png` });
      await shoot(browser, {
        name: 'finalize', theme, hash: { step: CITATION.step, node: CITATION.node }, file: `citation-${theme}.png`, openCode: true,
      });
      for (const type of TYPES) {
        await shoot(browser, { name: type, theme, hash: { step: 2 }, file: `${type}-${theme}.png`, diagramOnly: true });
      }
    }
    toGif(await recordWalkthrough(browser));
  } finally {
    await browser.close();
  }
  process.stdout.write(`images written to ${OUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
