const BEEHIIV_FORM_URL = 'https://subscribe-forms.beehiiv.com/5cef7315-a3f9-400a-9597-6806aac54862';
const FAILURE = 'Your subscription could not be submitted. Please try again later.';
const UNKNOWN = 'We could not confirm whether your request was accepted. Check your inbox before trying again.';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Valid email required' });
  }
  let submissionStarted = false;
  try {
    const formPageRes = await fetch(BEEHIIV_FORM_URL, { signal: AbortSignal.timeout(10000) });
    if (!formPageRes.ok) return res.status(502).json({ success: false, error: FAILURE });
    const html = await formPageRes.text();
    const tokenMatch = html.match(/name="authenticity_token"\s+value="([^"]+)"/);
    if (!tokenMatch) return res.status(502).json({ success: false, error: FAILURE });
    // Cookie request headers contain name/value pairs, never Set-Cookie attributes.
    const setCookies = typeof formPageRes.headers.getSetCookie === 'function'
      ? formPageRes.headers.getSetCookie() : [formPageRes.headers.get('set-cookie') || ''];
    const cookies = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
    const formData = new URLSearchParams({
      authenticity_token: tokenMatch[1], form_id: '5cef7315-a3f9-400a-9597-6806aac54862',
      'form[email]': email, utm_source: 'bitcoingrowthcalculator.com',
      utm_medium: 'website', utm_campaign: 'email_signup',
      referrer: 'https://www.bitcoingrowthcalculator.com'
    });
    submissionStarted = true;
    const submitRes = await fetch('https://subscribe-forms.beehiiv.com/api/submit', {
      method: 'POST', headers: {
        'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies,
        Referer: BEEHIIV_FORM_URL, Origin: 'https://subscribe-forms.beehiiv.com'
      },
      body: formData.toString(), redirect: 'manual', signal: AbortSignal.timeout(10000)
    });
    // A redirect or ordinary 200 can be a confirmation page or a validation
    // page. Preserve uncertainty without claiming signup or inviting blind
    // retries. No conversion is recorded without explicit acknowledgement.
    if (submitRes.ok) {
      const result = await submitRes.json().catch(() => null);
      const errors = result?.errors;
      const hasErrors = !!result?.error || (Array.isArray(errors) ? errors.length > 0
        : errors && typeof errors === 'object' ? Object.keys(errors).length > 0 : !!errors);
      if (result?.success === true && !hasErrors) {
        return res.status(200).json({ success: true });
      }
      if (result?.success === false || hasErrors) {
        return res.status(502).json({ success: false, error: FAILURE });
      }
    } else if (submitRes.status >= 400 && submitRes.status < 500) {
      return res.status(502).json({ success: false, error: FAILURE });
    }
    return res.status(202).json({ success: false, status: 'unknown', message: UNKNOWN });
  } catch (_) {
    // A timeout after POST may have happened after the provider accepted it.
    return submissionStarted
      ? res.status(202).json({ success: false, status: 'unknown', message: UNKNOWN })
      : res.status(502).json({ success: false, error: FAILURE });
  }
};
