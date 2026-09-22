#!/usr/bin/env python3
"""Refresh data/series.json — the CPI, S&P 500 and gold series the calculator
uses for inflation-adjusted returns and the "same money, other assets" table.

Run from the repo root:  python3 scripts/fetch_series.py

Each source is fetched independently. If one is down, the series already in
data/series.json is kept rather than dropped, so a transient outage degrades to
"slightly stale" instead of "feature disappears".
"""
import datetime
import os
import sys

from _sources import DATA_DIR, fred_monthly, load_json, stooq_monthly, write_json, yahoo_monthly

START = "2013-04"  # the calculator's dataset begins here; earlier rows are noise

# A series must fill at least this much of the range it spans to be accepted;
# below it, the next provider is tried instead.
MIN_COVERAGE = 0.80

# Nominal APY used for the "savings account" comparison row. Deliberately a
# plain constant: it is an illustrative baseline, not a tracked market rate.
SAVINGS_APY = 4.0

# Each series lists providers in preference order. Stooq serves clean CSV but
# refuses some datacenter IPs, so equities and metals fall back to Yahoo; the
# first provider that returns a usable series wins.
SOURCES = {
    "cpi": [
        ("CPIAUCSL (FRED)", lambda: fred_monthly("CPIAUCSL")),
    ],
    "sp500": [
        ("^SPX (Stooq)",   lambda: stooq_monthly("^spx")),
        ("^GSPC (Yahoo)",  lambda: yahoo_monthly("^GSPC")),
        ("SPY (Yahoo)",    lambda: yahoo_monthly("SPY")),
        ("SP500 (FRED)",   lambda: fred_monthly("SP500")),
    ],
    "gold": [
        ("XAUUSD (Stooq)", lambda: stooq_monthly("xauusd")),
        ("GC=F (Yahoo)",   lambda: yahoo_monthly("GC=F")),
    ],
}


def trim(series):
    return {k: v for k, v in sorted(series.items()) if k >= START}


def months_between(first, last):
    (y1, m1), (y2, m2) = (int(x) for x in first.split("-")), (int(x) for x in last.split("-"))
    return (y2 - y1) * 12 + (m2 - m1) + 1


def coverage(series):
    """Fraction of the months a series spans that it actually has values for.

    A provider can answer successfully with a series full of holes - Yahoo
    returned 54 of ~160 months for the S&P on one run - which is worse than an
    outright failure because it looks like data.
    """
    keys = sorted(series)
    if len(keys) < 2:
        return 0.0
    return len(keys) / months_between(keys[0], keys[-1])


def main():
    path = os.path.join(DATA_DIR, "series.json")
    existing = load_json(path, {})
    out = {k: v for k, v in existing.items() if k in SOURCES}
    failures = []

    for name, providers in SOURCES.items():
        attempts = []
        for label, fetcher in providers:
            try:
                series = trim(fetcher())
                if len(series) < 12:
                    raise RuntimeError(f"only {len(series)} rows after trimming")
                filled = coverage(series)
                if filled < MIN_COVERAGE:
                    raise RuntimeError(
                        f"sparse series: {len(series)} months covering "
                        f"{filled:.0%} of its own span")
                out[name] = series
                print(f"  {name:6} {len(series):4} months from {label} ({filled:.0%} coverage)")
                break
            except Exception as e:  # noqa: BLE001 - try the next provider
                attempts.append(f"{label}: {e}")
                print(f"  {name:6} {label} failed — {e}", file=sys.stderr)
        else:
            kept = len(existing.get(name, {}))
            failures.append(f"{name} (kept {kept} existing months); " + " | ".join(attempts))
            print(f"  {name:6} FAILED on every provider, keeping {kept} existing months",
                  file=sys.stderr)

    if not out:
        print("No series available and nothing cached; leaving data/series.json alone.",
              file=sys.stderr)
        return 1

    out["savings_apy"] = SAVINGS_APY
    out["generated"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    write_json(path, out)
    print(f"wrote {os.path.relpath(path, os.path.dirname(DATA_DIR))}")

    # A partial refresh is still worth committing, but it must not look clean:
    # exit 2 so the workflow can flag it while still keeping what did arrive.
    if failures:
        print("Partial refresh. Failed sources:\n  - " + "\n  - ".join(failures), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    raise SystemExit(main())
