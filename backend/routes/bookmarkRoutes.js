const express = require("express");
const router = express.Router();
const bookmarkController = require("../controllers/bookmarkController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.use(authMiddleware, authorizeRoles("customer"));

router.get("/", bookmarkController.getMyBookmarks);
router.post(
  "/",
  validate({
    body: {
      provider_id: [v.required("provider_id"), v.positiveInteger("provider_id")],
    },
  }),
  bookmarkController.addBookmark,
);
router.get(
  "/:providerId",
  validate({
    params: {
      providerId: [v.required("providerId"), v.positiveInteger("providerId")],
    },
  }),
  bookmarkController.getBookmarkStatus,
);
router.delete(
  "/:providerId",
  validate({
    params: {
      providerId: [v.required("providerId"), v.positiveInteger("providerId")],
    },
  }),
  bookmarkController.removeBookmark,
);

module.exports = router;
