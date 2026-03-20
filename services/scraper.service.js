const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const CACHE_FILE = path.join(__dirname, "../hp-printers-cache.json");

function todayDateString() {
  const d = new Date();
  return d.toISOString().split("T")[0];
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

  // Return cache if it's fresh and truly US data (dollar currency)
  if (!force && cache && cache.scrapedDate === today) {
    const isUS = cache.printers?.[0]?.currency === "USD" || cache.printers?.[0]?.url?.includes("us-en");
    if (isUS) {
      console.log("✅ Returning cached HP US printers.");
      return cache.printers;
    }
  }

  console.log("🚀 Starting Puppeteer scraper for HP (US Market)...");
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox", 
        "--window-size=1920,1080",
        "--lang=en-US,en"
      ]
    });
    const page = await browser.newPage();
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

    
    // 🛡️ Set US Headers and Cookies to prevent redirect to India
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1920, height: 1080 });

    // Set US store cookies before navigation
    await page.setCookie(
      { name: 'hp_shop_country', value: 'US', domain: '.hp.com', path: '/' },
      { name: 'hp_shop_lang', value: 'en', domain: '.hp.com', path: '/' }
    );

    // Navigate to HP US printers page with a direct US URL
    const url = "https://www.hp.com/us-en/shop/vwa/printers/brand=HP?jumpid=ma_hp-printers_main_1_brand-HP";
    console.log(`📡 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });

    const finalUrl = await page.url();

    // 🛑 Handle the "Stay on US site" popup
    try {
      await page.waitForSelector("button", { timeout: 8000 });
      const clicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const target = btns.find(b => 
              b.innerText.toUpperCase().includes("NO THANKS") || 
              b.innerText.toUpperCase().includes("STAY ON") ||
              b.innerText.toUpperCase().includes("UNITED STATES")
          );
          if (target) {
              target.click();
              return true;
          }
          return false;
      });
      if (clicked) {
          console.log("🖱️ Handled country redirect popup.");
          await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      // No popup found or timeout
    }

    // Wait for the grid - Try both US and possible Int/India selectors
    console.log("⏳ Waiting for product grid (.productTile or .Zg-SR_gh)...");
    await page.waitForSelector(".productTile, .Zg-SR_gh, .vwa-page", { timeout: 20000 });

    // 🚀 Added: extra wait for prices to be injected via JS
    console.log("⏳ Letting prices load...");
    await new Promise(r => setTimeout(r, 5000));

    const printers = await page.evaluate(() => {
      // Try multiple selectors for product items
      const items = Array.from(document.querySelectorAll(".productTile, .Zg-SR_gh, [class*='productTile']"));
      
      return items.slice(0, 15).map((el, i) => {
        // Name and Link

        const nameEl = el.querySelector("h3") || el.querySelector("a.tileLink-gfe h3") || el.querySelector(".tile-name");
        const linkEl = el.querySelector("a.tileLink-gfe") || el.querySelector("a");
        const imgEl = el.querySelector("img");
        
        // Extended Price Selectors for HP US Grid (2025/2026 style)
        const priceSelectors = [
          ".price-box",
          ".price-gfe", 
          ".p-box__price",
          ".p-box__sale-price",
          ".current-price",
          ".pdp-price", 
          ".price", 
          "[class*='Price']", 
          "[data-automation-id='product-price']",
          ".Zg-SR_p"
        ];
        
        const msrpSelectors = [
          ".msrp-box",
          ".msrp-gfe", 
          ".p-box__msrp",
          ".p-box__list-price",
          ".msrp", 
          "[class*='msrp']", 
          ".msrp-tooltip-btn",
          ".Zg-SR_o"
        ];

        let priceEl = null;
        for (const sel of priceSelectors) {
          const found = el.querySelector(sel);
          if (found && (found.innerText || found.textContent).trim()) {
              priceEl = found;
              break;
          }
        }

        let msrpEl = null;
        for (const sel of msrpSelectors) {
          const found = el.querySelector(sel);
          if (found && (found.innerText || found.textContent).trim()) {
              msrpEl = found;
              break;
          }
        }
        
        const name = (el.querySelector("h3") || el.querySelector(".tile-name") || el.querySelector("[class*='Name']"))?.innerText?.trim() || "HP Printer";
        let printerUrl = (el.querySelector("a.tileLink-gfe") || el.querySelector("a"))?.href || "#";
        const image = el.querySelector("img")?.src || "";
        
        // Clean up URL
        if (printerUrl.includes("/in-en/")) {
           printerUrl = printerUrl.replace("/in-en/", "/us-en/");
        }

        const parsePrice = (txt) => {
          if (!txt) return 0;
          let clean = txt.replace(/\s/g, "");
          
          if (txt.toLowerCase().includes("/mo") || txt.toLowerCase().includes("per month")) {
             const subArr = txt.split(/Price/i);
             if (subArr.length > 1) txt = subArr[1]; // Look after the word "Price"
          }

          // More specific regex: Must have $ or follow "Price" or be a large number
          const matches = txt.match(/\$\s?\d{1,3}(,\d{3})*(\.\d{2})?|\d{1,3}(,\d{3})*(\.\d{2})/g);
          if (!matches) return 0;
          
          const nums = matches.map(m => parseFloat(m.replace(/[$,]/g, "")));
          // Return the first significant number (usually the primary price)
          return nums.find(n => n > 1) || nums[0] || 0;
        };

        let price = parsePrice(priceEl?.innerText || priceEl?.textContent);
        
        // Robust Fallback: Search parent and siblings if price is 0
        if (price === 0) {
           const cardText = el.innerText || "";
           // Search for strings like $299.99 or $1,299
           const priceMatch = cardText.match(/\$\s?(\d{1,3}(,\d{3})*(\.\d{2})?)/g);
           if (priceMatch && priceMatch.length > 0) {
               // Usually the first price with $ is the right one
               price = parsePrice(priceMatch[0]);
           }
        }

        let originalPrice = parsePrice(msrpEl?.innerText || msrpEl?.textContent) || price;
        if (originalPrice < price) originalPrice = price;

        return {
          id: `hp-us-${i}`,
          name,
          price,
          original_price: originalPrice,
          image,
          url: printerUrl,
          in_stock: !el.innerText.toUpperCase().includes("OUT OF STOCK"),
          currency: "USD"
        };


      });
    });

    if (printers.length === 0) {
      throw new Error("Scraper failed to extract products. Redirection might still be active.");
    }

    console.log(`✅ Successfully scraped ${printers.length} HP US printers.`);
    writeCache({ scrapedDate: today, printers });

    await browser.close();
    return printers;
  } catch (err) {
    console.error("❌ Scraper failure:", err.message);
    if (browser) await browser.close();
    
    // Emergency cache fallback
    if (cache && cache.printers) return cache.printers;
    throw err;
  }
}

module.exports = { scrapeHPPrinters };