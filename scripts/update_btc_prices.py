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
# The public tier refuses anything beyond 365 days ("Your request exceeds the
# allowed time range", HTTP 401). So each run fetches the last year and merges
# it into whatever previous runs already collected - the daily history
# accumulates over time instead of needing one impossible bulk fetch.
COINGECKO = ("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
             "?vs_currency=usd&days=365")
START = "2013-04"


def fetch_daily():
    """{'YYYY-MM-DD': price} from CoinGecko's full daily history."""
    raw = fetch(COINGECKO)
    try:
        payload = json.loads(raw)
    except ValueError:
        raise RuntimeError(
            f"CoinGecko did not return JSON — got: {' '.join(raw.split())[:160]}") from None
    prices = payload.get("prices") or []
    if len(prices) < 300:
        snippet = " ".join(raw.split())[:160]
        raise RuntimeError(f"CoinGecko returned only {len(prices)} points — got: {snippet}")
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


def existing_monthly():
    """The BTC_MONTHLY currently in index.html, so a partial refresh never drops
    months the new fetch could not reach."""
    html = open(os.path.join(REPO_ROOT, "index.html")).read()
    block = re.search(r"const BTC_MONTHLY = \{.*?\n\};", html, re.S)
    if not block:
        return {}
    return {k: int(v) for k, v in re.findall(r"'(\d{4}-\d{2})':(\d+)", block.group(0))}


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

    fetched = {d: p for d, p in daily.items() if d[:7] >= START}

    # Merge over what earlier runs collected so the daily series grows.
    previous = load_json(os.path.join(DATA_DIR, "btc_daily.json"), {}).get("prices", {})
    merged = dict(previous)
    merged.update(fetched)
    merged = dict(sorted(merged.items()))

    write_json(os.path.join(DATA_DIR, "btc_daily.json"), {
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "prices": merged,
    })
    print(f"  daily   {len(merged)} days total ({len(merged) - len(previous):+d} new this run)")

    # Only rewrite BTC_MONTHLY where the merged daily data actually covers the
    # month; months outside the window keep their existing values.
    monthly = monthly_from_daily(merged)
    existing = existing_monthly()
    combined = dict(existing)
    combined.update(monthly)
    if len(combined) < 100:
        print(f"Refusing to write a suspiciously short dataset ({len(combined)} months).",
              file=sys.stderr)
        return 1
    print(f"  monthly {len(combined)} months, latest {max(combined)} = ${combined[max(combined)]:,}")

    if update_index(combined):
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
