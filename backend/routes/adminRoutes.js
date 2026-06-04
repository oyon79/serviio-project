const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

// Admin: list providers
router.get(
  "/providers",
  authMiddleware,
  adminMiddleware,
  adminController.listProviders,
);

// Admin: verify provider by profile id
router.post(
  "/providers/:profileId/verify",
  authMiddleware,
  adminMiddleware,
  adminController.verifyProvider,
);

module.exports = router;
