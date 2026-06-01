const express = require("express");
const router = express.Router();
const providerController = require("../controllers/providerController");

// Route to get all providers: GET /api/providers
router.get("/", providerController.getAllProviders);

module.exports = router;
