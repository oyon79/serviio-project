const express = require("express");
const router = express.Router();
const communicationController = require("../controllers/communicationController");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

router.get(
  "/bookings/:bookingId/messages",
  authMiddleware,
  validate({
    params: {
      bookingId: [
        v.required("bookingId"),
        v.positiveInteger("bookingId"),
      ],
    },
  }),
  communicationController.listMessages,
);

router.post(
  "/bookings/:bookingId/messages",
  authMiddleware,
  validate({
    params: {
      bookingId: [
        v.required("bookingId"),
        v.positiveInteger("bookingId"),
      ],
    },
    body: {
      message: [
        v.required("message"),
        v.nonEmptyString("message"),
        v.maxLength(2000, "message"),
      ],
    },
  }),
  communicationController.createMessage,
);

router.get(
  "/bookings/:bookingId/call-requests",
  authMiddleware,
  validate({
    params: {
      bookingId: [
        v.required("bookingId"),
        v.positiveInteger("bookingId"),
      ],
    },
  }),
  communicationController.listCallRequests,
);

router.post(
  "/bookings/:bookingId/call-requests",
  authMiddleware,
  validate({
    params: {
      bookingId: [
        v.required("bookingId"),
        v.positiveInteger("bookingId"),
      ],
    },
    body: {
      call_type: [v.oneOf(["VOICE", "VIDEO"], "call_type")],
      reason: [v.maxLength(500, "reason")],
    },
  }),
  communicationController.createCallRequest,
);

router.patch(
  "/call-requests/:id",
  authMiddleware,
  validate({
    params: {
      id: [v.required("id"), v.positiveInteger("id")],
    },
    body: {
      status: [
        v.required("status"),
        v.oneOf(
          ["ACCEPTED", "DECLINED", "COMPLETED", "MISSED", "CANCELLED"],
          "status",
        ),
      ],
    },
  }),
  communicationController.updateCallRequest,
);

module.exports = router;
