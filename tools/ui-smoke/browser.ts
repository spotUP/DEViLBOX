/**
 * Headless Chromium launcher for ui-smoke tests.
 *
 * Starts Chrome with audio flags that make `AudioContext` work without a
 * user gesture, opens `http://localhost:5173` (or `$DEVILBOX_URL`), waits
 * for DEViLBOX to connect to the MCP bridge, and exposes helpers for
 * per-flow page reload.
 *
 * Why this exists: the flows were relying on a hand-opened browser tab
 * which made them impossible to run in CI and brittle locally (state
 * leaking between flows, AudioContext suspended if the tab unfocused).
 * A dedicated Puppeteer-driven tab solves both.
 *
 * Dev server prerequisite: `npm run dev` must be running separately
 * (Vite on :5173, Express relay on :4003). The browser connects to
 * those; we don't spawn them from here.
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';

const DEFAULT_URL = process.env.DEVILBOX_URL ?? 'http://localhost:5173';
const HEADLESS = process.env.DEVILBOX_HEADLESS !== 'false';
const SLOWMO_MS = Number(process.env.DEVILBOX_SLOWMO ?? '0');

const CHROMIUM_ARGS = [
  // Let AudioContext start without a user gesture — the whole point of this
  // file. Without it, Tone.js stays suspended and every flow goes silent.
  '--autoplay-policy=no-user-gesture-required',
  // Mute system-level audio so the CI / dev machine doesn't yelp music every
  // test run. `Tone.Analyser` taps upstream of the destination so RMS/peak
  // measurements still work.
  '--mute-audio',
  // Audio timing stability — without these, AudioContext gets throttled in
  // the background and measurements jitter.
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  // Cross-origin isolation flags the DEViLBOX dev server already sends —
  // replicate in the browser so the audio context supports SharedArrayBuffer
  // (scsynth etc. need it).
  '--enable-features=SharedArrayBuffer',
];

export interface BrowserHandle {
  browser: Browser;
  page: Page;
  /** Reload the page and wait for the MCP WS bridge to re-register. */
  reloadAndWaitForBridge(): Promise<void>;
  /** Clean up. */
  close(): Promise<void>;
}

async function waitForBridgeReady(page: Page, timeoutMs = 15000): Promise<void> {
  // DEViLBOX's MCPBridge registers window.__devilboxBridgeReady (or similar
  // side-effect flag) on connect. If that symbol isn't available in the
  // current build, fall back to just waiting for the document to be idle
  // and trusting that our WS client will fail clearly if the bridge
  // didn't wire up.
  try {
    await page.waitForFunction(
      () => typeof (window as unknown as { __devilboxReady?: boolean }).__devilboxReady !== 'undefined'
        || document.title.length > 0,
      { timeout: timeoutMs, polling: 250 },
    );
  } catch {
    /* non-fatal — the test's tryConnect() does the real readiness check */
  }
}

export async function launchBrowser(url = DEFAULT_URL): Promise<BrowserHandle> {
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    slowMo: SLOWMO_MS || undefined,
    args: CHROMIUM_ARGS,
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  // Surface browser console lines to test output — helpful when a flow
  // fails on a cryptic assertion and the real cause is a browser-side
  // warning/error.
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warn') {
      const text = msg.text();
      if (!/favicon|devtools|Autoplay/i.test(text)) {
        // eslint-disable-next-line no-console
        console.warn(`[browser ${type}] ${text}`);
      }
    }
  });
  page.on('pageerror', (err) => {
    // eslint-disable-next-line no-console
    console.error(`[browser pageerror] ${err.message}`);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForBridgeReady(page);

  // Give the MCP relay a moment to accept the browser's registration.
  await new Promise((r) => setTimeout(r, 800));

  return {
    browser,
    page,
    async reloadAndWaitForBridge() {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForBridgeReady(page);
      await new Promise((r) => setTimeout(r, 800));
    },
    async close() {
      await browser.close();
    },
  };
}
