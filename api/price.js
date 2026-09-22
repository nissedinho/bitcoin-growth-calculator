const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

module.exports = async (req, res) => {
  try {
    const response = await fetch(COINGECKO_URL);
    if (!response.ok) {
      throw new Error(`CoinGecko responded ${response.status}`);
    }

    const data = await response.json();
    const price = data && data.bitcoin && data.bitcoin.usd;
    if (typeof price !== "number") {
      throw new Error("Unexpected CoinGecko payload");
    }

    // Cache at the edge so a traffic spike costs CoinGecko one request per
    // minute instead of one per visitor — the free tier rate-limits well below
    // our page views, and every /what-if/ page calls this on load.
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=600");
    res.status(200).json({ price });
  } catch (error) {
    console.error("Price fetch failed:", error);
    res.status(500).json({ error: "Failed to fetch Bitcoin price" });
  }
};
