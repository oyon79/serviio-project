const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const { createNotification } = require("../services/notificationService");

const allowedDocumentReviewStatuses = new Set(["APPROVED", "REJECTED"]);
const allowedProviderDecisions = new Set(["VERIFIED", "REJECTED"]);
const uploadsRoot = path.resolve(__dirname, "..", "uploads");

function isInsideDirectory(parentDir, targetPath) {
  const relative = path.relative(parentDir, targetPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function toNumber(value) {
  return Number(value || 0);
}

async function insertVerificationAudit(connection, {
  providerProfileId,
  providerUserId,
  action,
  oldStatus = null,
  newStatus = null,
  actorId = null,
  notes = null,
}) {
  await connection.query(
    `INSERT INTO provider_verification_audit_logs
      (provider_profile_id, provider_user_id, action, old_status, new_status, actor_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      providerProfileId,
      providerUserId,
      action,
      oldStatus,
      newStatus,
      actorId,
      notes,
    ],
  );
}

exports.getOverview = async (req, res) => {
  try {
    const [
      [userRows],
      [providerRows],
      [bookingRows],
      [ticketRows],
      [payoutRows],
      [paymentRows],
      [notificationRows],
      [emergencyRows],
    ] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) AS total_users,
           SUM(role = 'customer') AS customers,
           SUM(role = 'provider') AS providers,
           SUM(role IN ('admin', 'super_admin')) AS admins,
           SUM(role = 'support_agent') AS support_agents,
           SUM(role = 'verification_officer') AS verification_officers
         FROM users`,
      ),
      db.query(
        `SELECT
           COUNT(*) AS provider_profiles,
           SUM(is_verified = TRUE) AS verified_providers,
           SUM(is_available = TRUE) AS available_providers,
           SUM(verification_status IN ('PENDING', 'UNDER_REVIEW')) AS pending_kyc,
           SUM(verification_status = 'REJECTED') AS rejected_kyc
         FROM provider_profiles`,
      ),
      db.query(
        `SELECT
           COUNT(*) AS total_bookings,
           SUM(status = 'PENDING') AS pending_bookings,
           SUM(status IN ('ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS')) AS active_bookings,
           SUM(status = 'COMPLETED') AS completed_bookings,
           SUM(status = 'CANCELLED') AS cancelled_bookings
         FROM bookings`,
      ),
      db.query(
        `SELECT
           COUNT(*) AS total_tickets,
           SUM(status IN ('OPEN', 'IN_REVIEW')) AS open_tickets,
           SUM(priority IN ('HIGH', 'URGENT') AND status NOT IN ('RESOLVED', 'CLOSED')) AS urgent_tickets
         FROM support_tickets`,
      ),
      db.query(
        `SELECT
           COUNT(*) AS total_payouts,
           SUM(status = 'REQUESTED') AS requested_payouts,
           SUM(status = 'APPROVED') AS approved_payouts,
           COALESCE(SUM(CASE WHEN status IN ('REQUESTED','APPROVED') THEN amount ELSE 0 END), 0) AS pending_payout_amount
         FROM payout_requests`,
      ),
      db.query(
        `SELECT
           COALESCE(SUM(payment_amount), 0) AS paid_amount,
           COUNT(*) AS paid_bookings
         FROM bookings
         WHERE payment_status = 'PAID'`,
      ),
      db.query(
        `SELECT COUNT(*) AS unread_admin_notifications
         FROM notifications
         WHERE user_id = ? AND is_read = FALSE`,
        [req.user.id],
      ),
      db.query(
        `SELECT
           COUNT(*) AS total_emergencies,
           SUM(status = 'ACTIVE') AS active_emergencies
         FROM emergency_logs`,
      ),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        users: {
          total: toNumber(userRows[0].total_users),
          customers: toNumber(userRows[0].customers),
          providers: toNumber(userRows[0].providers),
          admins: toNumber(userRows[0].admins),
          support_agents: toNumber(userRows[0].support_agents),
          verification_officers: toNumber(userRows[0].verification_officers),
        },
        providers: {
          total: toNumber(providerRows[0].provider_profiles),
          verified: toNumber(providerRows[0].verified_providers),
          available: toNumber(providerRows[0].available_providers),
          pending_kyc: toNumber(providerRows[0].pending_kyc),
          rejected_kyc: toNumber(providerRows[0].rejected_kyc),
        },
        bookings: {
          total: toNumber(bookingRows[0].total_bookings),
          pending: toNumber(bookingRows[0].pending_bookings),
          active: toNumber(bookingRows[0].active_bookings),
          completed: toNumber(bookingRows[0].completed_bookings),
          cancelled: toNumber(bookingRows[0].cancelled_bookings),
        },
        support: {
          total: toNumber(ticketRows[0].total_tickets),
          open: toNumber(ticketRows[0].open_tickets),
          urgent: toNumber(ticketRows[0].urgent_tickets),
        },
        payouts: {
          total: toNumber(payoutRows[0].total_payouts),
          requested: toNumber(payoutRows[0].requested_payouts),
          approved: toNumber(payoutRows[0].approved_payouts),
          pending_amount: toNumber(payoutRows[0].pending_payout_amount),
        },
        payments: {
          paid_amount: toNumber(paymentRows[0].paid_amount),
          paid_bookings: toNumber(paymentRows[0].paid_bookings),
        },
        notifications: {
          unread: toNumber(notificationRows[0].unread_admin_notifications),
        },
        emergencies: {
          total: toNumber(emergencyRows[0].total_emergencies),
          active: toNumber(emergencyRows[0].active_emergencies),
        },
      },
    });
  } catch (error) {
    console.error("Admin getOverview error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching admin overview.",
    });
  }
};

exports.listBookings = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         b.id, b.service_type, b.job_location, b.booking_date, b.status,
         b.payment_status, b.payment_amount, b.is_emergency, b.created_at,
         customer.first_name AS customer_first_name,
         customer.last_name AS customer_last_name,
         customer.email AS customer_email,
         provider.first_name AS provider_first_name,
         provider.last_name AS provider_last_name,
         provider.email AS provider_email
       FROM bookings b
       JOIN users customer ON customer.id = b.customer_id
       JOIN users provider ON provider.id = b.provider_id
       ORDER BY b.created_at DESC
       LIMIT 50`,
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows.map((row) => ({
        ...row,
        customer_name: `${row.customer_first_name || ""} ${
          row.customer_last_name || ""
        }`.trim(),
        provider_name: `${row.provider_first_name || ""} ${
          row.provider_last_name || ""
        }`.trim(),
      })),
    });
  } catch (error) {
    console.error("Admin listBookings error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching bookings.",
    });
  }
};

exports.listEmergencyLogs = async (req, res) => {
  const status = req.query.status
    ? String(req.query.status).toUpperCase()
    : null;
  const values = [];
  let where = "";

  if (status) {
    if (!["ACTIVE", "RESOLVED", "CANCELLED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid emergency status.",
      });
    }
    where = "WHERE e.status = ?";
    values.push(status);
  }

  try {
    const [rows] = await db.query(
      `SELECT
         e.*, u.first_name, u.last_name, u.email, u.phone
       FROM emergency_logs e
       LEFT JOIN users u ON u.id = e.user_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT 100`,
      values,
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Admin listEmergencyLogs error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching emergency logs.",
    });
  }
};

exports.updateEmergencyStatus = async (req, res) => {
  const emergencyId = req.params.id;
  const status = String(req.body.status || "").toUpperCase();

  if (!["ACTIVE", "RESOLVED", "CANCELLED"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid emergency status.",
    });
  }

  try {
    const [result] = await db.query(
      "UPDATE emergency_logs SET status = ? WHERE id = ?",
      [status, emergencyId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Emergency log not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Emergency status updated.",
    });
  } catch (error) {
    console.error("Admin updateEmergencyStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating emergency status.",
    });
  }
};

// List all providers with profile info (admin only)
exports.listProviders = async (req, res) => {
  try {
    const query = `
      SELECT u.id as user_id, u.first_name, u.last_name, u.email, u.phone,
             p.id as profile_id, p.service_type, p.location, p.nid_number,
             p.is_verified, p.verification_status, p.verification_submitted_at,
             p.verified_at, p.verification_notes
      FROM users u
      JOIN provider_profiles p ON u.id = p.user_id
      WHERE u.role = 'provider'
      ORDER BY p.is_verified ASC, p.verification_submitted_at DESC, u.id DESC
    `;
    const [rows] = await db.query(query);
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error("Admin listProviders error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Verify a provider (set is_verified = true)
exports.verifyProvider = async (req, res) => {
  const profileId = req.params.profileId;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [profileRows] = await connection.query(
      "SELECT id, user_id, verification_status FROM provider_profiles WHERE id = ? LIMIT 1 FOR UPDATE",
      [profileId],
    );

    if (profileRows.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }

    const profile = profileRows[0];
    await connection.query(
      `UPDATE provider_profiles
       SET is_verified = TRUE,
           verification_status = 'VERIFIED',
           verified_at = NOW(),
           verification_notes = NULL
       WHERE id = ?`,
      [profileId],
    );
    await insertVerificationAudit(connection, {
      providerProfileId: profile.id,
      providerUserId: profile.user_id,
      action: "PROVIDER_APPROVED",
      oldStatus: profile.verification_status,
      newStatus: "VERIFIED",
      actorId: req.user.id,
      notes: "Provider verified from admin provider list.",
    });
    await createNotification(
      {
        user_id: profile.user_id,
        notification_type: "KYC_APPROVED",
        title: "Provider verification approved",
        message: "Your provider profile has been verified.",
        entity_type: "PROVIDER_PROFILE",
        entity_id: profile.id,
      },
      connection,
    );

    await connection.commit();
    res.status(200).json({ success: true, message: "Provider verified" });
  } catch (err) {
    await connection.rollback();
    console.error("Admin verifyProvider error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    connection.release();
  }
};

exports.listVerificationQueue = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         p.id AS profile_id, p.user_id, p.service_type, p.location, p.nid_number,
         p.is_verified, p.verification_status, p.verification_submitted_at,
         p.verified_at, p.verification_notes,
         u.first_name, u.last_name, u.email, u.phone,
         COUNT(d.id) AS document_count,
         SUM(d.status = 'PENDING') AS pending_documents,
         SUM(d.status = 'APPROVED') AS approved_documents,
         SUM(d.status = 'REJECTED') AS rejected_documents
       FROM provider_profiles p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN provider_verification_documents d ON d.provider_profile_id = p.id
       WHERE p.verification_status IN ('PENDING', 'UNDER_REVIEW', 'REJECTED')
          OR p.is_verified = FALSE
       GROUP BY p.id, p.user_id, p.service_type, p.location, p.nid_number,
                p.is_verified, p.verification_status, p.verification_submitted_at,
                p.verified_at, p.verification_notes,
                u.first_name, u.last_name, u.email, u.phone
       ORDER BY FIELD(p.verification_status, 'UNDER_REVIEW', 'PENDING', 'REJECTED', 'NOT_SUBMITTED'),
                p.verification_submitted_at DESC,
                p.id DESC`,
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Admin listVerificationQueue error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching verification queue.",
    });
  }
};

exports.getProviderVerificationDetails = async (req, res) => {
  const profileId = req.params.profileId;

  try {
    const [profileRows] = await db.query(
      `SELECT
         p.*, u.first_name, u.last_name, u.email, u.phone
       FROM provider_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = ?
       LIMIT 1`,
      [profileId],
    );

    if (profileRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }

    const [documents] = await db.query(
      `SELECT d.*, reviewer.first_name AS reviewer_first_name,
              reviewer.last_name AS reviewer_last_name
       FROM provider_verification_documents d
       LEFT JOIN users reviewer ON reviewer.id = d.reviewer_id
       WHERE d.provider_profile_id = ?
       ORDER BY d.created_at DESC`,
      [profileId],
    );
    const [auditLogs] = await db.query(
      `SELECT a.*, actor.first_name AS actor_first_name, actor.last_name AS actor_last_name
       FROM provider_verification_audit_logs a
       LEFT JOIN users actor ON actor.id = a.actor_id
       WHERE a.provider_profile_id = ?
       ORDER BY a.created_at DESC`,
      [profileId],
    );

    return res.status(200).json({
      success: true,
      data: {
        profile: profileRows[0],
        documents,
        audit_logs: auditLogs,
      },
    });
  } catch (error) {
    console.error("Admin getProviderVerificationDetails error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching verification details.",
    });
  }
};

exports.downloadVerificationDocument = async (req, res) => {
  const documentId = req.params.documentId;

  try {
    const [rows] = await db.query(
      `SELECT document_url, file_name
       FROM provider_verification_documents
       WHERE id = ?
       LIMIT 1`,
      [documentId],
    );

    if (rows.length === 0 || !rows[0].document_url) {
      return res.status(404).json({
        success: false,
        message: "Verification document file not found.",
      });
    }

    const documentUrl = String(rows[0].document_url || "");
    if (!documentUrl.replace(/\\/g, "/").startsWith("uploads/")) {
      return res.status(400).json({
        success: false,
        message: "Only locally uploaded verification files can be downloaded.",
      });
    }

    const resolvedPath = path.resolve(__dirname, "..", documentUrl);

    if (!isInsideDirectory(uploadsRoot, resolvedPath)) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification document path.",
      });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        success: false,
        message: "Verification document file not found.",
      });
    }

    return res.download(resolvedPath, rows[0].file_name || undefined);
  } catch (error) {
    console.error("Admin downloadVerificationDocument error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while downloading verification document.",
    });
  }
};

exports.reviewVerificationDocument = async (req, res) => {
  const documentId = req.params.documentId;
  const { status, reviewer_notes } = req.body;
  const normalizedStatus = String(status || "").toUpperCase();

  if (!allowedDocumentReviewStatuses.has(normalizedStatus)) {
    return res.status(400).json({
      success: false,
      message: "Document status must be APPROVED or REJECTED.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [documentRows] = await connection.query(
      `SELECT id, provider_profile_id, provider_user_id, status
       FROM provider_verification_documents
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [documentId],
    );

    if (documentRows.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Verification document not found" });
    }

    const document = documentRows[0];
    await connection.query(
      `UPDATE provider_verification_documents
       SET status = ?, reviewer_id = ?, reviewer_notes = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [normalizedStatus, req.user.id, reviewer_notes || null, documentId],
    );

    await insertVerificationAudit(connection, {
      providerProfileId: document.provider_profile_id,
      providerUserId: document.provider_user_id,
      action:
        normalizedStatus === "APPROVED"
          ? "DOCUMENT_APPROVED"
          : "DOCUMENT_REJECTED",
      oldStatus: document.status,
      newStatus: normalizedStatus,
      actorId: req.user.id,
      notes: reviewer_notes || null,
    });
    await createNotification(
      {
        user_id: document.provider_user_id,
        notification_type:
          normalizedStatus === "APPROVED"
            ? "KYC_DOCUMENT_APPROVED"
            : "KYC_DOCUMENT_REJECTED",
        title: "Verification document reviewed",
        message: `Your verification document was ${normalizedStatus.toLowerCase()}.`,
        entity_type: "VERIFICATION_DOCUMENT",
        entity_id: document.id,
      },
      connection,
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Verification document reviewed.",
      data: {
        id: documentId,
        status: normalizedStatus,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Admin reviewVerificationDocument error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while reviewing verification document.",
    });
  } finally {
    connection.release();
  }
};

exports.decideProviderVerification = async (req, res) => {
  const profileId = req.params.profileId;
  const { decision, notes } = req.body;
  const normalizedDecision = String(decision || "").toUpperCase();

  if (!allowedProviderDecisions.has(normalizedDecision)) {
    return res.status(400).json({
      success: false,
      message: "decision must be VERIFIED or REJECTED.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [profileRows] = await connection.query(
      "SELECT id, user_id, verification_status FROM provider_profiles WHERE id = ? LIMIT 1 FOR UPDATE",
      [profileId],
    );

    if (profileRows.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }

    const profile = profileRows[0];
    const isVerified = normalizedDecision === "VERIFIED";

    await connection.query(
      `UPDATE provider_profiles
       SET is_verified = ?,
           verification_status = ?,
           verified_at = ?,
           verification_notes = ?
       WHERE id = ?`,
      [
        isVerified,
        normalizedDecision,
        isVerified ? new Date() : null,
        notes || null,
        profileId,
      ],
    );

    await insertVerificationAudit(connection, {
      providerProfileId: profile.id,
      providerUserId: profile.user_id,
      action: isVerified ? "PROVIDER_APPROVED" : "PROVIDER_REJECTED",
      oldStatus: profile.verification_status,
      newStatus: normalizedDecision,
      actorId: req.user.id,
      notes: notes || null,
    });
    await createNotification(
      {
        user_id: profile.user_id,
        notification_type: isVerified ? "KYC_APPROVED" : "KYC_REJECTED",
        title: isVerified
          ? "Provider verification approved"
          : "Provider verification rejected",
        message: isVerified
          ? "Your provider profile has been verified."
          : notes || "Your provider verification was rejected.",
        entity_type: "PROVIDER_PROFILE",
        entity_id: profile.id,
      },
      connection,
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: isVerified ? "Provider verified." : "Provider rejected.",
      data: {
        profile_id: profileId,
        verification_status: normalizedDecision,
        is_verified: isVerified,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Admin decideProviderVerification error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deciding provider verification.",
    });
  } finally {
    connection.release();
  }
};
