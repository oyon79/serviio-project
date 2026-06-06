const db = require("../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const JWT_SECRET = process.env.JWT_SECRET;
const PASSWORD_RESET_EXPIRY_MINUTES = Number(
  process.env.PASSWORD_RESET_EXPIRY_MINUTES || 15,
);
const PASSWORD_RESET_MAX_ATTEMPTS = Number(
  process.env.PASSWORD_RESET_MAX_ATTEMPTS || 5,
);
const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "http://localhost/serviio-project/frontend";
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT) || 587;
const EMAIL_SECURE = process.env.EMAIL_SECURE === "true";
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || "SERVIIO <no-reply@serviio.local>";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
if (!JWT_SECRET) {
  console.error("Missing required environment variable: JWT_SECRET");
  process.exit(1);
}

function buildPasswordResetUrl(token) {
  return `${FRONTEND_BASE_URL.replace(/\/$/, "")}/reset-password.html?token=${encodeURIComponent(token)}`;
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getResetExpiryDate() {
  return new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return "your email";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(name.length - visible.length, 2))}@${domain}`;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
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

    const resetToken = generateResetToken();
    const resetTokenHash = hashResetToken(resetToken);
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, await bcrypt.genSalt(12));
    const expiresAt = getResetExpiryDate();
    const resetUrl = buildPasswordResetUrl(resetToken);

    await db.query(
      `UPDATE password_reset_requests
       SET status = 'EXPIRED'
       WHERE user_id = ? AND status = 'REQUESTED'`,
      [user.id],
    );
    await db.query(
      `INSERT INTO password_reset_requests
        (user_id, email, reset_token_hash, otp_hash, channel, requested_ip, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.email,
        resetTokenHash,
        otpHash,
        "EMAIL",
        getClientIp(req),
        expiresAt,
      ],
    );

    const emailSubject = "SERVIIO Password Reset Request";
    const emailText =
      `Hello ${user.first_name || "there"},\n\n` +
      `We received a request to reset your SERVIIO account password. ` +
      `Use the link below and enter this one-time code: ${otp}. ` +
      `This code will expire in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.\n\n` +
      `${resetUrl}\n\n` +
      `If you did not request this, you can safely ignore this message.\n\n` +
      `Thanks,\nSERVIIO Team`;
    const emailHtml = `<!DOCTYPE html><html><body><p>Hello ${user.first_name || "there"},</p><p>We received a request to reset your SERVIIO account password.</p><p>Your one-time code is <strong style="font-size:20px;letter-spacing:3px;">${otp}</strong>. It expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.</p><p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#007bff;color:#fff;text-decoration:none;border-radius:4px;">Reset Password</a></p><p>If you did not request this, you can ignore this message.</p><p>Thanks,<br/>SERVIIO Team</p></body></html>`;

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

    if (!transporter && !IS_PRODUCTION) {
      responsePayload.message =
        "Password reset instructions were generated, but email delivery is not configured. Use the local development link and code below.";
      responsePayload.resetUrl = resetUrl;
      responsePayload.otp = otp;
    } else if (emailSendStatus !== "sent") {
      responsePayload.message =
        "Password reset instructions could not be delivered. Please try again later or contact support.";
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
    const tokenHash = hashResetToken(token);
    const [requests] = await db.query(
      `SELECT pr.id, pr.email, pr.expires_at, pr.status
       FROM password_reset_requests pr
       WHERE pr.reset_token_hash = ?
       LIMIT 1`,
      [tokenHash],
    );

    if (requests.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired password reset link.",
      });
    }

    const resetRequest = requests[0];
    if (
      resetRequest.status !== "REQUESTED" ||
      new Date(resetRequest.expires_at).getTime() < Date.now()
    ) {
      if (resetRequest.status === "REQUESTED") {
        await db.query(
          "UPDATE password_reset_requests SET status = 'EXPIRED' WHERE id = ?",
          [resetRequest.id],
        );
      }
      return res.status(400).json({
        success: false,
        message:
          "This password reset link has expired. Please request a new one.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Reset token is valid.",
      email: maskEmail(resetRequest.email),
      otp_required: true,
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
  const { token, otp, password, confirmPassword } = req.body;

  if (!token || !otp || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "Token, OTP, password, and confirmation are required.",
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

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const tokenHash = hashResetToken(token);
    const [requests] = await connection.query(
      `SELECT id, user_id, email, otp_hash, status, attempt_count, expires_at
       FROM password_reset_requests
       WHERE reset_token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenHash],
    );

    if (requests.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid password reset link.",
      });
    }

    const resetRequest = requests[0];
    if (
      resetRequest.status !== "REQUESTED" ||
      new Date(resetRequest.expires_at).getTime() < Date.now()
    ) {
      if (resetRequest.status === "REQUESTED") {
        await connection.query(
          "UPDATE password_reset_requests SET status = 'EXPIRED' WHERE id = ?",
          [resetRequest.id],
        );
      }
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message:
          "This password reset request has expired. Please request a new code.",
      });
    }

    if (resetRequest.attempt_count >= PASSWORD_RESET_MAX_ATTEMPTS) {
      await connection.query(
        "UPDATE password_reset_requests SET status = 'EXPIRED' WHERE id = ?",
        [resetRequest.id],
      );
      await connection.rollback();
      return res.status(429).json({
        success: false,
        message: "Too many invalid attempts. Please request a new reset code.",
      });
    }

    const otpMatches = await bcrypt.compare(
      String(otp).trim(),
      resetRequest.otp_hash,
    );
    if (!otpMatches) {
      await connection.query(
        "UPDATE password_reset_requests SET attempt_count = attempt_count + 1 WHERE id = ?",
        [resetRequest.id],
      );
      await connection.commit();
      return res.status(400).json({
        success: false,
        message: "Invalid reset code.",
      });
    }

    const [users] = await connection.query(
      "SELECT id, email FROM users WHERE id = ? AND email = ? LIMIT 1",
      [resetRequest.user_id, resetRequest.email],
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Account not found. Please request a new password reset link.",
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      await bcrypt.genSalt(12),
    );
    await connection.query("UPDATE users SET password = ? WHERE id = ?", [
      hashedPassword,
      resetRequest.user_id,
    ]);
    await connection.query(
      "UPDATE password_reset_requests SET status = 'USED', used_at = NOW() WHERE id = ?",
      [resetRequest.id],
    );
    await connection.query(
      `UPDATE password_reset_requests
       SET status = 'EXPIRED'
       WHERE user_id = ? AND status = 'REQUESTED' AND id <> ?`,
      [resetRequest.user_id, resetRequest.id],
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message:
        "Your password has been updated successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while resetting password.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
