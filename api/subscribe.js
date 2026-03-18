const BEEHIIV_FORM_URL = 'https://subscribe-forms.beehiiv.com/5cef7315-a3f9-400a-9597-6806aac54862';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    // Step 1: Fetch the Beehiiv form page to get the CSRF token
    const formPageRes = await fetch(BEEHIIV_FORM_URL);
    const html = await formPageRes.text();

    // Extract authenticity_token
    const tokenMatch = html.match(/name="authenticity_token"\s+value="([^"]+)"/);
    if (!tokenMatch) {
      return res.status(500).json({ error: 'Could not get form token' });
    }
    const token = tokenMatch[1];

    // Extract cookies from the form page response
    const cookies = formPageRes.headers.get('set-cookie') || '';

    // Step 2: Submit the form to Beehiiv's API endpoint
    const formData = new URLSearchParams();
    formData.append('authenticity_token', token);
    formData.append('form_id', '5cef7315-a3f9-400a-9597-6806aac54862');
    formData.append('form[email]', email);
    formData.append('utm_source', 'bitcoingrowthcalculator.com');
    formData.append('utm_medium', 'website');
    formData.append('utm_campaign', 'email_signup');
    formData.append('referrer', 'https://www.bitcoingrowthcalculator.com');

    const submitRes = await fetch('https://subscribe-forms.beehiiv.com/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Referer': BEEHIIV_FORM_URL,
        'Origin': 'https://subscribe-forms.beehiiv.com'
      },
      body: formData.toString(),
      redirect: 'manual'
    });

    // Beehiiv typically redirects on success (302)
    if (submitRes.status === 200 || submitRes.status === 302 || submitRes.status === 301) {
      return res.status(200).json({ success: true });
    } else {
      const body = await submitRes.text();
      console.error('Beehiiv response:', submitRes.status, body.substring(0, 200));
      return res.status(200).json({ success: true }); // Still show success to user
    }
  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: 'Subscription failed' });
  }
};
