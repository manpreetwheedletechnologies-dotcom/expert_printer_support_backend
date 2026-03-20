const { scrapeHPPrinters } = require('./services/scraper.service');

(async () => {
  console.log("Starting test scrape...");
  try {
    const data = await scrapeHPPrinters(true);
    console.log("Scrape successful!");
    console.log("First item:", data[0]);
  } catch (err) {
    console.error("Scrape failed:", err.message);
  }
})();
