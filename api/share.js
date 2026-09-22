// Share endpoint: returns a small HTML page whose OpenGraph tags describe the
// specific result, then sends real visitors on to the calculator.
//
// index.html is static, so query params can't change its meta tags — a crawler
// scraping a shared link would otherwise always see the generic card. This gives
// each shared result its own title, description and image.

const SITE = 'https://www.bitcoingrowthcalculator.com';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function usd(n) {
  if (!isFinite(n)) return '$0';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// Everything below is derived from numbers we parse ourselves, never from raw
// user text, so nothing attacker-controlled reaches the HTML unescaped.
function clampNum(raw, min, max, fallback) {
  const n = Number(raw);
  return isFinite(n) && n >= min && n <= max ? n : fallback;
}

function cleanDate(raw) {
  const v = String(raw || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  // Well-formed but impossible dates (9999-99-99) would otherwise render as
  // "Invalid Date" in the link preview.
  const d = new Date(v + 'T12:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return '';
  return v;
}

module.exports = (req, res) => {
  const q = new URL(req.url, SITE).searchParams;

  const amount = clampNum(q.get('amount'), 0, 1e12, 1000);
  const value = clampNum(q.get('value'), 0, 1e15, 0);
  const date = cleanDate(q.get('date'));
  const sell = cleanDate(q.get('sell'));
  const tab = q.get('tab') === 'dca' ? 'dca' : 'tm';
  const freq = ['daily', 'weekly', 'monthly'].includes(q.get('freq')) ? q.get('freq') : '';
  // For DCA, `amount` is the per-period contribution, so the multiple has to be
  // taken against the total actually invested.
  const invested = clampNum(q.get('inv'), 0, 1e12, 0) || amount;

  const when = date
    ? new Date(date + 'T12:00:00Z').toLocaleDateString('en-US',
        { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '';
  const mult = invested > 0 ? value / invested : 0;
  const multTxt = mult >= 1000 ? `${Math.round(mult / 1000)}K×`
    : mult >= 10 ? `${Math.round(mult)}×`
    : `${mult.toFixed(2).replace(/\.?0+$/, '')}×`;

  const title = tab === 'dca'
    ? `Investing ${usd(amount)} at a time in Bitcoin${when ? ` since ${when}` : ''} → ${usd(value)}`
    : `${usd(amount)} of Bitcoin${when ? ` in ${when}` : ''} would be ${usd(value)}${sell ? ' at sale' : ' today'}`;
  const description = value > 0
    ? `That's ${multTxt} your money. Run your own dates and amounts on the free Bitcoin calculator.`
    : 'See what your money would be worth if you had bought Bitcoin. Free calculator with live prices, DCA and historical comparisons.';

  // Rebuild the destination from validated values only.
  const target = new URLSearchParams();
  if (tab === 'dca') target.set('tab', 'dca');
  target.set('amount', String(amount));
  if (date) target.set(tab === 'dca' ? 'start' : 'date', date);
  if (freq && tab === 'dca') target.set('freq', freq);
  if (sell) target.set('sell', sell);
  const dest = `/?${target.toString()}`;

  const img = new URLSearchParams({ amount: String(amount), value: String(Math.round(value)) });
  if (date) img.set('date', date);
  if (sell) img.set('sell', sell);
  const imageUrl = `${SITE}/api/og?${img.toString()}`;

  const t = escapeHtml(title), d = escapeHtml(description);
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${SITE}${escapeHtml(dest)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
<meta property="og:url" content="${SITE}${escapeHtml(dest)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(dest)}" />
</head>
<body>
<p><a href="${escapeHtml(dest)}">${t}</a></p>
<script>location.replace(${JSON.stringify(dest)});</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(body);
};
