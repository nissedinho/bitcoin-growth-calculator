// Minimal test harness — no framework, so the repo keeps a single dev dependency.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LIVE_PRICE = 86603;

let passed = 0;
const failures = [];

export function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}

export function eq(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what || 'value'} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function near(actual, expected, tolerance, what) {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`${what || 'value'} — expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

export function ok(cond, what) {
  if (!cond) throw new Error(what || 'expected truthy');
}

export function report(label) {
  if (failures.length) {
    console.log(`\n${label}: ${passed} passed, ${failures.length} FAILED`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${label}: ${passed} passed`);
  }
  return failures.length === 0;
}

/** Load index.html in a DOM with the network stubbed out. */
export function loadPage({ url = 'https://x.test/', daily = null, series = null } = {}) {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url,
    beforeParse(w) {
      w.fetch = async (u) => {
        u = String(u);
        if (u.includes('/api/price')) return { ok: true, json: async () => ({ price: LIVE_PRICE }) };
        if (u.includes('btc_daily')) return daily ? { ok: true, json: async () => ({ prices: daily }) } : { ok: false, json: async () => ({}) };
        if (u.includes('series.json')) return series ? { ok: true, json: async () => series } : { ok: false, json: async () => ({}) };
        return { ok: false, json: async () => ({}) };
      };
      w.gtag = () => {};
      w.navigator.clipboard = { writeText: async (t) => { w.__clip = t; } };
      // jsdom has no canvas; the chart only needs the calls not to throw.
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
        get: (t, k) => k === 'canvas' ? {}
          : k === 'measureText' ? (() => ({ width: 10 }))
          : k === 'createLinearGradient' ? (() => ({ addColorStop() {} }))
          : (() => {}),
      });
    },
  });
  return dom.window;
}

export const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));
