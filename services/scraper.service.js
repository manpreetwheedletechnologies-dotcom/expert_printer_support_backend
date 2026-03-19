const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const TARGET_URL = "https://www.hp.com/in-en/shop/hp-print-family";
const CACHE_FILE = path.join(__dirname, "../hp-printers-cache.json");

function todayDateString() {
  return new Date().toISOString().split("T")[0];
}

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function writeCache(data) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

async function scrapeHPPrinters(force = false) {
  const today = todayDateString();
  const cache = readCache();

  // ✅ Return cached data (only 9)
  if (!force && cache && cache.scrapedDate === today) {
    return cache.printers.slice(0, 9);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // ✅ VPS safe
  });

  const page = await browser.newPage();

  await page.goto(TARGET_URL, { waitUntil: "networkidle2" });

  // ✅ Scroll to load products
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;

      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });

  // ✅ Extract data
let printers = await page.evaluate(() => {
  const items = [];

  document.querySelectorAll(".product-item").forEach((el, index) => {
    const name =
      el.querySelector(".product-item-link")?.innerText?.trim() || "";

    const priceText =
      el.querySelector(".price")?.innerText?.replace(/[^\d.]/g, "") || "0";

    const image =
      el.querySelector("img")?.src ||
      el.querySelector("img")?.getAttribute("data-src") ||
      "";

    // ✅ GET PRODUCT URL
    const linkElement = el.querySelector("a");
    let url = linkElement?.href || "";

    // ✅ FIX RELATIVE URL (important)
    if (url && !url.startsWith("http")) {
      url = "https://www.hp.com" + url;
    }

    if (name) {
      items.push({
        id: "hp-" + index,
        name,
        price: parseFloat(priceText) || 0,
        original_price: parseFloat(priceText) || 0,
        image,
        url,              // ✅ NEW FIELD
        in_stock: true,
      });
    }
  });

  return items;
});

  await browser.close();

  // ✅ ONLY KEEP FIRST 9 (latest)
  printers = printers.slice(0, 9);

  // ✅ Save cache
  writeCache({
    scrapedDate: today,
    printers,
  });

  return printers;
}

module.exports = { scrapeHPPrinters };