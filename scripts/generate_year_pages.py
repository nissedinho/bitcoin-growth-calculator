#!/usr/bin/env python3
"""Generate /what-if/<year>/ SEO landing pages for bitcoingrowthcalculator.com.

Run from repo root:  python3 scripts/generate_year_pages.py
Regenerate after historical data changes. Current valuations are loaded from
/api/price; no current prices are baked into metadata or visible results.

Sitemap maintenance: this generator deliberately leaves sitemap.xml unchanged.
After reviewing a material page-content change, update lastmod only for affected
URLs to the actual content-change date. Do not stamp the build/regeneration date
on unchanged pages or update dates for transient live-price responses.
"""
import os, json, re, calendar, datetime
from html import escape
from pathlib import Path

# Read the same monthly reference estimates as the main calculator. Legacy
# monthly anchors are month-end estimates, not exact daily trade prices.
ROOT = Path(__file__).resolve().parent.parent
INDEX = (ROOT / 'index.html').read_text()
MONTHLY = {key: int(value) for key, value in re.findall(
    r"'(\d{4}-\d{2})':(\d+)", re.search(r"const BTC_MONTHLY = \{.*?\n\};", INDEX, re.S).group(0))}
DATE_MATCH = re.search(r"const BTC_MONTHLY_DATES = (\{[^;]*\});", INDEX)
MONTHLY_DATES = json.loads(DATE_MATCH.group(1)) if DATE_MATCH else {}
JAN_PRICE = {year: MONTHLY[f"{year}-{'04' if year == 2013 else '01'}"] for year in range(2013, 2026)}

def reference_summary(year: int) -> str:
    """Describe only the saved reference inputs, not an unsourced market story."""
    points = {key: value for key, value in MONTHLY.items() if key.startswith(f"{year}-")}
    low = min(points, key=points.get)
    high = max(points, key=points.get)
    def label(key):
        y, month = map(int, key.split('-'))
        day = datetime.date.fromisoformat(MONTHLY_DATES.get(
            key, f"{key}-{calendar.monthrange(y, month)[1]:02d}"))
        return f"{calendar.month_name[day.month]} {day.day}, {day.year}"
    return (f"The calculator's {len(points)} saved monthly reference prices for {year} range from "
            f"{fmt_usd(points[low])} ({label(low)}) to {fmt_usd(points[high])} ({label(high)}). "
            "These are sampled reference estimates, not the year's exact daily low and high. "
            "Changing the purchase or valuation date changes the result; neither a lump sum nor DCA guarantees a profit.")

def fmt_mult(m: float) -> str:
    """Render a return multiple. Mirrors fmtMult() in the page script below."""
    if m >= 1000: return f"{round(m/1000):,}K"
    if m >= 10:   return f"{round(m):,}"
    return f"{m:.2f}".rstrip("0").rstrip(".")

def fmt_usd(n: float) -> str:
    if n >= 1e9: return f"${n/1e9:.2f}B"
    if n >= 1e6: return f"${n/1e6:.2f}M"
    return "${:,.0f}".format(n)

def page(year: int) -> str:
    p_then = JAN_PRICE[year]
    month_label = "April" if year == 2013 else "January"
    month = 4 if year == 2013 else 1
    reference_date = MONTHLY_DATES.get(f"{year}-{month:02d}", f"{year}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}")
    reference_day = datetime.date.fromisoformat(reference_date)
    reference_label = f"{month_label} {reference_day.day}, {year}"
    rows = [100, 1000, 10000]
    per_dollar = 1 / p_then  # × live price = the current multiple
    title = f"What If You Bought Bitcoin in {year}? Historical Return Calculator"
    desc = (f"Estimate returns on a Bitcoin investment in {year} using a dated monthly reference "
            "and the latest available BTC quote. See the assumptions and try your own dates.")
    other_years = " ".join(
        f'<a href="/what-if/{y}/">{y}</a>' for y in sorted(JAN_PRICE) if y != year
    )
    table_rows = "\n".join(
        f'<tr><td>{fmt_usd(a)}</td><td class="then">{a/p_then:.6f} BTC</td>'
        f'<td class="now" data-btc="{a/p_then:.12f}">—</td></tr>'
        for a in rows
    )
    faq = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "@id": f"https://www.bitcoingrowthcalculator.com/what-if/{year}/#questions",
        "url": f"https://www.bitcoingrowthcalculator.com/what-if/{year}/",
        "inLanguage": "en",
        "mainEntity": [
            {"@type": "Question",
             "name": f"How much would $1,000 of Bitcoin bought in {year} be worth today?",
             "acceptedAnswer": {"@type": "Answer",
              "text": f"Using the {reference_label} monthly reference estimate of {fmt_usd(p_then)}, $1,000 buys approximately {1000/p_then:.6f} BTC before fees. Multiply that Bitcoin amount by the latest available quote to estimate its value. Quotes may be cached or unavailable; no current valuation is shown until a quote loads."}},
            {"@type": "Question",
             "name": f"What was the price of Bitcoin in {year}?",
             "acceptedAnswer": {"@type": "Answer",
              "text": f"This example uses a monthly reference estimate of {fmt_usd(p_then)} dated {reference_label}. Prices varied throughout the year; this is not an exact execution price."}},
            {"@type": "Question",
             "name": "Does this calculation include fees or predict future returns?",
             "acceptedAnswer": {"@type": "Answer",
              "text": "This example excludes fees, slippage and tax. It is a hypothetical historical calculation, not a forecast or a recommendation to buy. Past performance does not guarantee future results. Use the main calculator to choose another purchase date or a historical sale date."}},
        ],
    }
    faq_json = json.dumps(faq, ensure_ascii=False)
    faq_html = "\n".join(
        f'<details><summary>{escape(question["name"])}</summary>'
        f'<p>{escape(question["acceptedAnswer"]["text"])}</p></details>'
        for question in faq["mainEntity"]
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<script async src="https://www.googletagmanager.com/gtag/js?id=G-T29BL3EPHL"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  function analyticsPageUrl(value) {{ try {{ const u=new URL(value); return u.origin+u.pathname; }} catch(_) {{ return ''; }} }}
  gtag('set','page_location',analyticsPageUrl(location.href));
  gtag('set','page_referrer',analyticsPageUrl(document.referrer));
  gtag('config','G-T29BL3EPHL',{{page_location:analyticsPageUrl(location.href),page_referrer:analyticsPageUrl(document.referrer)}});
</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title}</title>
<meta name="description" content="{desc}" />
<link rel="canonical" href="https://www.bitcoingrowthcalculator.com/what-if/{year}/" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:type" content="website" />
<meta property="og:title" content="{title}" />
<meta property="og:description" content="{desc}" />
<meta property="og:url" content="https://www.bitcoingrowthcalculator.com/what-if/{year}/" />
<meta property="og:image" content="https://www.bitcoingrowthcalculator.com/og.png" />
<meta property="og:site_name" content="Bitcoin Growth Calculator" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{title}" />
<meta name="twitter:description" content="{desc}" />
<meta name="twitter:image" content="https://www.bitcoingrowthcalculator.com/og.png" />
<script type="application/ld+json">{faq_json}</script>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@300;400;500;600&display=swap" rel="stylesheet" />
<style>
:root {{ --orange:#f7931a; --orange-dim:rgba(247,147,26,0.08); --black:#080808; --surface:#0f0f0f; --surface2:#161616; --border:rgba(247,147,26,0.18); --border-subtle:rgba(255,255,255,0.06); --text:#e8e0d4; --text-muted:#6b6257; --green:#22c55e; --red:#ef4444; }}
*,*::before,*::after {{ box-sizing:border-box; margin:0; padding:0; }}
body {{ background:var(--black); color:var(--text); font-family:'Space Grotesk',sans-serif; line-height:1.7; }}
.container {{ max-width:720px; margin:0 auto; padding:48px 20px 80px; }}
.crumb {{ font-family:'DM Mono',monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; margin-bottom:24px; }}
.crumb a {{ color:var(--orange); text-decoration:none; }}
h1 {{ font-family:'Bebas Neue',sans-serif; font-size:clamp(38px,8vw,64px); line-height:1; letter-spacing:0.02em; margin-bottom:18px; }}
h1 em {{ color:var(--orange); font-style:normal; }}
h2 {{ font-family:'Bebas Neue',sans-serif; font-size:28px; letter-spacing:0.03em; margin:36px 0 12px; color:var(--orange); }}
p {{ color:var(--text-muted); font-size:15px; margin-bottom:14px; }}
p strong {{ color:var(--text); }}
.hero-stat {{ background:var(--surface); border:1px solid var(--border); border-radius:2px; padding:26px; margin:26px 0; text-align:center; }}
.hero-stat .label {{ font-family:'DM Mono',monospace; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--text-muted); }}
.hero-stat .big {{ font-family:'Bebas Neue',sans-serif; font-size:clamp(44px,10vw,72px); color:var(--text); line-height:1.1; }}
.hero-stat .sub {{ font-family:'DM Mono',monospace; font-size:12px; color:var(--text-muted); }}
table {{ width:100%; border-collapse:collapse; margin:18px 0 8px; font-family:'DM Mono',monospace; font-size:13px; }}
th,td {{ padding:12px 10px; text-align:right; border-bottom:1px solid var(--border-subtle); }}
th:first-child,td:first-child {{ text-align:left; }}
th {{ font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:var(--text-muted); }}
td.now {{ color:var(--text); font-weight:500; }}
td.then {{ color:var(--orange); }}
.note {{ font-family:'DM Mono',monospace; font-size:11px; color:var(--text-muted); }}
.cta {{ display:block; text-align:center; background:var(--orange); color:var(--black); font-family:'Bebas Neue',sans-serif; font-size:22px; letter-spacing:0.08em; padding:17px; border-radius:2px; text-decoration:none; margin:28px 0 10px; }}
.cta.secondary {{ background:var(--surface2); color:var(--orange); border:1px solid var(--border); }}
.affiliate {{ background:var(--surface2); border:1px solid var(--border-subtle); border-radius:2px; padding:18px 22px; margin:28px 0; }}
.affiliate strong {{ color:var(--text); display:block; margin-bottom:4px; }}
.affiliate a {{ color:var(--orange); text-decoration:none; font-weight:500; }}
.years {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--border-subtle); font-family:'DM Mono',monospace; font-size:12px; line-height:2.2; }}
.years a {{ color:var(--orange); text-decoration:none; margin-right:12px; }}
details {{ border-top:1px solid var(--border-subtle); padding:14px 0; }}
summary {{ color:var(--text); font-weight:500; cursor:pointer; }}
details p {{ margin:10px 0 0; }}
summary:focus-visible {{ outline:2px solid var(--orange); outline-offset:4px; }}
.note a {{ color:var(--orange); }}
footer {{ margin-top:40px; font-family:'DM Mono',monospace; font-size:11px; color:var(--text-muted); }}
</style>
</head>
<body>
<main class="container">
<div class="crumb"><a href="/">₿ Bitcoin Growth Calculator</a> / What if · {year}</div>
<h1>WHAT IF YOU BOUGHT <em>BITCOIN</em> IN {year}?</h1>
<p>Using the <strong>{reference_label}</strong> monthly reference estimate of <strong>{fmt_usd(p_then)}</strong> per Bitcoin, a $1,000 investment would buy approximately <strong>{1000/p_then:.6f} BTC</strong> before fees. This is a dated price estimate, not an exact trade price.</p>
<p>Value multiple at the latest available quote: <strong data-mult="{per_dollar:.12f}" data-mult-suffix=" times">—</strong>. Quote used: <strong class="live-price">loading…</strong>. A value multiple below 1 means a loss.</p>
<div class="hero-stat">
  <div class="label">$1,000 on {reference_label}: estimated value</div>
  <div class="big" id="hero-val" data-btc="{1000/p_then:.12f}">—</div>
  <div class="sub"><span data-mult="{per_dollar:.12f}" data-mult-suffix="×">—</span> your money · BTC reference: {fmt_usd(p_then)}</div>
</div>
<h2>The numbers</h2>
<table>
  <caption>Hypothetical purchases at the {reference_label} reference price</caption>
  <tr><th scope="col">If you invested</th><th scope="col">You'd have bought</th><th scope="col">Value at current quote</th></tr>
{table_rows}
</table>
<p class="note">Historical input: a monthly reference estimate anchored to {reference_label}, matching the main calculator. It is not an exact daily trade price. Excludes fees, slippage and tax.</p>
<p class="note" id="quote-status" role="status">Loading the current CoinGecko quote…</p>
<noscript><p class="note">JavaScript is required to load the latest quote. The dated reference price, Bitcoin amounts and calculation method remain available here; current valuations are not shown.</p></noscript>
<h2>Historical reference prices in {year}</h2>
<p>{reference_summary(year)}</p>
<p class="note">Daily observations come from CoinGecko where available. Older monthly inputs are built-in reference estimates. Read the <a href="/#price-method">price methods and limitations</a> or inspect the <a href="/data/btc_daily.json">saved daily observations</a>.</p>
<a class="cta" href="/?amount=1000&amp;date={reference_date}" onclick="gtag('event','calculator_open',{{calculator:'time_machine',placement:'year_page'}})">TRY YOUR OWN DATE & AMOUNT →</a>
<a class="cta secondary" href="/?tab=dca&amp;amount=100&amp;start={reference_date}&amp;freq=monthly#dca" onclick="gtag('event','calculator_open',{{calculator:'dca',placement:'year_page'}})">SEE WHAT A MONTHLY DCA WOULD HAVE DONE →</a>
<!-- Commercial promotions disabled until an approved partner and terms are verified. -->
<section id="questions" aria-labelledby="questions-title">
<h2 id="questions-title">Questions about this {year} example</h2>
{faq_html}
</section>
<div class="years"><strong style="color:var(--text)">Other years:</strong><br>{other_years}</div>
<footer>
  <p>Not financial advice · Past performance does not guarantee future results</p>
  <p><a href="/" style="color:var(--orange);text-decoration:none;">bitcoingrowthcalculator.com</a> · <a href="/faq" style="color:var(--orange);text-decoration:none;">FAQ</a> · <a href="/#data-use" style="color:var(--orange);text-decoration:none;">Data &amp; email</a></p>
</footer>
</main>
<script>
// Refresh headline numbers with the live BTC price
const P_THEN = {p_then};
fetch('/api/price').then(r=>{{if(!r.ok) throw new Error('Unavailable'); return r.json();}}).then(d=>{{
  if(!Number.isFinite(d.price)||d.price<=0) throw new Error('Invalid quote');
  const asOf=d.asOf && Number.isFinite(Date.parse(d.asOf)) ? d.asOf : new Date().toISOString();
  document.getElementById('quote-status').textContent='CoinGecko quote as of '+asOf.replace('T',' ').replace('Z',' UTC')+'. Retrieved on page load; may be cached for up to 11 minutes.';
  const f=n=>n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':'$'+Math.round(n).toLocaleString('en-US');
  const fmtMult=m=>m>=1000?Math.round(m/1000).toLocaleString('en-US')+'K':m>=10?Math.round(m).toLocaleString('en-US'):m.toFixed(2).replace(/\\.?0+$/,'');
  document.querySelectorAll('.live-price').forEach(el=>el.textContent=f(d.price));
  document.querySelectorAll('[data-btc]').forEach(el=>{{ el.textContent=f(parseFloat(el.dataset.btc)*d.price); }});
  // Keep the multiple and the up/down colour in step with the live price,
  // otherwise the page shows a fresh dollar figure beside a stale "659×".
  document.querySelectorAll('[data-mult]').forEach(el=>{{
    el.textContent=fmtMult(parseFloat(el.dataset.mult)*d.price)+(el.dataset.multSuffix||'');
  }});
  const col = d.price >= P_THEN ? 'var(--green)' : 'var(--red)';
  const hero = document.getElementById('hero-val');
  if(hero) hero.style.color = col;
  document.querySelectorAll('td.now').forEach(el=>el.style.color=col);
}}).catch(()=>{{
  document.querySelectorAll('.live-price').forEach(el=>el.textContent='unavailable');
  document.getElementById('quote-status').textContent='Current quote unavailable. No current valuation is shown; reload to retry.';
}});
</script>
</body>
</html>
"""

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for year in JAN_PRICE:
        d = os.path.join(root, "what-if", str(year))
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w") as f:
            f.write(page(year))
        print(f"wrote what-if/{year}/index.html")

if __name__ == "__main__":
    main()
