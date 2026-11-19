const ANALYTICS_ID = 'G-T29BL3EPHL';
  const ANALYTICS_CHOICE_KEY = 'bgc.analytics-consent.v1';
  window.dataLayer = window.dataLayer || [];
  window['ga-disable-' + ANALYTICS_ID] = true;
  let analyticsAccepted = false;
  let analyticsLoaded = false;
  function analyticsPageUrl(value) {
    try { const u=new URL(value); return u.origin+u.pathname; } catch(_) { return ''; }
  }
  function gtag() {
    // Drop, rather than buffer, interactions before acceptance or after withdrawal.
    if (analyticsAccepted) window.dataLayer.push(arguments);
  }
  function readAnalyticsChoice() {
    try { return localStorage.getItem(ANALYTICS_CHOICE_KEY); } catch (_) { return null; }
  }
  function showAnalyticsChoice() {
    const choice = document.getElementById('analytics-choice');
    const status = document.getElementById('analytics-status');
    if (choice) choice.hidden = ['accepted','rejected'].includes(readAnalyticsChoice());
    if (status) status.textContent = analyticsAccepted ? 'Optional analytics: accepted.' : 'Optional analytics: off.';
  }
  function startAnalytics() {
    if (analyticsLoaded) return;
    analyticsAccepted = true;
    analyticsLoaded = true;
    window['ga-disable-' + ANALYTICS_ID] = false;
    gtag('js', new Date());
    gtag('set', 'page_location', analyticsPageUrl(location.href));
    gtag('set', 'page_referrer', analyticsPageUrl(document.referrer));
    gtag('config', ANALYTICS_ID, {
      page_location:analyticsPageUrl(location.href),
      page_referrer:analyticsPageUrl(document.referrer),
      allow_google_signals:false,
      allow_ad_personalization_signals:false
    });
    const script = document.createElement('script');
    script.id = 'analytics-tag'; script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ANALYTICS_ID;
    document.head.appendChild(script);
  }
  function clearAnalyticsCookies() {
    const host = location.hostname;
    const parts = host.split('.');
    const domains = ['', host, '.' + host];
    for (let i=1; i<parts.length-1; i++) domains.push('.' + parts.slice(i).join('.'));
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) return;
      domains.forEach(domain => { document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '') + '; SameSite=Lax'; });
    });
  }
  function setAnalyticsChoice(accepted) {
    try { localStorage.setItem(ANALYTICS_CHOICE_KEY, accepted ? 'accepted' : 'rejected'); } catch (_) {}
    if (accepted) startAnalytics();
    else {
      analyticsAccepted = false;
      window['ga-disable-' + ANALYTICS_ID] = true;
      window.dataLayer.length = 0;
      clearAnalyticsCookies();
      const tag = document.getElementById('analytics-tag');
      if (tag) tag.remove();
      // Remove the loaded vendor runtime as well as its tag element.
      if (analyticsLoaded) { location.reload(); return; }
    }
    showAnalyticsChoice();
  }
  document.addEventListener('DOMContentLoaded', () => {
    // Static guides use the same controls and stored preference as the calculator.
    if (!document.getElementById('analytics-choice')) {
      const main = document.querySelector('main') || document.body;
      main.insertAdjacentHTML('afterbegin', '  <section id="analytics-choice" aria-labelledby="analytics-choice-title" style="margin:16px 0;padding:16px;border:1px solid var(--border);border-radius:12px;">\n    <h2 id="analytics-choice-title" style="font-size:16px;">Optional analytics</h2>\n    <p style="font-size:13px;line-height:1.6;">May we use Google Analytics to understand page visits and calculation successes or broad error categories? We do not load it until you accept. Your calculator amounts, dates and results are not included in explicit events. The calculator works either way.</p>\n    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;">\n      <button type="button" id="analytics-accept" class="analytics-choice-button">Accept analytics</button>\n      <button type="button" id="analytics-reject" class="analytics-choice-button">Reject</button>\n    </div>\n    <a href="/#data-use" style="display:inline-block;margin-top:10px;color:var(--orange);font-size:13px;">Data &amp; email details</a>\n  </section>');
      (document.querySelector('footer') || main).insertAdjacentHTML('beforeend', '<p id="analytics-status" aria-live="polite">Optional analytics: off.</p><p><button type="button" id="analytics-settings" class="analytics-choice-button">Analytics settings</button> <button type="button" id="analytics-withdraw" class="analytics-choice-button">Withdraw analytics consent</button></p>');
      const style = document.createElement('style'); style.textContent = '.analytics-choice-button { min-width:150px;min-height:44px;padding:10px 16px;border:1px solid var(--orange,#f7931a);border-radius:8px;background:var(--surface,#171717);color:var(--text,#fff);font:inherit;cursor:pointer; } .analytics-choice-button:focus-visible { outline:2px solid #f7931a;outline-offset:3px; } #analytics-choice[hidden] { display:none; }'; document.head.appendChild(style);
    }
    if (readAnalyticsChoice() === 'accepted') startAnalytics();
    document.getElementById('analytics-accept').addEventListener('click', () => setAnalyticsChoice(true));
    document.getElementById('analytics-reject').addEventListener('click', () => setAnalyticsChoice(false));
    document.getElementById('analytics-settings').addEventListener('click', () => {
      const choice = document.getElementById('analytics-choice'); choice.hidden = false;
      document.getElementById('analytics-accept').focus();
    });
    document.getElementById('analytics-withdraw').addEventListener('click', () => setAnalyticsChoice(false));
    showAnalyticsChoice();
  });
  window.addEventListener('storage', event => {
    if (event.key === ANALYTICS_CHOICE_KEY && event.newValue !== 'accepted' && analyticsAccepted) setAnalyticsChoice(false);
  });
