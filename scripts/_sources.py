"""Shared HTTP + parsing helpers for the data refresh scripts.

All sources here are public and key-free on purpose: the scheduled workflow
should keep working without anyone having to rotate a secret.
"""
import csv
import io
import json
import os
import urllib.error
import urllib.request

TIMEOUT = 60
UA = "bitcoingrowthcalculator-data/1.0 (+https://www.bitcoingrowthcalculator.com)"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, "data")


def fetch(url, retries=3):
    """GET a URL as text, retrying transient failures with a simple backoff."""
    import time
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"failed to fetch {url}: {last}")


def month_key(date_str):
    """'2024-03-17' -> '2024-03'."""
    return date_str[:7]


def fred_monthly(series_id):
    """A monthly series from FRED's public CSV endpoint (no API key needed)."""
    text = fetch(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}")
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        date = row.get("observation_date") or row.get("DATE")
        raw = row.get(series_id)
        if not date or raw in (None, "", "."):
            continue
        try:
            out[month_key(date)] = round(float(raw), 4)
        except ValueError:
            continue
    if not out:
        raise RuntimeError(f"FRED returned no usable rows for {series_id}")
    return out


def stooq_monthly(symbol):
    """Monthly closes from Stooq's public CSV endpoint (no API key needed)."""
    text = fetch(f"https://stooq.com/q/d/l/?s={symbol}&i=m")
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        date, close = row.get("Date"), row.get("Close")
        if not date or not close or close == "N/D":
            continue
        try:
            out[month_key(date)] = round(float(close), 4)
        except ValueError:
            continue
    if not out:
        raise RuntimeError(f"Stooq returned no usable rows for {symbol}")
    return out


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default if default is not None else {}


def write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(payload, f, separators=(",", ":"), sort_keys=True)
        f.write("\n")
