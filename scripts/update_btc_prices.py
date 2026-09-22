#!/usr/bin/env python3
"""Refresh the Bitcoin price data the site runs on.

Run from the repo root:  python3 scripts/update_btc_prices.py

Writes two things:
  * data/btc_daily.json   — daily closes, so a specific date is exact rather
                            than interpolated between month markers.
  * BTC_MONTHLY in index.html — the offline fallback the calculator ships with.

This exists because the dataset previously went 19 months stale, which silently
broke every recent date. Running it on a schedule is what stops that recurring.
"""
import json
import os
import re
import subprocess
import sys
import datetime

from _sources import DATA_DIR, REPO_ROOT, fetch, load_json, write_json

# Free, key-free, and returns the whole history in one call.
COINGECKO = ("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
             "?vs_currency=usd&days=max&interval=daily")
START = "2013-04"


def fetch_daily():
    """{'YYYY-MM-DD': price} from CoinGecko's full daily history."""
    payload = json.loads(fetch(COINGECKO))
    prices = payload.get("prices") or []
    if len(prices) < 365:
        raise RuntimeError(f"CoinGecko returned only {len(prices)} points")
    out = {}
    for ms, price in prices:
        day = datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).strftime("%Y-%m-%d")
        out[day] = round(float(price), 2)
    return dict(sorted(out.items()))


def monthly_from_daily(daily):
    """First observation of each month.

    Matches the existing BTC_MONTHLY convention, where a month's value is the
    price at its start (which is why 2023-12 and 2024-01 share a value).
    """
    monthly = {}
    for day in sorted(daily):
        key = day[:7]
        if key >= START and key not in monthly:
            monthly[key] = int(round(daily[day]))
    return monthly


def render_block(monthly):
    """Re-emit the BTC_MONTHLY literal, five months per line as before."""
    keys = sorted(monthly)
    lines, row, year = [], [], None
    for k in keys:
        if year is not None and k[:4] != year:
            if row:
                lines.append("  " + "".join(row))
                row = []
        year = k[:4]
        row.append(f"'{k}':{monthly[k]},")
        if len(row) == 5:
            lines.append("  " + "".join(row))
            row = []
    if row:
        lines.append("  " + "".join(row))
    return "const BTC_MONTHLY = {\n" + "\n".join(lines) + "\n};"


def update_index(monthly):
    path = os.path.join(REPO_ROOT, "index.html")
    html = open(path).read()
    pattern = re.compile(r"const BTC_MONTHLY = \{.*?\n\};", re.S)
    if not pattern.search(html):
        raise RuntimeError("could not locate the BTC_MONTHLY block in index.html")
    updated = pattern.sub(lambda _: render_block(monthly), html, count=1)
    if updated == html:
        return False
    open(path, "w").write(updated)
    return True


def main():
    try:
        daily = fetch_daily()
    except Exception as e:  # noqa: BLE001
        print(f"Could not refresh Bitcoin prices: {e}", file=sys.stderr)
        print("Leaving the existing dataset in place.", file=sys.stderr)
        return 1

    daily = {d: p for d, p in daily.items() if d[:7] >= START}
    monthly = monthly_from_daily(daily)
    if len(monthly) < 100:
        print(f"Refusing to write a suspiciously short dataset ({len(monthly)} months).",
              file=sys.stderr)
        return 1

    previous = load_json(os.path.join(DATA_DIR, "btc_daily.json"), {}).get("prices", {})
    write_json(os.path.join(DATA_DIR, "btc_daily.json"), {
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "prices": daily,
    })
    print(f"  daily   {len(daily)} days ({len(daily) - len(previous):+d} vs last run)")
    print(f"  monthly {len(monthly)} months, latest {max(monthly)} = ${monthly[max(monthly)]:,}")

    if update_index(monthly):
        print("  index.html BTC_MONTHLY updated")
    else:
        print("  index.html BTC_MONTHLY already current")

    # The /what-if/ pages bake in numbers derived from this dataset.
    gen = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generate_year_pages.py")
    subprocess.run([sys.executable, gen], check=True, stdout=subprocess.DEVNULL)
    print("  /what-if/ pages regenerated")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    raise SystemExit(main())
