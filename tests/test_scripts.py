#!/usr/bin/env python3
"""Tests for the data scripts. Run: python3 tests/test_scripts.py

These matter more than usual: the refresh workflow rewrites index.html
unattended, so a regression here ships bad prices to the site.
"""
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, "scripts")
sys.path.insert(0, SCRIPTS)

passed, failures = 0, []


def check(name, fn):
    global passed
    try:
        fn()
        passed += 1
    except Exception as e:  # noqa: BLE001
        failures.append(f"{name}: {e}")


def load(mod):
    spec = importlib.util.spec_from_file_location(mod, os.path.join(SCRIPTS, f"{mod}.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


src = load("_sources")
upd = load("update_btc_prices")


def monthly_from_index():
    html = open(os.path.join(ROOT, "index.html")).read()
    block = re.search(r"const BTC_MONTHLY = \{.*?\n\};", html, re.S).group(0)
    return {k: int(v) for k, v in re.findall(r"'(\d{4}-\d{2})':(\d+)", block)}


# ── the index.html rewrite must be lossless ───────────────────────────────────
def test_round_trip():
    current = monthly_from_index()
    back = {k: int(v) for k, v in re.findall(r"'(\d{4}-\d{2})':(\d+)", upd.render_block(current))}
    assert back == current, "render_block changed the data"


def test_rewrite_keeps_html_parseable():
    current = monthly_from_index()
    html = open(os.path.join(ROOT, "index.html")).read()
    new = re.sub(r"const BTC_MONTHLY = \{.*?\n\};",
                 lambda _: upd.render_block(current), html, count=1, flags=re.S)
    assert "const BTC_MONTHLY" in new and new.count("const BTC_MONTHLY") == 1
    assert len(new) > len(html) * 0.9, "rewrite lost a large chunk of the file"


def test_monthly_uses_first_of_month():
    daily = {"2024-01-01": 42000, "2024-01-15": 45000, "2024-02-01": 48000, "2013-03-05": 99}
    got = upd.monthly_from_daily(dict(sorted(daily.items())))
    assert got == {"2024-01": 42000, "2024-02": 48000}, got


# ── source parsers ────────────────────────────────────────────────────────────
def test_fred_both_header_formats():
    src.fetch = lambda url, retries=3: "observation_date,CPIAUCSL\n2013-04-01,232.531\n"
    assert src.fred_monthly("CPIAUCSL") == {"2013-04": 232.531}
    src.fetch = lambda url, retries=3: "DATE,CPIAUCSL\n2013-04-01,232.531\n2013-05-01,.\n"
    assert src.fred_monthly("CPIAUCSL") == {"2013-04": 232.531}, "missing marker not skipped"


def test_stooq_skips_no_data():
    src.fetch = lambda url, retries=3: (
        "Date,Open,High,Low,Close,Volume\n2013-04-30,1,1,1,1597.57,0\n2026-09-30,1,1,1,N/D,0\n")
    assert src.stooq_monthly("^spx") == {"2013-04": 1597.57}


def test_empty_responses_raise():
    for bad in ["", "nonsense", "Date,Close\n"]:
        src.fetch = lambda url, retries=3, b=bad: b
        for fn, arg in ((src.fred_monthly, "CPIAUCSL"), (src.stooq_monthly, "^spx")):
            try:
                fn(arg)
                raise AssertionError(f"{fn.__name__} accepted {bad!r}")
            except RuntimeError:
                pass


def test_yahoo_parses_chart_json():
    src.fetch = lambda url, retries=3: json.dumps({"chart": {"result": [{
        "timestamp": [1367366400, 1370044800],
        "indicators": {"quote": [{"close": [1597.57, None]}]},
    }]}})
    assert src.yahoo_monthly("^GSPC") == {"2013-05": 1597.57}, "null closes must be skipped"


def test_yahoo_rejects_garbage():
    for bad in ["", "not json", '{"chart":{"result":[]}}', '{"chart":{"result":[{}]}}']:
        src.fetch = lambda url, retries=3, b=bad: b
        try:
            src.yahoo_monthly("^GSPC")
            raise AssertionError(f"accepted {bad!r}")
        except RuntimeError:
            pass


def test_failures_quote_the_response():
    """The first live run failed with 'no usable rows', which said nothing about
    why. A parse failure must include what the provider actually sent."""
    src.fetch = lambda url, retries=3: "Exceeded the daily hits limit"
    for fn, arg in ((src.stooq_monthly, "^spx"), (src.yahoo_monthly, "^GSPC")):
        try:
            fn(arg)
            raise AssertionError(f"{fn.__name__} accepted a limit notice")
        except RuntimeError as e:
            assert "Exceeded the daily hits limit" in str(e), f"{fn.__name__}: {e}"


def test_stooq_url_encodes_the_symbol():
    """A bare ^ in a query string is not safe; it must be percent-encoded."""
    seen = {}

    def spy(url, retries=3):
        seen["url"] = url
        return "Date,Close\n2013-04-30,1597.57\n"

    src.fetch = spy
    src.stooq_monthly("^spx")
    assert "%5Espx" in seen["url"], seen["url"]
    assert "^" not in seen["url"], seen["url"]


def test_coingecko_url_has_no_paid_interval_param():
    """`interval` is a paid-plan parameter; sending it made the public endpoint
    reject the request on the first live run."""
    assert "interval=" not in upd.COINGECKO, upd.COINGECKO
    assert "days=max" in upd.COINGECKO


# ── the guard must actually fail on bad data ──────────────────────────────────
def run_verify(root):
    return subprocess.run([sys.executable, os.path.join(root, "scripts", "verify_data.py")],
                          capture_output=True, text=True).returncode


def with_broken_index(mutate):
    tmp = tempfile.mkdtemp()
    try:
        for item in ("index.html", "scripts", "data"):
            s = os.path.join(ROOT, item)
            if not os.path.exists(s):
                continue
            d = os.path.join(tmp, item)
            shutil.copytree(s, d) if os.path.isdir(s) else shutil.copy(s, d)
        p = os.path.join(tmp, "index.html")
        open(p, "w").write(mutate(open(p).read()))
        return run_verify(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_guard_passes_on_real_repo():
    assert run_verify(ROOT) == 0, "guard fails on the committed data"


def test_guard_catches_gap():
    rc = with_broken_index(lambda s: re.sub(r"'2020-05':\d+,", "", s, count=1))
    assert rc != 0, "a month gap was not caught"


def test_guard_catches_bad_price():
    rc = with_broken_index(lambda s: re.sub(r"'2020-05':\d+", "'2020-05':0", s, count=1))
    assert rc != 0, "a zero price was not caught"


# ── the year pages must stay reproducible from the generator ──────────────────
def test_year_pages_match_generator():
    before = {}
    wi = os.path.join(ROOT, "what-if")
    for year in sorted(os.listdir(wi)):
        p = os.path.join(wi, year, "index.html")
        if os.path.exists(p):
            before[year] = open(p).read()
    subprocess.run([sys.executable, os.path.join(SCRIPTS, "generate_year_pages.py")],
                   check=True, stdout=subprocess.DEVNULL)
    for year, old in before.items():
        assert open(os.path.join(wi, year, "index.html")).read() == old, \
            f"what-if/{year} is out of sync with the generator"


for name, fn in sorted((n, f) for n, f in list(globals().items()) if n.startswith("test_")):
    check(name, fn)

if failures:
    print(f"scripts: {passed} passed, {len(failures)} FAILED")
    for f in failures:
        print(f"  x {f}")
    sys.exit(1)
print(f"scripts: {passed} passed")
