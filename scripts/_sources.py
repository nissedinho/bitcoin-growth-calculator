"""Shared HTTP + parsing helpers for the data refresh scripts.

All sources here are public and key-free on purpose: the scheduled workflow
should keep working without anyone having to rotate a secret.
"""
import csv
import datetime
import io
import json
import os
import urllib.parse
import urllib.error
import urllib.request

TIMEOUT = 60
UA = "bitcoingrowthcalculator-data/1.0 (+https://www.bitcoingrowthcalculator.com)"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, "data")


def fetch(url, retries=3):
    """GET a URL as text, retrying transient failures with a simple backoff.

    Failures carry the status and a snippet of the body: a provider that starts
    refusing requests usually says so in plain text, and without it the caller
    can only report "no usable rows".
    """
    import time
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", "replace")[:200].replace("\n", " ")
            except Exception:  # noqa: BLE001
                pass
            last = f"HTTP {e.code}" + (f" — {body}" if body else "")
            # 4xx other than rate limiting will not change on a retry.
            if e.code not in (408, 425, 429, 500, 502, 503, 504):
                break
        except (urllib.error.URLError, OSError) as e:
            last = str(e)
        if attempt < retries - 1:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"failed to fetch {url}: {last}")


def _no_rows(source, symbol, text):
    """A parse failure that quotes what the provider actually sent back."""
    snippet = " ".join(text.split())[:160] if text else "(empty response)"
    return RuntimeError(f"{source} returned no usable rows for {symbol} — got: {snippet}")


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
        raise _no_rows("FRED", series_id, text)
    return out


def stooq_monthly(symbol):
    """Monthly closes from Stooq's public CSV endpoint (no API key needed)."""
    text = fetch(f"https://stooq.com/q/d/l/?s={urllib.parse.quote(symbol, safe='')}&i=m")
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
        raise _no_rows("Stooq", symbol, text)
    return out


def yahoo_monthly(symbol):
    """Monthly closes from Yahoo's public chart endpoint — the fallback for
    symbols Stooq will not serve to a datacenter IP."""
    # Explicit bounds rather than range=max: the latter came back sparse for
    # ^GSPC (54 months across a 13-year span) while gold was near-complete.
    start = int(datetime.datetime(2012, 1, 1, tzinfo=datetime.timezone.utc).timestamp())
    end = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(symbol, safe='')}"
           f"?period1={start}&period2={end}&interval=1mo")
    text = fetch(url)
    try:
        result = json.loads(text)["chart"]["result"][0]
        stamps = result["timestamp"]
        closes = result["indicators"]["quote"][0]["close"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise _no_rows("Yahoo", symbol, text) from None
    out = {}
    for ts, close in zip(stamps, closes):
        if close is None:
            continue
        day = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime("%Y-%m-%d")
        out[month_key(day)] = round(float(close), 4)
    if not out:
        raise _no_rows("Yahoo", symbol, text)
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
