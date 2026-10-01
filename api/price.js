const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true';

module.exports = async (req, res) => {
  try {
    const response = await fetch(COINGECKO_URL, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`CoinGecko responded ${response.status}`);
    const data = await response.json();
    const price = data?.bitcoin?.usd;
    if (!Number.isFinite(price) || price <= 0) throw new Error('Unexpected CoinGecko payload');
    const updated = data.bitcoin.last_updated_at;
    const asOf = Number.isFinite(updated) && updated > 0
      ? new Date(updated * 1000).toISOString() : new Date().toISOString();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
    res.status(200).json({ price, asOf, source: 'CoinGecko' });
  } catch (error) {
    console.error('Price fetch failed:', error.message);
    res.status(502).json({ error: 'Failed to fetch Bitcoin price' });
  }
};
