"""Real Chromium checks: exact candidate HTML; analytics collection always aborted.
Only the public Google tag JS is fetched. No subscription, telemetry or live-price requests escape.
"""
from pathlib import Path
import json
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / 'index.html').read_text()
ORIGIN = 'https://calculator.test'
MARKER = '987654321'
passed = []

def check(name, condition):
    assert condition, name
    passed.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 390, "height": 844})
    requests, collections = [], []
    def route_request(route):
        req = route.request
        u = urlparse(req.url)
        requests.append(req.url)
        if u.netloc == 'calculator.test':
            if u.path == '/':
                route.fulfill(status=200, content_type='text/html', body=HTML)
            elif u.path == '/api/price':
                route.fulfill(status=200, content_type='application/json', body=json.dumps({'price':86603,'asOf':'2026-10-30T12:00:00Z'}))
            elif u.path in ['/data/btc_daily.json','/data/series.json']:
                route.fulfill(status=200, content_type='application/json', body=(ROOT / u.path.lstrip('/')).read_text())
            else:
                file = ROOT / u.path.lstrip('/')
                if file.is_dir(): file = file / 'index.html'
                if file.is_file() and file.suffix in ('.html', '.js', '.css'):
                    mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css'}[file.suffix]
                    route.fulfill(status=200, content_type=mime, body=file.read_text())
                else:
                    route.abort()
        elif u.hostname == 'www.googletagmanager.com' and u.path == '/gtag/js':
            # Retrieve script only. Never forward cookies, scenario URL or referrer.
            response = route.fetch(headers={'Accept':'*/*'}, max_redirects=0)
            assert response.status == 200, 'Google loader unavailable: cannot claim actual transport QA'
            route.fulfill(response=response)
        else:
            if 'google-analytics.com' in u.netloc or '/g/collect' in req.url or '/collect' in req.url:
                collections.append(req.url + '\n' + (req.post_data or ''))
            route.abort()
    context.route('**/*', route_request)
    page = context.new_page()
    page.goto(ORIGIN + '/?amount=' + MARKER + '#tm')
    page.wait_for_selector('#analytics-accept')
    page.wait_for_timeout(500)
    check('first visit loads no Google analytics resources', not any('googletagmanager.com' in u or 'google-analytics.com' in u for u in requests))
    page.locator('#tm-amount').fill('0')
    page.locator('#tm-amount').press('Enter')
    check('unconsented invalid calculation still works', page.locator('#tm-error').is_visible())
    check('preconsent calculation queues no diagnostic events', page.evaluate("() => !(window.dataLayer || []).some(x => x[0] === 'event')"))
    page.locator('#analytics-reject').click()
    page.reload()
    page.wait_for_timeout(500)
    check('rejection survives reload without Google requests', not any('googletagmanager.com' in u or 'google-analytics.com' in u for u in requests))
    for path in ['/faq/', '/what-if/2025/']:
        page.goto(ORIGIN + path)
        page.wait_for_timeout(300)
        check('rejection preserved on ' + path, not any('googletagmanager.com' in u or 'google-analytics.com' in u for u in requests))
        check('consent settings present on ' + path, page.locator('#analytics-settings').is_visible())
    page.goto(ORIGIN + '/?amount=' + MARKER + '#tm')
    # Controls remain accessible from footer after a choice.
    page.locator('#analytics-settings').click()
    page.locator('#analytics-accept').click()
    page.locator('script[src*="googletagmanager.com/gtag/js"]').wait_for(state='attached')
    page.wait_for_timeout(2500)
    page.locator('#tm-amount').fill('0')
    page.locator('#tm-amount').press('Enter')
    page.wait_for_timeout(1500)
    check('accepted consent loads Google tag', any('googletagmanager.com/gtag/js' in u for u in requests))
    check('actual vendor attempted collection is captured and suppressed', len(collections) > 0)
    check('scenario marker absent from attempted payloads', all(MARKER not in unquote(x) for x in collections))
    check('diagnostics include fixed error category', page.evaluate("() => dataLayer.some(x => x[0] === 'event' && x[1] === 'calculate_error' && x[2].reason === 'invalid_input')"))
    page.reload()
    page.wait_for_timeout(1500)
    check('acceptance survives reload', page.locator('#analytics-status').inner_text() == 'Optional analytics: accepted.')
    page.locator('#analytics-withdraw').click()
    page.wait_for_timeout(700)
    # Withdrawal reloads to remove the vendor runtime and all timers/listeners.
    before = len(requests)
    page.reload()
    page.wait_for_timeout(700)
    page.locator('#tm-amount').fill('0')
    page.locator('#tm-amount').press('Enter')
    page.wait_for_timeout(500)
    check('withdrawal remains denied after reload', not any('googletagmanager.com' in u or 'google-analytics.com' in u for u in requests[before:]))
    check('withdrawal removes analytics cookies', not any(c['name'].startswith('_ga') for c in context.cookies()))
    check('mobile controls fit viewport', page.evaluate('() => document.documentElement.scrollWidth <= window.innerWidth'))
    page.locator('#analytics-settings').click()
    check('accept/reject equal dimensions', page.evaluate("() => { const a=document.querySelector('#analytics-accept').getBoundingClientRect(), b=document.querySelector('#analytics-reject').getBoundingClientRect(); return Math.abs(a.width-b.width)<1 && Math.abs(a.height-b.height)<1; }"))
    page.locator('#analytics-choice').scroll_into_view_if_needed()
    page.screenshot(path='consent-mobile.png', full_page=True)
    browser.close()
print(json.dumps({'passed':len(passed),'checks':passed,'suppressed_collection_requests':len(collections)}, indent=2))
