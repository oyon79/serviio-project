const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  validate,
  validators: v,
} = require("../middlewares/validationMiddleware");

// Define the routes
router.post(
  "/register",
  validate({
    body: {
      first_name: [
        v.required("first_name"),
        v.nonEmptyString("first_name"),
        v.maxLength(100, "first_name"),
      ],
      last_name: [
        v.required("last_name"),
        v.nonEmptyString("last_name"),
        v.maxLength(100, "last_name"),
      ],
      email: [
        v.required("email"),
        v.email("email"),
        v.maxLength(255, "email"),
      ],
      phone: [v.maxLength(30, "phone")],
      password: [
        v.required("password"),
        v.string("password"),
        v.minLength(8, "password"),
      ],
      role: [v.oneOf(["customer", "provider"], "role")],
      nid: [
        v.regex(
          /^(?:\d{10}|\d{13}|\d{17})$/,
          "nid must be 10, 13, or 17 digits.",
        ),
      ],
    },
  }),
  authController.register,
);
router.post(
  "/login",
  validate({
    body: {
      email: [
        v.required("email"),
        v.email("email"),
        v.maxLength(255, "email"),
      ],
      password: [v.required("password"), v.string("password")],
    },
  }),
  authController.login,
);
router.post(
  "/verify-registration",
  validate({
    body: {
      email: [
        v.required("email"),
        v.email("email"),
        v.maxLength(255, "email"),
      ],
      otp: [v.required("otp"), v.regex(/^\d{6}$/, "otp must be 6 digits.")],
    },
  }),
  authController.verifyRegistration,
);
router.post(
  "/resend-registration-otp",
  validate({
    body: {
      email: [
        v.required("email"),
        v.email("email"),
        v.maxLength(255, "email"),
      ],
    },
  }),
  authController.resendRegistrationOtp,
);
router.get("/me", authMiddleware, authController.getMe);
router.put(
  "/me",
  authMiddleware,
  validate({
    body: {
      first_name: [
        v.required("first_name"),
        v.nonEmptyString("first_name"),
        v.maxLength(100, "first_name"),
      ],
      last_name: [
        v.required("last_name"),
        v.nonEmptyString("last_name"),
        v.maxLength(100, "last_name"),
      ],
      phone: [v.maxLength(30, "phone")],
    },
  }),
  authController.updateMe,
);
router.post(
  "/forgot-password",
  validate({
    body: {
      email: [
        v.required("email"),
        v.email("email"),
        v.maxLength(255, "email"),
      ],
      phone: [v.maxLength(30, "phone")],
    },
  }),
  authController.forgotPassword,
);
router.post(
  "/reset-password",
  validate({
    body: {
      token: [
        v.required("token"),
        v.regex(/^[a-f0-9]{64}$/i, "token is invalid."),
      ],
      otp: [v.required("otp"), v.regex(/^\d{6}$/, "otp must be 6 digits.")],
      password: [
        v.required("password"),
        v.string("password"),
        v.minLength(8, "password"),
      ],
      confirmPassword: [
        v.required("confirmPassword"),
        v.matchField("password", "confirmPassword"),
      ],
    },
  }),
  authController.resetPassword,
);
router.get(
  "/validate-reset-token",
  validate({
    query: {
      token: [
        v.required("token"),
        v.regex(/^[a-f0-9]{64}$/i, "token is invalid."),
      ],
    },
  }),
  authController.validateResetToken,
);

module.exports = router;
