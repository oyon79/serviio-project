const db = require("../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const {
  sendPasswordResetOtp,
  sendRegistrationOtp,
} = require("../services/smsService");

const JWT_SECRET = process.env.JWT_SECRET;
function positiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const PASSWORD_RESET_EXPIRY_MINUTES = positiveIntegerEnv(
  "PASSWORD_RESET_EXPIRY_MINUTES",
  15,
);
const PASSWORD_RESET_MAX_ATTEMPTS = positiveIntegerEnv(
  "PASSWORD_RESET_MAX_ATTEMPTS",
  5,
);
const REGISTRATION_VERIFICATION_EXPIRY_MINUTES = positiveIntegerEnv(
  "REGISTRATION_VERIFICATION_EXPIRY_MINUTES",
  15,
);
const REGISTRATION_VERIFICATION_EXPIRY_SQL_INTERVAL = Math.max(
  1,
  Math.floor(REGISTRATION_VERIFICATION_EXPIRY_MINUTES),
);
const REGISTRATION_VERIFICATION_MAX_ATTEMPTS = positiveIntegerEnv(
  "REGISTRATION_VERIFICATION_MAX_ATTEMPTS",
  5,
);
const LOGIN_MAX_FAILED_ATTEMPTS = positiveIntegerEnv(
  "LOGIN_MAX_FAILED_ATTEMPTS",
  5,
);
const LOGIN_LOCK_MINUTES = positiveIntegerEnv("LOGIN_LOCK_MINUTES", 15);
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

function isRegistrationVerificationRequired() {
  const value = process.env.REGISTRATION_VERIFICATION_REQUIRED;
  if (typeof value === "string" && value.trim() !== "") {
    return value.toLowerCase() === "true";
  }
  return process.env.NODE_ENV === "production";
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

function getRegistrationVerificationExpiryDate() {
  return new Date(
    Date.now() + REGISTRATION_VERIFICATION_EXPIRY_MINUTES * 60 * 1000,
  );
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

async function getLoginAttempt(email, ipAddress) {
  const [rows] = await db.query(
    `SELECT id, attempt_count, locked_until
     FROM auth_login_attempts
     WHERE email = ? AND ip_address = ?
     LIMIT 1`,
    [email, ipAddress],
  );
  return rows[0] || null;
}

async function recordFailedLogin(email, ipAddress) {
  await db.query(
    `INSERT INTO auth_login_attempts
      (email, ip_address, attempt_count, locked_until, last_attempt_at)
     VALUES (?, ?, 1, NULL, NOW())
     ON DUPLICATE KEY UPDATE
       attempt_count = attempt_count + 1,
       locked_until = IF(
         attempt_count + 1 >= ?,
         DATE_ADD(NOW(), INTERVAL ? MINUTE),
         locked_until
       ),
       last_attempt_at = NOW()`,
    [email, ipAddress, LOGIN_MAX_FAILED_ATTEMPTS, LOGIN_LOCK_MINUTES],
  );
}

async function clearLoginAttempt(email, ipAddress) {
  await db.query(
    "DELETE FROM auth_login_attempts WHERE email = ? AND ip_address = ?",
    [email, ipAddress],
  );
}

function looksLikePlaceholder(value) {
  return /(?:example\.com|replace[_-]?this|change[_-]?me|your[_-]|placeholder)/i.test(
    String(value || ""),
  );
}

function createEmailTransporter() {
  if (
    !EMAIL_HOST ||
    !EMAIL_USER ||
    !EMAIL_PASS ||
    looksLikePlaceholder(EMAIL_HOST) ||
    looksLikePlaceholder(EMAIL_USER) ||
    looksLikePlaceholder(EMAIL_PASS)
  ) {
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

function buildAuthToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function buildAuthUserPayload(user) {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    account_verified: Boolean(user.account_verified),
  };
}

async function sendRegistrationVerificationEmail({ user, otp }) {
  const transporter = createEmailTransporter();
  if (!transporter) return "not_configured";

  const subject = "SERVIIO Account Verification Code";
  const text =
    `Hello ${user.first_name || "there"},\n\n` +
    `Your SERVIIO account verification code is ${otp}. ` +
    `It expires in ${REGISTRATION_VERIFICATION_EXPIRY_MINUTES} minutes.\n\n` +
    `If you did not create this account, you can ignore this message.\n\n` +
    `Thanks,\nSERVIIO Team`;
  const html =
    `<!DOCTYPE html><html><body><p>Hello ${user.first_name || "there"},</p>` +
    `<p>Your SERVIIO account verification code is ` +
    `<strong style="font-size:20px;letter-spacing:3px;">${otp}</strong>.</p>` +
    `<p>It expires in ${REGISTRATION_VERIFICATION_EXPIRY_MINUTES} minutes.</p>` +
    `<p>If you did not create this account, you can ignore this message.</p>` +
    `<p>Thanks,<br/>SERVIIO Team</p></body></html>`;

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject,
      text,
      html,
    });
    return "sent";
  } catch (error) {
    console.error("Registration verification email delivery failed:", error);
    return "failed";
  }
}

async function createRegistrationVerificationRequest({
  user,
  requestedIp,
  executor = db,
}) {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, await bcrypt.genSalt(12));
  const expiresAt = getRegistrationVerificationExpiryDate();

  await executor.query(
    `UPDATE registration_verification_requests
     SET status = 'EXPIRED'
     WHERE user_id = ? AND status = 'PENDING'`,
    [user.id],
  );

  const [result] = await executor.query(
    `INSERT INTO registration_verification_requests
      (user_id, email, phone, otp_hash, channel, requested_ip, expires_at)
     VALUES (?, ?, ?, ?, 'EMAIL', ?, DATE_ADD(NOW(), INTERVAL ${REGISTRATION_VERIFICATION_EXPIRY_SQL_INTERVAL} MINUTE))`,
    [
      user.id,
      user.email,
      user.phone || null,
      otpHash,
      requestedIp,
    ],
  );

  return {
    id: result.insertId,
    otp,
    expiresAt,
  };
}

async function deliverRegistrationVerificationCode({ user, otp }) {
  const emailStatus = await sendRegistrationVerificationEmail({ user, otp });
  let smsStatus = "not_configured";
  let smsResult = null;

  if (user.phone) {
    smsResult = await sendRegistrationOtp({ to: user.phone, otp });
    smsStatus = smsResult.sent ? "sent" : "failed";
    if (!smsResult.sent) {
      console.error("Registration verification SMS delivery failed:", smsResult);
    }
  }

  const channel =
    emailStatus === "sent" && smsStatus === "sent"
      ? "EMAIL_SMS"
      : smsStatus === "sent"
        ? "SMS"
        : emailStatus === "sent"
          ? "EMAIL"
          : "MANUAL";

  return {
    channel,
    delivered: emailStatus === "sent" || smsStatus === "sent",
    emailStatus,
    smsStatus,
  };
}

exports.register = async (req, res) => {
  const { first_name, last_name, email, phone, password, role, nid } = req.body;
  const normalizedEmail = email ? email.trim().toLowerCase() : "";
  const normalizedRole = role === "provider" ? "provider" : "customer";

  if (role === "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin accounts cannot be self-registered.",
    });
  }

  if (!first_name || !last_name || !normalizedEmail || !password) {
    return res.status(400).json({
      success: false,
      message: "first_name, last_name, email, and password are required.",
    });
  }

  if (normalizedRole === "provider") {
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
    const [existingUsers] = normalizedPhone
      ? await db.query(
          "SELECT id FROM users WHERE email = ? OR phone = ? LIMIT 1",
          [normalizedEmail, normalizedPhone],
        )
      : await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [
          normalizedEmail,
        ]);

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A user with this email or phone already exists.",
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    const verificationRequired = isRegistrationVerificationRequired();

    const [result] = await db.query(
      `INSERT INTO users
        (first_name, last_name, email, phone, password, role, account_verified, email_verified_at, phone_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        first_name.trim(),
        last_name.trim(),
        normalizedEmail,
        normalizedPhone,
        hashedPassword,
        normalizedRole,
        verificationRequired ? 0 : 1,
        verificationRequired ? null : new Date(),
        !verificationRequired && normalizedPhone ? new Date() : null,
      ],
    );

    const user = {
      id: result.insertId,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone || null,
      role: normalizedRole,
      account_verified: !verificationRequired,
    };

    if (normalizedRole === "provider") {
      await db.query(
        "INSERT INTO provider_profiles (user_id, service_type, location, nid_number) VALUES (?, ?, ?, ?)",
        [result.insertId, "Unspecified", "Unspecified", nid],
      );
    }

    if (verificationRequired) {
      const verification = await createRegistrationVerificationRequest({
        user,
        requestedIp: getClientIp(req),
      });
      const delivery = await deliverRegistrationVerificationCode({
        user,
        otp: verification.otp,
      });

      await db.query(
        `UPDATE registration_verification_requests
         SET channel = ?
         WHERE id = ?`,
        [delivery.channel, verification.id],
      );

      const payload = {
        success: true,
        message: delivery.delivered
          ? "Account created. Please verify the OTP sent to your email or phone."
          : "Account created, but the verification code could not be delivered. Please use resend after delivery is configured.",
        verification_required: true,
        delivery_status: delivery.delivered ? "sent" : "failed",
        user: buildAuthUserPayload(user),
      };

      if (!delivery.delivered && !IS_PRODUCTION) {
        payload.message =
          "Account created. Use the local development verification code below.";
        payload.otp = verification.otp;
      }

      return res.status(201).json(payload);
    }

    const token = buildAuthToken(user);

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      token,
      verification_required: false,
      user: buildAuthUserPayload(user),
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during registration.",
    });
  }
};

exports.resendRegistrationOtp = async (req, res) => {
  const normalizedEmail = req.body.email ? req.body.email.trim().toLowerCase() : "";

  if (!normalizedEmail) {
    return res.status(400).json({
      success: false,
      message: "Email is required.",
    });
  }

  try {
    const [users] = await db.query(
      `SELECT id, first_name, last_name, email, phone, role, is_active, account_verified
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [normalizedEmail],
    );

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "If this account needs verification, a new code will be sent.",
      });
    }

    const user = users[0];
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "This account is disabled. Please contact support.",
      });
    }

    if (user.account_verified) {
      return res.status(200).json({
        success: true,
        message: "This account is already verified. You can sign in.",
        already_verified: true,
      });
    }

    const verification = await createRegistrationVerificationRequest({
      user,
      requestedIp: getClientIp(req),
    });
    const delivery = await deliverRegistrationVerificationCode({
      user,
      otp: verification.otp,
    });

    await db.query(
      `UPDATE registration_verification_requests
       SET channel = ?
       WHERE id = ?`,
      [delivery.channel, verification.id],
    );

    const payload = {
      success: true,
      message: delivery.delivered
        ? "A new verification code has been sent."
        : "A new verification code was generated, but delivery is not configured.",
      delivery_status: delivery.delivered ? "sent" : "failed",
    };

    if (!delivery.delivered && !IS_PRODUCTION) {
      payload.otp = verification.otp;
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Resend registration verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while sending verification code.",
    });
  }
};

exports.verifyRegistration = async (req, res) => {
  const normalizedEmail = req.body.email ? req.body.email.trim().toLowerCase() : "";
  const otp = String(req.body.otp || "").trim();

  if (!normalizedEmail || !otp) {
    return res.status(400).json({
      success: false,
      message: "Email and OTP are required.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT r.id AS request_id, r.user_id, r.otp_hash, r.status,
              r.attempt_count, r.expires_at,
              TIMESTAMPDIFF(SECOND, NOW(), r.expires_at) AS seconds_until_expiry,
              u.id, u.first_name, u.last_name, u.email, u.phone, u.role,
              u.is_active, u.account_verified
       FROM registration_verification_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.email = ? AND r.status = 'PENDING'
       ORDER BY r.created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification code.",
      });
    }

    const request = rows[0];
    if (!request.is_active) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "This account is disabled. Please contact support.",
      });
    }

    if (request.account_verified) {
      await connection.query(
        "UPDATE registration_verification_requests SET status = 'VERIFIED', verified_at = NOW() WHERE id = ?",
        [request.request_id],
      );
      await connection.commit();
      const token = buildAuthToken(request);
      return res.status(200).json({
        success: true,
        message: "Account already verified.",
        token,
        user: buildAuthUserPayload({ ...request, account_verified: true }),
      });
    }

    if (Number(request.seconds_until_expiry) <= 0) {
      await connection.query(
        "UPDATE registration_verification_requests SET status = 'EXPIRED' WHERE id = ?",
        [request.request_id],
      );
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "This verification code has expired. Please request a new one.",
      });
    }

    if (request.attempt_count >= REGISTRATION_VERIFICATION_MAX_ATTEMPTS) {
      await connection.query(
        "UPDATE registration_verification_requests SET status = 'EXPIRED' WHERE id = ?",
        [request.request_id],
      );
      await connection.rollback();
      return res.status(429).json({
        success: false,
        message: "Too many invalid attempts. Please request a new code.",
      });
    }

    const otpMatches = await bcrypt.compare(otp, request.otp_hash);
    if (!otpMatches) {
      await connection.query(
        "UPDATE registration_verification_requests SET attempt_count = attempt_count + 1 WHERE id = ?",
        [request.request_id],
      );
      await connection.commit();
      return res.status(400).json({
        success: false,
        message: "Invalid verification code.",
      });
    }

    await connection.query(
      `UPDATE users
       SET account_verified = TRUE,
           email_verified_at = COALESCE(email_verified_at, NOW()),
           phone_verified_at = IF(phone IS NULL OR phone = '', phone_verified_at, COALESCE(phone_verified_at, NOW()))
       WHERE id = ?`,
      [request.id],
    );
    await connection.query(
      `UPDATE registration_verification_requests
       SET status = 'VERIFIED', verified_at = NOW()
       WHERE id = ?`,
      [request.request_id],
    );

    await connection.commit();

    const verifiedUser = { ...request, account_verified: true };
    const token = buildAuthToken(verifiedUser);

    return res.status(200).json({
      success: true,
      message: "Account verified successfully.",
      token,
      user: buildAuthUserPayload(verifiedUser),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error("Verify registration error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying account.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email ? email.trim().toLowerCase() : "";
  const clientIp = getClientIp(req) || "unknown";

  if (!normalizedEmail || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  try {
    const attempt = await getLoginAttempt(normalizedEmail, clientIp);
    if (
      attempt?.locked_until &&
      new Date(attempt.locked_until).getTime() > Date.now()
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Too many failed login attempts. Please wait before trying again.",
      });
    }

    const [users] = await db.query(
      "SELECT id, first_name, last_name, email, phone, password, role, is_active, account_verified FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail],
    );

    if (users.length === 0) {
      await recordFailedLogin(normalizedEmail, clientIp);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = users[0];
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "This account is disabled. Please contact support.",
      });
    }

    if (!user.account_verified) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your account before signing in. Use the registration OTP sent to your email or phone.",
        verification_required: true,
        email: user.email,
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      await recordFailedLogin(normalizedEmail, clientIp);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    await clearLoginAttempt(normalizedEmail, clientIp);

    const token = buildAuthToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: buildAuthUserPayload(user),
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
    let smsSendStatus = null;
    let smsResult = null;

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

    if (user.phone) {
      smsResult = await sendPasswordResetOtp({
        to: user.phone,
        otp,
        resetUrl,
      });
      smsSendStatus = smsResult.sent ? "sent" : "failed";
      if (!smsResult.sent) {
        console.error("Password reset SMS delivery failed:", smsResult);
      }
    }

    const deliveryChannel =
      emailSendStatus === "sent" && smsSendStatus === "sent"
        ? "EMAIL_SMS"
        : smsSendStatus === "sent"
          ? "SMS"
          : !transporter && !user.phone
            ? "MANUAL"
            : "EMAIL";
    await db.query(
      `UPDATE password_reset_requests
       SET channel = ?
       WHERE reset_token_hash = ?`,
      [deliveryChannel, resetTokenHash],
    );

    const responsePayload = {
      success: true,
      message:
        "If an account exists for this email, password reset instructions have been sent.",
    };

    if (!transporter && smsSendStatus !== "sent" && !IS_PRODUCTION) {
      responsePayload.message =
        "Password reset instructions were generated, but email delivery is not configured. Use the local development link and code below.";
      responsePayload.resetUrl = resetUrl;
      responsePayload.otp = otp;
    } else if (emailSendStatus !== "sent" && smsSendStatus !== "sent") {
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

exports.getMe = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const [rows] = await db.query(
      `SELECT id, first_name, last_name, email, phone, role, is_active,
              account_verified, email_verified_at, phone_verified_at,
              created_at, updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId],
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(404).json({
        success: false,
        message: "Account not found or inactive.",
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while loading account profile.",
    });
  }
};

exports.updateMe = async (req, res) => {
  const userId = req.user?.id;
  const firstName = String(req.body.first_name || "").trim();
  const lastName = String(req.body.last_name || "").trim();
  const phone = String(req.body.phone || "").trim();

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (!firstName || !lastName) {
    return res.status(400).json({
      success: false,
      message: "First name and last name are required.",
    });
  }

  if (phone && !/^01\d{9}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message:
        "Please enter a valid Bangladeshi phone number (11 digits, starting with 01).",
    });
  }

  try {
    if (phone) {
      const [existingRows] = await db.query(
        "SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1",
        [phone, userId],
      );
      if (existingRows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "This phone number is already used by another account.",
        });
      }
    }

    await db.query(
      `UPDATE users
       SET first_name = ?, last_name = ?, phone = ?
       WHERE id = ?`,
      [firstName, lastName, phone || null, userId],
    );

    const [updatedRows] = await db.query(
      `SELECT id, first_name, last_name, email, phone, role, is_active,
              account_verified, email_verified_at, phone_verified_at,
              created_at, updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId],
    );

    return res.status(200).json({
      success: true,
      message: "Account profile updated.",
      data: updatedRows[0],
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating account profile.",
    });
  }
};
