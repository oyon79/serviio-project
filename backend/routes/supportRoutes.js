const express = require("express");
const router = express.Router();
const supportController = require("../controllers/supportController");
const authMiddleware = require("../middlewares/authMiddleware");
const authorizeRoles = require("../middlewares/roleMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.post(
  "/tickets",
  authMiddleware,
  validate({
    body: {
      booking_id: [v.positiveInteger("booking_id")],
      category: [
        v.oneOf(["GENERAL", "REFUND", "DISPUTE", "SAFETY", "TECHNICAL"], "category"),
      ],
      subject: [
        v.required("subject"),
        v.nonEmptyString("subject"),
        v.maxLength(255, "subject"),
      ],
      description: [
        v.required("description"),
        v.nonEmptyString("description"),
        v.maxLength(5000, "description"),
      ],
      priority: [v.oneOf(["LOW", "NORMAL", "HIGH", "URGENT"], "priority")],
    },
  }),
  supportController.createTicket,
);
router.get("/tickets/my", authMiddleware, supportController.getMyTickets);
router.get(
  "/tickets/admin",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent", "verification_officer"),
  supportController.listAllTickets,
);
router.get(
  "/tickets/:id",
  authMiddleware,
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
  }),
  supportController.getTicketById,
);
router.post(
  "/tickets/:id/messages",
  authMiddleware,
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
    body: {
      message: [
        v.required("message"),
        v.nonEmptyString("message"),
        v.maxLength(5000, "message"),
      ],
      is_internal: [v.boolean("is_internal")],
    },
  }),
  supportController.addMessage,
);
router.patch(
  "/tickets/:id",
  authMiddleware,
  authorizeRoles("admin", "super_admin", "support_agent"),
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
    body: {
      status: [v.oneOf(["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"], "status")],
      priority: [v.oneOf(["LOW", "NORMAL", "HIGH", "URGENT"], "priority")],
      assigned_to: [v.positiveInteger("assigned_to")],
      resolution: [v.maxLength(5000, "resolution")],
    },
  }),
  supportController.updateTicket,
);

module.exports = router;
