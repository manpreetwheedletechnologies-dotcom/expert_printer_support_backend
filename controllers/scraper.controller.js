const { scrapeHPPrinters } = require("../services/scraper.service");

exports.getHPPrinters = async (req, res) => {
  try {
    const force = req.query.force === "true";

    const data = await scrapeHPPrinters(force);

    res.json({
      success: true,
      count: data.length,
      data,
    });

  } catch (err) {
    console.error("Scraper error:", err);

    res.status(500).json({
      success: false,
      message: "Scraping failed",
    });
  }
};