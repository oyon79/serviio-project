const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const JWT_SECRET = process.env.JWT_SECRET;
const PASSWORD_RESET_TOKEN_EXPIRY =
  process.env.PASSWORD_RESET_TOKEN_EXPIRY || "15m";
const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "http://localhost/serviio-project/frontend";
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT) || 587;
const EMAIL_SECURE = process.env.EMAIL_SECURE === "true";
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || "SERVIIO <no-reply@serviio.local>";
if (!JWT_SECRET) {
  console.error("Missing required environment variable: JWT_SECRET");
  process.exit(1);
}

function buildPasswordResetUrl(token) {
  return `${FRONTEND_BASE_URL.replace(/\/$/, "")}/reset-password.html?token=${encodeURIComponent(token)}`;
}

function createEmailTransporter() {
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_SECURE,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
}

exports.register = async (req, res) => {
  const { first_name, last_name, email, phone, password, role, nid } = req.body;
  const normalizedEmail = email ? email.trim().toLowerCase() : "";

  if (!first_name || !last_name || !normalizedEmail || !password) {
    return res.status(400).json({
      success: false,
      message: "first_name, last_name, email, and password are required.",
    });
  }

  if (role === "provider") {
    if (!nid) {
      return res.status(400).json({
        success: false,
        message: "NID is required for service providers.",
      });
    }
    const nidRegex = /^(?:\d{10}|\d{13}|\d{17})$/;
    if (!nidRegex.test(String(nid))) {
      return res.status(400).json({
        success: false,
        message: "Invalid NID format. Expected 10, 13, or 17 digits.",
      });
    }
  }

  try {
    const normalizedPhone = phone ? String(phone).trim() : "";
    const [existingUsers] = await db.query(
      "SELECT id FROM users WHERE email = ? OR phone = ? LIMIT 1",
      [normalizedEmail, normalizedPhone],
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A user with this email or phone already exists.",
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await db.query(
      "INSERT INTO users (first_name, last_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)",
      [
        first_name.trim(),
        last_name.trim(),
        normalizedEmail,
        normalizedPhone,
        hashedPassword,
        role === "provider"
          ? "provider"
          : role === "admin"
            ? "admin"
            : "customer",
      ],
    );

    if (role === "provider") {
      await db.query(
        "INSERT INTO provider_profiles (user_id, service_type, location, nid_number) VALUES (?, ?, ?, ?)",
        [result.insertId, "Unspecified", "Unspecified", nid],
      );
    }

    const token = jwt.sign(
      {
        id: result.insertId,
        role:
          role === "provider"
            ? "provider"
            : role === "admin"
              ? "admin"
              : "customer",
        email: normalizedEmail,
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      token,
      user: {
        id: result.insertId,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: normalizedEmail,
        phone: phone ? phone.trim() : null,
        role:
          role === "provider"
            ? "provider"
            : role === "admin"
              ? "admin"
              : "customer",
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during registration.",
    });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email ? email.trim().toLowerCase() : "";

  if (!normalizedEmail || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  try {
    const [users] = await db.query(
      "SELECT id, first_name, last_name, email, phone, password, role FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail],
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = users[0];
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during login.",
    });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email, phone } = req.body;
  const normalizedEmail = email ? email.trim().toLowerCase() : "";
  const normalizedPhone = phone ? String(phone).trim() : "";

  if (!normalizedEmail) {
    return res.status(400).json({
      success: false,
      message: "Please provide the email address associated with your account.",
    });
  }

  try {
    const [users] = await db.query(
      "SELECT id, email, phone, first_name, last_name FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail],
    );

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "If an account exists for this email, you will receive password reset instructions.",
      });
    }

    const user = users[0];

    if (user.phone && user.phone.trim() !== "" && !normalizedPhone) {
      return res.status(400).json({
        success: false,
        message:
          "For identity verification, please provide the phone number linked to your account.",
      });
    }

    if (
      user.phone &&
      user.phone.trim() !== "" &&
      normalizedPhone !== user.phone.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The phone number does not match the account owner. Please verify your identity and try again.",
      });
    }

    const resetToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        type: "password_reset",
      },
      JWT_SECRET,
      { expiresIn: PASSWORD_RESET_TOKEN_EXPIRY },
    );

    const resetUrl = buildPasswordResetUrl(resetToken);
    const emailSubject = "SERVIIO Password Reset Request";
    const emailText =
      `Hello ${user.first_name || "there"},\n\n` +
      `We received a request to reset your SERVIIO account password. ` +
      `Use the link below to choose a new password. This link will expire in ${PASSWORD_RESET_TOKEN_EXPIRY}.\n\n` +
      `${resetUrl}\n\n` +
      `If you did not request this, you can safely ignore this message.\n\n` +
      `Thanks,\nSERVIIO Team`;
    const emailHtml = `<!DOCTYPE html><html><body><p>Hello ${user.first_name || "there"},</p><p>We received a request to reset your SERVIIO account password. Use the button below to choose a new password. This link will expire in ${PASSWORD_RESET_TOKEN_EXPIRY}.</p><p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#007bff;color:#fff;text-decoration:none;border-radius:4px;">Reset Password</a></p><p>If you did not request this, you can ignore this message.</p><p>Thanks,<br/>SERVIIO Team</p></body></html>`;

    const transporter = createEmailTransporter();
    let emailSendStatus = null;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: EMAIL_FROM,
          to: user.email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml,
        });
        emailSendStatus = "sent";
      } catch (emailError) {
        console.error("Password reset email delivery failed:", emailError);
        emailSendStatus = "failed";
      }
    }

    const responsePayload = {
      success: true,
      message:
        "If an account exists for this email, password reset instructions have been sent.",
    };

    if (!transporter) {
      responsePayload.message =
        "Password reset link was generated, but email delivery is not configured. Please configure email settings and try again.";
      responsePayload.resetUrl = resetUrl;
    } else if (emailSendStatus !== "sent") {
      responsePayload.message =
        "A password reset link was generated, but email delivery failed. Please contact support or try again later.";
      responsePayload.resetUrl = resetUrl;
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while processing password reset request.",
    });
  }
};

exports.validateResetToken = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Reset token is required.",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== "password_reset") {
      return res.status(400).json({
        success: false,
        message: "Invalid reset token.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Reset token is valid.",
      email: decoded.email,
    });
  } catch (error) {
    console.error("Validate reset token error:", error);
    return res.status(400).json({
      success: false,
      message:
        error.name === "TokenExpiredError"
          ? "This password reset link has expired. Please request a new one."
          : "Invalid password reset token.",
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "Token, password, and confirmation are required.",
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "Password and confirmation do not match.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters long.",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== "password_reset") {
      return res.status(400).json({
        success: false,
        message: "Invalid password reset token.",
      });
    }

    const [users] = await db.query(
      "SELECT id, email FROM users WHERE id = ? AND email = ? LIMIT 1",
      [decoded.id, decoded.email],
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Account not found. Please request a new password reset link.",
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      await bcrypt.genSalt(12),
    );
    await db.query("UPDATE users SET password = ? WHERE id = ?", [
      hashedPassword,
      decoded.id,
    ]);

    return res.status(200).json({
      success: true,
      message:
        "Your password has been updated successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(400).json({
      success: false,
      message:
        error.name === "TokenExpiredError"
          ? "This password reset link has expired. Please request a new one."
          : "Invalid password reset token.",
    });
  }
};
