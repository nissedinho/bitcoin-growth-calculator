#!/usr/bin/env python3
"""Generate /what-if/<year>/ SEO landing pages for bitcoingrowthcalculator.com.

Run from repo root:  python3 scripts/generate_year_pages.py
Regenerate whenever BTC_PRICE_NOW or the January prices change materially.
Pages self-update their headline numbers from /api/price on load, so the
baked-in numbers only need to be roughly right.
"""
import os, json

# January price for each year (early-January BTC/USD, from site dataset)
JAN_PRICE = {
    2013: 130,     # dataset starts Apr 2013; using April for 2013
    2014: 808,
    2015: 217,
    2016: 370,
    2017: 963,
    2018: 10163,
    2019: 3457,
    2020: 9350,
    2021: 33141,
    2022: 38466,
    2023: 23130,
    2024: 42514,
    2025: 102405,
}

PRICE_NOW = 86603  # keep in sync with the last BTC_MONTHLY entry in index.html;
                   # pages overwrite this with the live price from /api/price on load
AFFILIATE_URL = "https://coinbase.com"  # replace with your Coinbase referral link and re-run

NARRATIVE = {
    2013: "Bitcoin entered 2013 trading in the low hundreds and had its first true mania: it crossed $1,000 for the first time in November before crashing hard. Almost nobody you know bought it. This is the year of maximum regret.",
    2014: "The Mt. Gox collapse defined 2014 — the largest Bitcoin exchange imploded and price bled all year. Buying into that fear was brutally hard, and brutally profitable.",
    2015: "The depths of the first great bear market. Bitcoin spent 2015 flat and forgotten in the low hundreds while the media wrote its obituary. It was the single best accumulation window in its history.",
    2016: "The quiet year before the storm. The second halving happened in July 2016, and price ground steadily upward while nobody paid attention.",
    2017: "The year Bitcoin went mainstream: from under $1,000 in January to nearly $20,000 by December. Your coworkers started asking about it at lunch. Buying in January — not December — made all the difference.",
    2018: "The hangover. Bitcoin fell roughly 80% from its 2017 peak, and 'crypto is dead' articles ran weekly. A January 2018 buy was the worst-timed entry in years — and it still recovered.",
    2019: "The rebuilding year. Bitcoin tripled off the bear-market bottom in spring 2019 while mainstream attention was elsewhere.",
    2020: "COVID crashed Bitcoin to ~$4,000 in March 2020 — then unprecedented money-printing sent it on the greatest run of its life, closing the year near $29,000. MicroStrategy and PayPal bought in.",
    2021: "The institutional year: Tesla bought $1.5B, Coinbase IPO'd, El Salvador made it legal tender, and price hit ~$69,000 in November before rolling over.",
    2022: "The washout: Luna, Celsius, and FTX all collapsed, and Bitcoin bottomed near $15,500. Peak fear — and in hindsight, another generational entry.",
    2023: "The quiet recovery. Bitcoin more than doubled off the FTX lows while most people were still too burned to look. Spot-ETF anticipation built all year.",
    2024: "The ETF year: US spot Bitcoin ETFs launched in January, the fourth halving hit in April, and price broke six figures for the first time in December.",
    2025: "Bitcoin peaked above $115,000 in mid-2025 before sliding into the 2026 drawdown. A January 2025 buy is underwater at today's prices — a live lesson in why timing single entries is hard (and why people DCA).",
}

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
    mult = PRICE_NOW / p_then
    rows = [(100, 100*mult), (1000, 1000*mult), (10000, 10000*mult)]
    v1k = fmt_usd(1000*mult)
    mult_num = fmt_mult(mult)
    mult_txt = mult_num + "×"
    per_dollar = 1 / p_then  # × live price = the current multiple
    up = mult >= 1
    gain_word = "grown to" if up else "fallen to"
    title = f"What If You Bought Bitcoin in {year}? $1,000 Then = {v1k} Today"
    desc = (f"$1,000 of Bitcoin bought in {month_label} {year} (BTC at {fmt_usd(p_then)}) "
            f"would be worth {v1k} today — a {mult_txt} return. See the exact numbers and run your own dates.")
    other_years = " ".join(
        f'<a href="/what-if/{y}/">{y}</a>' for y in sorted(JAN_PRICE) if y != year
    )
    table_rows = "\n".join(
        f'<tr><td>{fmt_usd(a)}</td><td class="then">{a/p_then:.6f} BTC</td>'
        f'<td class="now" data-btc="{a/p_then:.8f}">{fmt_usd(v)}</td></tr>'
        for a, v in rows
    )
    faq_json = json.dumps({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question",
             "name": f"How much would $1,000 of Bitcoin bought in {year} be worth today?",
             "acceptedAnswer": {"@type": "Answer",
              "text": f"$1,000 invested in Bitcoin in {month_label} {year}, when BTC traded around {fmt_usd(p_then)}, would have {gain_word} approximately {v1k} at today's price — a {mult_txt} return."}},
            {"@type": "Question",
             "name": f"What was the price of Bitcoin in {year}?",
             "acceptedAnswer": {"@type": "Answer",
              "text": f"In {month_label} {year}, Bitcoin traded at approximately {fmt_usd(p_then)}."}},
            {"@type": "Question",
             "name": "Is it too late to buy Bitcoin?",
             "acceptedAnswer": {"@type": "Answer",
              "text": "Nobody can predict future returns and past performance is no guarantee. Most long-term holders use dollar-cost averaging (DCA) — buying a fixed amount on a schedule — rather than trying to time a single entry. Our DCA calculator shows how that has performed historically."}},
        ],
    }, ensure_ascii=False)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-T29BL3EPHL"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', 'G-T29BL3EPHL');
</script>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title}</title>
<meta name="description" content="{desc}" />
<link rel="canonical" href="https://www.bitcoingrowthcalculator.com/what-if/{year}/" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:type" content="article" />
<meta property="og:title" content="{title}" />
<meta property="og:description" content="{desc}" />
<meta property="og:url" content="https://www.bitcoingrowthcalculator.com/what-if/{year}/" />
<meta property="og:image" content="https://www.bitcoingrowthcalculator.com/og.png" />
<meta name="twitter:card" content="summary_large_image" />
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
.hero-stat .big {{ font-family:'Bebas Neue',sans-serif; font-size:clamp(44px,10vw,72px); color:{'var(--green)' if up else 'var(--red)'}; line-height:1.1; }}
.hero-stat .sub {{ font-family:'DM Mono',monospace; font-size:12px; color:var(--text-muted); }}
table {{ width:100%; border-collapse:collapse; margin:18px 0 8px; font-family:'DM Mono',monospace; font-size:13px; }}
th,td {{ padding:12px 10px; text-align:right; border-bottom:1px solid var(--border-subtle); }}
th:first-child,td:first-child {{ text-align:left; }}
th {{ font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:var(--text-muted); }}
td.now {{ color:{'var(--green)' if up else 'var(--red)'}; font-weight:500; }}
td.then {{ color:var(--orange); }}
.note {{ font-family:'DM Mono',monospace; font-size:11px; color:var(--text-muted); }}
.cta {{ display:block; text-align:center; background:var(--orange); color:var(--black); font-family:'Bebas Neue',sans-serif; font-size:22px; letter-spacing:0.08em; padding:17px; border-radius:2px; text-decoration:none; margin:28px 0 10px; }}
.cta.secondary {{ background:var(--surface2); color:var(--orange); border:1px solid var(--border); }}
.affiliate {{ background:var(--surface2); border:1px solid var(--border-subtle); border-radius:2px; padding:18px 22px; margin:28px 0; }}
.affiliate strong {{ color:var(--text); display:block; margin-bottom:4px; }}
.affiliate a {{ color:var(--orange); text-decoration:none; font-weight:500; }}
.years {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--border-subtle); font-family:'DM Mono',monospace; font-size:12px; line-height:2.2; }}
.years a {{ color:var(--orange); text-decoration:none; margin-right:12px; }}
footer {{ margin-top:40px; font-family:'DM Mono',monospace; font-size:11px; color:var(--text-muted); }}
</style>
</head>
<body>
<div class="container">
<div class="crumb"><a href="/">₿ Bitcoin Growth Calculator</a> / What if · {year}</div>
<h1>WHAT IF YOU BOUGHT <em>BITCOIN</em> IN {year}?</h1>
<p>In {month_label} {year}, one Bitcoin cost about <strong>{fmt_usd(p_then)}</strong>. At today's price of <strong class="live-price">{fmt_usd(PRICE_NOW)}</strong>, every dollar invested back then is worth <strong data-mult="{per_dollar:.10f}" data-mult-suffix=" times">{mult_num} times</strong> what you paid.</p>
<div class="hero-stat">
  <div class="label">$1,000 in {month_label} {year} would be worth</div>
  <div class="big" id="hero-val" data-btc="{1000/p_then:.8f}">{v1k}</div>
  <div class="sub"><span data-mult="{per_dollar:.10f}" data-mult-suffix="×">{mult_txt}</span> your money · BTC was {fmt_usd(p_then)} then</div>
</div>
<h2>The numbers</h2>
<table>
  <tr><th>If you invested</th><th>You'd have bought</th><th>Worth today</th></tr>
{table_rows}
</table>
<p class="note">Based on a {month_label} {year} price of {fmt_usd(p_then)} and a live BTC price (updated on page load). Excludes fees.</p>
<h2>What happened in {year}</h2>
<p>{NARRATIVE[year]}</p>
<a class="cta" href="/?utm_source=whatif&utm_medium=internal&utm_campaign={year}">TRY YOUR OWN DATE & AMOUNT →</a>
<a class="cta secondary" href="/#dca">SEE WHAT A MONTHLY DCA WOULD HAVE DONE →</a>
<div class="affiliate">
  <strong>Want in before the next one?</strong>
  Nobody can promise one — but if you want to own Bitcoin, <a href="{AFFILIATE_URL}" rel="noopener sponsored" target="_blank" onclick="try{{gtag('event','affiliate_click',{{placement:'whatif_{year}'}})}}catch(e){{}}">Coinbase</a> is the easiest place for most people to start, with automatic recurring buys.
</div>
<div class="years"><strong style="color:var(--text)">Other years:</strong><br>{other_years}</div>
<footer>
  <p>Not financial advice · Past performance does not guarantee future results</p>
  <p><a href="/" style="color:var(--orange);text-decoration:none;">bitcoingrowthcalculator.com</a> · <a href="/faq" style="color:var(--orange);text-decoration:none;">FAQ</a></p>
</footer>
</div>
<script>
// Refresh headline numbers with the live BTC price
const P_THEN = {p_then};
fetch('/api/price').then(r=>r.json()).then(d=>{{
  if(!d.price) return;
  const f=n=>n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':'$'+Math.round(n).toLocaleString('en-US');
  const fmtMult=m=>m>=1000?Math.round(m/1000).toLocaleString('en-US')+'K':m>=10?Math.round(m).toLocaleString('en-US'):m.toFixed(2).replace(/\.?0+$/,'');
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
}}).catch(()=>{{}});
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
