// Test suite for the calculator. Run: cd tests && npm install && npm test
import { readFileSync } from 'fs';
import { join } from 'path';
import { check, eq, near, ok, report, loadPage, settle, ROOT, LIVE_PRICE } from './harness.mjs';
import { createRequire as mkRequire } from 'module';

const require = mkRequire(import.meta.url);
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const g = (w, id) => w.document.getElementById(id);
const txt = (w, id) => g(w, id).textContent;
const num = s => parseFloat(String(s).replace(/[^0-9.-]/g, ''));

// ─── 1. Dataset integrity ────────────────────────────────────────────────────
const block = html.match(/const BTC_MONTHLY = \{[\s\S]*?\n\};/)[0];
const MONTHLY = Object.fromEntries([...block.matchAll(/'(\d{4}-\d{2})':(\d+)/g)].map(m => [m[1], +m[2]]));

check('dataset has a sane number of months', () => ok(Object.keys(MONTHLY).length >= 150, 'too few months'));
check('dataset has no gaps', () => {
  const keys = Object.keys(MONTHLY).sort();
  let [y, m] = keys[0].split('-').map(Number);
  const missing = [];
  for (;;) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    if (!MONTHLY[k]) missing.push(k);
    if (k === keys.at(-1)) break;
    if (++m > 12) { m = 1; y++; }
  }
  eq(missing.join(','), '', 'missing months');
});
check('dataset has no non-positive prices', () =>
  eq(Object.entries(MONTHLY).filter(([, v]) => v <= 0).length, 0, 'bad prices'));

// ─── 2. Time Machine ─────────────────────────────────────────────────────────
const tm = async (w, { amount, date, sell = '', tax = '' }) => {
  g(w, 'tm-amount').value = amount;
  g(w, 'tm-date').value = date;
  g(w, 'tm-sell-date').value = sell;
  g(w, 'tm-tax').value = tax;
  await w.tmCalculate();
  return {
    value: num(txt(w, 'tm-current-value')),
    gain: num(txt(w, 'tm-gain')),
    years: num(txt(w, 'tm-years')),
    dd: num(txt(w, 'tm-dd')),
    afterTax: num(txt(w, 'tm-after-tax')),
    taxShown: g(w, 'tm-tax-stat').style.display !== 'none',
    err: txt(w, 'tm-error'),
    label: w.document.querySelector('#tm-result .result-label').textContent,
    url: w.location.search,
  };
};

{
  const w = loadPage();
  await settle();

  const hold = await tm(w, { amount: 1000, date: '2013-04-30' });
  check('holding to today values at the live price', () => {
    // value = (amount / price-then) * live price, price-then interpolated
    const impliedPriceThen = (1000 * LIVE_PRICE) / hold.value;
    near(impliedPriceThen, MONTHLY['2013-04'], MONTHLY['2013-04'] * 0.25, 'implied price then');
    ok(hold.value > 1000, 'should be a gain');
    eq(hold.label, 'Your investment today', 'label');
  });

  const sold = await tm(w, { amount: 1000, date: '2013-04-30', sell: '2021-11-10' });
  check('a sell date ends the result at that date', () => {
    ok(sold.value !== hold.value, 'selling should differ from holding');
    ok(sold.years < hold.years, 'holding period should be shorter');
    eq(sold.label, 'Your investment at sale', 'label switches');
    ok(sold.url.includes('sell=2021-11-10'), 'permalink carries sell date');
  });

  check('drawdown is a negative percentage', () => {
    ok(hold.dd < 0, `expected negative, got ${hold.dd}`);
    ok(hold.dd >= -100, 'cannot exceed -100%');
  });

  const taxed = await tm(w, { amount: 1000, date: '2020-01-15', sell: '2021-11-10', tax: '20' });
  check('capital gains applies to the gain only', () => {
    ok(taxed.taxShown, 'after-tax stat should be visible');
    near(taxed.afterTax, taxed.value - (taxed.value - 1000) * 0.2, 1, 'after-tax value');
  });
  check('no tax input means no after-tax stat', () =>
    ok(!sold.taxShown, 'should be hidden when tax is blank'));
  const bad1 = await tm(w, { amount: 1000, date: '2021-01-01', sell: '2020-01-01' });
  check('rejects a sell date before the purchase', () => ok(/after the purchase/.test(bad1.err), bad1.err));
  const bad2 = await tm(w, { amount: 1000, date: '2020-01-01', sell: '2035-01-01' });
  check('rejects a sell date in the future', () => ok(/in the past/.test(bad2.err), bad2.err));
}

// ─── 3. DCA ──────────────────────────────────────────────────────────────────
{
  const w = loadPage();
  await settle();
  const dca = async (amount, start, freq) => {
    g(w, 'dca-amount').value = amount;
    g(w, 'dca-start').value = start;
    g(w, 'dca-freq').value = freq;
    await w.dcaCalculate();
    return {
      invested: num(txt(w, 'dca-total-invested')),
      value: num(txt(w, 'dca-total-value')),
      pctClass: g(w, 'dca-pct').className,
      rows: [...w.document.querySelectorAll('#dca-compare-rows .cmp-row')].map(r => r.textContent),
      note: txt(w, 'dca-compare-note'),
      url: w.location.search,
    };
  };

  const bull = await dca(100, '2015-01-01', 'monthly');
  check('DCA accumulates the expected contributions', () => {
    ok(bull.invested > 0, 'invested');
    ok(bull.value > bull.invested, 'a 2015 start should be up');
  });
  check('DCA compares against a lump sum', () => {
    eq(bull.rows.length, 2, 'two comparison rows');
    ok(/Dollar-cost/.test(bull.rows[0]), 'first row is DCA');
    ok(/Lump sum/.test(bull.rows[1]), 'second row is lump sum');
    ok(bull.note.length > 0, 'explanatory note present');
  });
  check('DCA permalink carries its inputs', () => {
    ok(bull.url.includes('tab=dca'), 'tab');
    ok(bull.url.includes('freq=monthly'), 'freq');
  });
}

// ─── 4. Permalinks ───────────────────────────────────────────────────────────
{
  const w = loadPage({ url: 'https://x.test/?amount=5000&date=2017-01-20&sell=2021-11-10&tax=15' });
  await settle();
  check('a shared link restores every input', () => {
    eq(g(w, 'tm-amount').value, '5000', 'amount');
    eq(g(w, 'tm-date').value, '2017-01-20', 'date');
    eq(g(w, 'tm-sell-date').value, '2021-11-10', 'sell');
    eq(g(w, 'tm-tax').value, '15', 'tax');
  });
  check('a shared link auto-calculates', () => ok(num(txt(w, 'tm-current-value')) > 0, 'no result rendered'));
}
{
  const w = loadPage({ url: 'https://x.test/?amount=abc&date=not-a-date' });
  await settle();
  check('junk parameters do not surface an error', () => eq(txt(w, 'tm-error'), '', 'error shown'));
}

// ─── 5. Daily prices and optional series ─────────────────────────────────────
{
  const plain = loadPage();
  await settle();
  check('features needing data stay hidden without it', () => {
    eq(g(plain, 'tm-compare').style.display, 'none', 'comparison table');
    eq(g(plain, 'tm-real-stat').style.display, 'none', 'real-value stat');
  });

  const withData = loadPage({
    daily: { '2017-01-20': 111111 },
    series: { cpi: { '2017-01': 243.6, '2026-09': 330 }, sp500: { '2017-01': 2278.9, '2026-09': 6150 }, savings_apy: 4 },
  });
  await settle();
  g(withData, 'tm-amount').value = 1000;
  g(withData, 'tm-date').value = '2017-01-20';
  await withData.tmCalculate();
  await settle(200);
  check('an exact daily price overrides the monthly interpolation', () =>
    near(num(txt(withData, 'tm-price-then')), 111111, 1, 'price then'));
  check('benchmarks appear once the series exists', () => {
    ok(g(withData, 'tm-compare').style.display !== 'none', 'comparison hidden');
    const rows = [...withData.document.querySelectorAll('#tm-compare-rows .cmp-row')];
    ok(rows.length >= 3, `expected Bitcoin + benchmarks, got ${rows.length}`);
    ok(/Bitcoin/.test(rows[0].textContent), 'Bitcoin first');
  });
  check('inflation adjustment appears once CPI exists', () =>
    ok(g(withData, 'tm-real-stat').style.display !== 'none', 'real stat hidden'));
}

// ─── 6. Share endpoint ───────────────────────────────────────────────────────
{
  const share = require(join(ROOT, 'api', 'share.js'));
  const call = qs => new Promise(res => {
    let body = '';
    const r = { setHeader() {}, status() { return r; }, send(b) { body = b; res(body); } };
    share({ url: `/api/share?${qs}` }, r);
  });

  const card = await call('amount=1000&date=2013-04-30&value=671341');
  check('share card names the actual numbers', () => {
    ok(/\$1,000/.test(card), 'amount missing');
    ok(/\$671,341/.test(card), 'value missing');
    ok(/April 2013/.test(card), 'date missing');
  });
  check('share card redirects same-origin', () => {
    const dest = card.match(/location\.replace\("([^"]*)"\)/)[1];
    ok(dest.startsWith('/?'), `expected relative path, got ${dest}`);
  });

  const dcaCard = await call('tab=dca&amount=100&date=2015-01-01&freq=monthly&value=679305&inv=14300');
  check('DCA multiple uses total invested, not the per-period amount', () => {
    ok(/48×/.test(dcaCard), 'expected ~48x (679305/14300), got something else');
    ok(!/6,?79\d×|7K×/.test(dcaCard), 'divided by the per-period amount');
  });
  check('DCA redirect keeps the frequency', () => ok(/freq=monthly/.test(dcaCard), 'freq dropped'));

  for (const attack of [
    'amount=1000"><script>alert(1)</script>&value=5',
    'date=</title><script>alert(2)</script>&amount=1&value=2',
    'amount=1&value=2&date=2013-01-01"onload="alert(3)',
  ]) {
    const body = await call(attack);
    check(`injection neutralised: ${attack.slice(0, 34)}`, () => {
      const stripped = body.replace(/<script>location\.replace\([^<]*<\/script>/, '');
      ok(!/<script>alert|onload=|javascript:/i.test(stripped), 'unescaped content reached the HTML');
    });
  }
  // escapeHtml is defence in depth behind input validation, so it needs direct
  // coverage — a regression in it would not show up through the endpoint.
  const { escapeHtml } = share;
  check('escapeHtml neutralises every HTML metacharacter', () => {
    eq(escapeHtml('<script>'), '&lt;script&gt;', 'angle brackets');
    eq(escapeHtml('a"b'), 'a&quot;b', 'double quote');
    eq(escapeHtml("a'b"), 'a&#39;b', 'single quote');
    eq(escapeHtml('a&b'), 'a&amp;b', 'ampersand');
    eq(escapeHtml('"><img onerror=x>'), '&quot;&gt;&lt;img onerror=x&gt;', 'combined');
  });
  check('escapeHtml leaves safe text untouched', () =>
    eq(escapeHtml('$1,000 in April 2013'), '$1,000 in April 2013', 'plain text'));

  const invalid = await call('date=9999-99-99&amount=1000&value=5000');
  check('impossible dates do not render "Invalid Date"', () => ok(!/Invalid Date/.test(invalid), 'leaked'));
}

report('calculator');
