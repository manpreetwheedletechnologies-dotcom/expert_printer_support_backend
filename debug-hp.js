const puppeteer = require("puppeteer");
const fs = require("fs");

async function run() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setCookie(
    { name: 'hp_shop_country', value: 'US', domain: '.hp.com', path: '/' },
    { name: 'hp_shop_lang', value: 'en', domain: '.hp.com', path: '/' }
  );
  
  const url = "https://www.hp.com/us-en/shop/vwa/printers/brand=HP";
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  
  const html = await page.content();
  fs.writeFileSync("hp-page.html", html);
  console.log("Saved hp-page.html");
  
  await browser.close();
}

run();
