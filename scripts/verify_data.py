#!/usr/bin/env python3
"""Guard rail for the data refresh workflow.

Runs after the fetch scripts and before anything is committed, so a malformed
or truncated refresh fails the job instead of shipping a broken calculator.
"""
import json
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    return False


def check_monthly():
    html = open(os.path.join(REPO_ROOT, "index.html")).read()
    block = re.search(r"const BTC_MONTHLY = \{.*?\n\};", html, re.S)
    if not block:
        return fail("BTC_MONTHLY block missing from index.html")
    months = dict((k, int(v)) for k, v in re.findall(r"'(\d{4}-\d{2})':(\d+)", block.group(0)))
    if len(months) < 100:
        return fail(f"BTC_MONTHLY has only {len(months)} months")
    if any(v <= 0 for v in months.values()):
        return fail("BTC_MONTHLY contains a non-positive price")

    # No gaps: every month between the first and last must be present, because
    # the calculator walks the series month by month.
    keys = sorted(months)
    y, m = map(int, keys[0].split("-"))
    missing = []
    while True:
        k = f"{y}-{m:02d}"
        if k not in months:
            missing.append(k)
        if k == keys[-1]:
            break
        m += 1
        if m > 12:
            m, y = 1, y + 1
    if missing:
        return fail(f"BTC_MONTHLY has gaps: {', '.join(missing[:6])}")
    print(f"  BTC_MONTHLY: {len(months)} months, {keys[0]}..{keys[-1]}, no gaps")
    return True


def check_json(name, required_keys=()):
    path = os.path.join(REPO_ROOT, "data", name)
    if not os.path.exists(path):
        print(f"  {name}: absent (optional)")
        return True
    try:
        payload = json.load(open(path))
    except ValueError as e:
        return fail(f"{name} is not valid JSON: {e}")
    for key in required_keys:
        if key not in payload:
            return fail(f"{name} is missing '{key}'")
    if name == "series.json":
        for series in ("cpi", "sp500", "gold"):
            if series in payload and len(payload[series]) < 12:
                return fail(f"{name}: series '{series}' has only {len(payload[series])} rows")
    if name == "btc_daily.json":
        prices = payload.get("prices", {})
        if len(prices) < 365:
            return fail(f"{name}: only {len(prices)} daily points")
        if any((not isinstance(v, (int, float))) or v <= 0 for v in prices.values()):
            return fail(f"{name}: contains a non-positive or non-numeric price")
    print(f"  {name}: OK")
    return True


def main():
    ok = all([
        check_monthly(),
        check_json("series.json"),
        check_json("btc_daily.json", ("prices",)),
    ])
    print("data verification passed" if ok else "data verification FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
