// Static search/agent-readable contracts. No browser scripts or network requests run.
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, check, eq, ok, report } from './harness.mjs';

const SITE = 'https://www.bitcoingrowthcalculator.com';
const pages = ['/', '/faq', ...Array.from({length: 13}, (_, i) => `/what-if/${2013+i}/`)];
const normalize = value => value.replace(/\s+/g, ' ').trim();
const sitemap = new JSDOM(readFileSync(join(ROOT, 'sitemap.xml'), 'utf8'), {contentType: 'text/xml'});
const urls = [...sitemap.window.document.querySelectorAll('loc')].map(n => n.textContent);
const titles = [];

check('sitemap has exactly the canonical public page set', () => {
  eq(urls.length, pages.length);
  eq(new Set(urls).size, pages.length);
  eq([...urls].sort().join('\n'), pages.map(p => SITE+p).sort().join('\n'));
});
check('robots allows search crawlers and points to the canonical sitemap', () => {
  const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
  ok(robots.includes('User-agent: *\nAllow: /'));
  ok(robots.includes(`Sitemap: ${SITE}/sitemap.xml`));
  ok(!/Disallow:\s*\//.test(robots));
});

for (const path of pages) {
  const html = readFileSync(join(ROOT, path.replace(/^\//, ''), 'index.html'), 'utf8');
  const dom = new JSDOM(html, {url: SITE+path});
  const d = dom.window.document;
  titles.push(d.title);
  const meta = name => d.querySelector(`meta[name="${name}"],meta[property="${name}"]`)?.content;
  const schemas = [...d.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));

  check(`${path} canonical, sitemap and social URLs agree`, () => {
    eq(d.querySelectorAll('link[rel="canonical"]').length, 1);
    eq(d.querySelector('link[rel="canonical"]').href, SITE+path);
    eq(meta('og:url'), SITE+path);
    ok(urls.includes(SITE+path));
    ok(!/noindex/i.test(meta('robots') || ''));
  });
  check(`${path} has static descriptive metadata and semantic content`, () => {
    ok(d.title.length > 20 && d.title.length < 90);
    ok(meta('description')?.length > 80);
    eq(meta('og:title'), d.title);
    eq(meta('twitter:title'), d.title);
    eq(meta('og:image'), SITE+'/og.png');
    eq(meta('twitter:image'), SITE+'/og.png');
    eq(d.querySelectorAll('main').length, 1);
    eq(d.querySelectorAll('h1').length, 1);
    eq(d.documentElement.lang, 'en');
    ok(html.slice(0, 1024).includes('<meta charset="UTF-8" />'));
    ok(!meta('viewport')?.includes('maximum-scale'));
  });
  check(`${path} internal content links resolve to local files or anchors`, () => {
    for (const a of d.querySelectorAll('a[href]')) {
      const url = new URL(a.href);
      if (url.origin !== SITE) continue;
      const relative = url.pathname.replace(/^\//, '');
      const local = join(ROOT, relative);
      ok(existsSync(local) || existsSync(join(local, 'index.html')), a.href);
      if (url.hash && url.pathname === path) {
        // #dca is a supported client-side navigation state, not a content fragment.
        if (url.hash !== '#dca') ok(d.getElementById(url.hash.slice(1)), a.href);
      }
    }
  });
  for (const schema of schemas) {
    if (schema['@type'] !== 'FAQPage') continue;
    check(`${path} every structured FAQ has the same readable native HTML answer`, () => {
      eq(schema.url, SITE+path);
      const items = [...d.querySelectorAll('details')];
      eq(items.length, schema.mainEntity.length);
      for (const question of schema.mainEntity) {
        const matching = items.find(item => normalize(item.querySelector('summary').textContent.replace(/\+$/, '')) === normalize(question.name));
        ok(matching, question.name);
        eq(normalize(matching.querySelector('p').textContent), normalize(question.acceptedAnswer.text));
      }
      ok(!html.includes('toggleFaq('), 'FAQ answers must work without custom JavaScript');
      ok(!/max-height:\s*0/.test(html), 'answers must not be permanently CSS-hidden');
    });
  }
  if (path.startsWith('/what-if/')) {
    check(`${path} distinguishes static reference inputs from a live valuation`, () => {
      eq(d.querySelector('#hero-val').textContent, '—');
      ok(d.querySelector('main > p').textContent.includes('BTC'));
      ok(d.querySelector('caption')?.textContent.includes('reference price'));
      ok(d.querySelector('noscript')?.textContent.includes('current valuations are not shown'));
      ok(d.body.textContent.includes('sampled reference estimates'));
      ok(!/maximum regret|generational entry|best accumulation|brutally profitable/.test(d.body.textContent));
      ok(!d.title.includes('$'));
    });
  }
  dom.window.close();
}
check('each canonical page has its own title', () => eq(new Set(titles).size, pages.length));

const index = new JSDOM(readFileSync(join(ROOT, 'index.html'), 'utf8'));
const app = JSON.parse(index.window.document.querySelector('script[type="application/ld+json"]').textContent);
check('application metadata describes actual estimates, not guaranteed real-time data', () => {
  eq(app['@type'], 'WebApplication');
  ok(app.description.includes('hypothetical'));
  ok(app.browserRequirements.includes('JavaScript'));
  ok(!/real-time|exact return/i.test(JSON.stringify(app)));
  eq(app.isAccessibleForFree, true);
  for (const id of ['how-it-works', 'return-formula', 'dca-method', 'price-method']) {
    ok(index.window.document.getElementById(id), id);
  }
});

const require = createRequire(import.meta.url);
const share = require(join(ROOT, 'api/share.js'));
for (const path of ['/s', '/api/share']) {
  const headers = {};
  let body;
  const res = {setHeader(name, value) { headers[name] = value; }, status(code) { eq(code, 200); return this; }, send(value) { body = value; }};
  share({url: path+'?amount=1000&date=2020-01-31&sell=2021-11-10&tax=20&value=5000'}, res);
  const card = new JSDOM(body, {url: SITE+path});
  check(`${path} snapshot previews are excluded from indexing without breaking links`, () => {
    eq(headers['X-Robots-Tag'], 'noindex, follow');
    eq(card.window.document.querySelector('meta[name="robots"]').content, 'noindex, follow');
    eq(card.window.document.querySelector('link[rel="canonical"]').href, SITE+'/');
    const href = card.window.document.querySelector('a').href;
    const url = new URL(href);
    eq(url.searchParams.get('amount'), '1000');
    eq(url.searchParams.get('date'), '2020-01-31');
    eq(url.searchParams.get('sell'), '2021-11-10');
    eq(url.searchParams.get('tax'), '20');
  });
  card.window.close();
}
index.window.close();
sitemap.window.close();
report('SEO/static content');
