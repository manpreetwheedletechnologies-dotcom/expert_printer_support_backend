const fs = require("fs");
const path = require("path");

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

// ✅ Static US HP printers — same field shape as your existing API response
const HP_US_PRINTERS = [
  {
    id: "hp-0",
    name: "HP DeskJet 4155e All-in-One Printer",
    price: 69.99,
    original_price: 69.99,
    image: "https://hp.widen.net/content/wxvtjhkxxd/webp/wxvtjhkxxd.png",
    url: "https://www.hp.com/us-en/shop/pdp/hp-deskjet-4155e-all-in-one-printer",
    in_stock: true,
  },
  {
    id: "hp-1",
    name: "HP ENVY 6055e All-in-One Printer",
    price: 79.99,
    original_price: 99.99,
    image: "https://hp.widen.net/content/tvq40tdjdx/jpeg/tvq40tdjdx.jpg",
    url: "https://www.hp.com/us-en/shop/pdp/hp-envy-6055e-all-in-one-printer",
    in_stock: true,
  },
  {
    id: "hp-2",
    name: "HP ENVY Inspire 7955e All-in-One Printer",
    price: 179.99,
    original_price: 199.99,
    image: "https://hp.widen.net/content/muwpvnq8dp/jpeg/muwpvnq8dp.jpg",
    url: "https://www.hp.com/us-en/shop/pdp/hp-envy-inspire-7955e-all-in-one-printer",
    in_stock: true,
  },
  {
    id: "hp-3",
    name: "HP OfficeJet 8015e All-in-One Printer",
    price: 129.99,
    original_price: 149.99,
    image: "https://hp.widen.net/content/zervsaujbt/webp/zervsaujbt.png",
    url: "https://www.hp.com/us-en/shop/pdp/hp-officejet-8015e-all-in-one-printer",
    in_stock: true,
  },
  {
    id: "hp-4",
    name: "HP OfficeJet Pro 9025e All-in-One Printer",
    price: 249.99,
    original_price: 279.99,
    image: "https://hp.widen.net/content/w9justeyyu/webp/w9justeyyu.png",
    url: "https://www.hp.com/us-en/shop/pdp/hp-officejet-pro-9025e-all-in-one-printer",
    in_stock: true,
  },
  {
    id: "hp-6",
    name: "HP Color LaserJet Pro MFP M283fdw",
    price: 399.99,
    original_price: 449.99,
    image: "https://hp.widen.net/content/ouczjobmx5/webp/ouczjobmx5.png",
    url: "https://www.hp.com/us-en/shop/pdp/hp-color-laserjet-pro-mfp-m283fdw",
    in_stock: true,
  },
  {
    id: "hp-7",
    name: "HP LaserJet Pro MFP M428fdw",
    price: 329.99,
    original_price: 379.99,
    image: "https://hp.widen.net/content/sgniyiwlxa/png/sgniyiwlxa.png",
    url: "https://www.hp.com/us-en/shop/pdp/hp-laserjet-pro-mfp-m428fdw",
    in_stock: true,
  },
];

async function scrapeHPPrinters(force = false) {
  const today = todayDateString();
  const cache = readCache();

  if (!force && cache && cache.scrapedDate === today) {
    console.log("✅ Returning cached HP printers.");
    return {
      success: true,
      count: cache.printers.length,
      data: cache.printers,
    };
  }

  console.log(`✅ Loaded ${HP_US_PRINTERS.length} HP US printers (static).`);
  writeCache({ scrapedDate: today, printers: HP_US_PRINTERS });

  return {
    success: true,
    count: HP_US_PRINTERS.length,
    data: HP_US_PRINTERS,
  };
}

module.exports = { scrapeHPPrinters };