export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { next: { revalidate: 60 } } // cache for 60 seconds
    );

    const data = await response.json();

    res.status(200).json({
      price: data.bitcoin.usd
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch Bitcoin price"
    });
  }
}
