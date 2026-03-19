const express = require("express");
const router = express.Router();
const { getHPPrinters } = require("../controllers/scraper.controller");

router.get("/hp-printers", getHPPrinters);

module.exports = router;