const db = require("../config/db");
const { createAdminNotifications } = require("../services/notificationService");
const {
  verifyProviderDocument,
} = require("../services/identityVerificationService");

function shapeProviderRow(row) {
  return {
    ...row,
    full_name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
  };
}

const allowedVerificationDocuments = new Set([
  "NID",
  "POLICE_CLEARANCE",
  "SKILL_CERTIFICATE",
  "LIVE_SELFIE",
  "EXPERIENCE_PROOF",
  "OTHER",
]);

async function getMyProfileRecord(userId) {
  const [rows] = await db.query(
    "SELECT id, user_id, verification_status FROM provider_profiles WHERE user_id = ? LIMIT 1",
    [userId],
  );
  return rows[0] || null;
}

async function insertVerificationAudit({
  providerProfileId,
  providerUserId,
  action,
  oldStatus = null,
  newStatus = null,
  actorId = null,
  notes = null,
}) {
  await db.query(
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

// Get all verified providers
exports.getAllProviders = async (req, res) => {
  try {
    // Primary query: include verification flag if available
    const query = `
            SELECT 
                u.id, u.first_name, u.last_name, u.phone,
                p.service_type, p.experience_summary, p.location,
                p.is_available, p.is_verified, p.hourly_rate,
                p.total_reviews, p.average_rating
            FROM users u
            JOIN provider_profiles p ON u.id = p.user_id
            WHERE u.role = 'provider' AND (p.is_verified = 1 OR p.is_verified = TRUE)
        `;

    try {
      const [providers] = await db.query(query);
      return res
        .status(200)
        .json({ success: true, count: providers.length, data: providers });
    } catch (err) {
      // If the DB does not have the 'is_verified' column (older schema), fallback to a safer query
      if (
        err &&
        (err.code === "ER_BAD_FIELD_ERROR" ||
          /is_verified/.test(err.sqlMessage || ""))
      ) {
        console.warn(
          "is_verified column missing — falling back to legacy provider query",
        );
        const fallback = `
                SELECT 
                    u.id, u.first_name, u.last_name, u.phone,
                    p.service_type, p.experience_summary, p.location,
                    p.is_available, p.hourly_rate,
                    p.total_reviews, p.average_rating
                FROM users u
                JOIN provider_profiles p ON u.id = p.user_id
                WHERE u.role = 'provider'
            `;
        const [providers] = await db.query(fallback);
        // Add a nullable is_verified field to keep response shape consistent
        const shaped = providers.map((p) => ({ ...p, is_verified: null }));
        return res
          .status(200)
          .json({ success: true, count: shaped.length, data: shaped });
      }
      throw err;
    }
  } catch (error) {
    console.error("Error fetching providers:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getProviderById = async (req, res) => {
  const providerId = req.params.id;

  try {
    const query = `
      SELECT
        u.id, u.first_name, u.last_name,
        p.id as profile_id, p.service_type, p.experience_summary,
        p.location, p.is_available, p.is_verified,
        p.verification_status, p.verification_submitted_at,
        p.verified_at,
        p.hourly_rate, p.total_reviews, p.average_rating
      FROM users u
      JOIN provider_profiles p ON u.id = p.user_id
      WHERE u.id = ? AND u.role = 'provider'
        AND (p.is_verified = 1 OR p.is_verified = TRUE)
      LIMIT 1
    `;
    const [rows] = await db.query(query, [providerId]);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Provider not found" });
    }

    return res
      .status(200)
      .json({ success: true, data: shapeProviderRow(rows[0]) });
  } catch (error) {
    console.error("Error fetching provider by id:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getMyProviderProfile = async (req, res) => {
  const userId = req.user && req.user.id;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  try {
    const query = `
      SELECT
        u.id, u.first_name, u.last_name, u.email, u.phone,
        p.id as profile_id, p.service_type, p.experience_summary,
        p.location, p.nid_number, p.is_available, p.is_verified,
        p.verification_status, p.verification_submitted_at,
        p.verified_at, p.verification_notes,
        p.hourly_rate, p.total_reviews, p.average_rating
      FROM users u
      JOIN provider_profiles p ON u.id = p.user_id
      WHERE u.id = ? AND u.role = 'provider'
      LIMIT 1
    `;
    const [rows] = await db.query(query, [userId]);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }

    return res
      .status(200)
      .json({ success: true, data: shapeProviderRow(rows[0]) });
  } catch (error) {
    console.error("Error fetching provider profile:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateMyAvailability = async (req, res) => {
  const userId = req.user && req.user.id;
  const { is_available } = req.body;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  if (typeof is_available !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "is_available must be a boolean value",
    });
  }

  try {
    const [result] = await db.query(
      "UPDATE provider_profiles SET is_available = ? WHERE user_id = ?",
      [is_available, userId],
    );

    if (!result.affectedRows) {
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Availability updated",
      data: { is_available },
    });
  } catch (error) {
    console.error("Error updating availability:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateMySettings = async (req, res) => {
  const userId = req.user && req.user.id;
  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  const {
    first_name,
    last_name,
    email,
    phone,
    service_type,
    location,
    experience_summary,
    nid_number,
  } = req.body;

  const userFields = {};
  const profileFields = {};

  if (first_name !== undefined) userFields.first_name = first_name.trim();
  if (last_name !== undefined) userFields.last_name = last_name.trim();
  if (email !== undefined) userFields.email = email.trim();
  if (phone !== undefined) userFields.phone = phone.trim();
  if (service_type !== undefined)
    profileFields.service_type = service_type.trim();
  if (location !== undefined) profileFields.location = location.trim();
  if (experience_summary !== undefined)
    profileFields.experience_summary = experience_summary.trim();
  if (nid_number !== undefined) profileFields.nid_number = nid_number.trim();

  if (
    Object.keys(userFields).length === 0 &&
    Object.keys(profileFields).length === 0
  ) {
    return res.status(400).json({
      success: false,
      message: "No settings values provided to update",
    });
  }

  try {
    if (Object.keys(userFields).length > 0) {
      const userSet = Object.keys(userFields)
        .map((field) => `${field} = ?`)
        .join(", ");
      const userValues = Object.values(userFields);
      userValues.push(userId);
      await db.query(`UPDATE users SET ${userSet} WHERE id = ?`, userValues);
    }

    if (Object.keys(profileFields).length > 0) {
      const profileSet = Object.keys(profileFields)
        .map((field) => `${field} = ?`)
        .join(", ");
      const profileValues = Object.values(profileFields);
      profileValues.push(userId);
      const [profileResult] = await db.query(
        `UPDATE provider_profiles SET ${profileSet} WHERE user_id = ?`,
        profileValues,
      );

      if (!profileResult.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Provider profile not found",
        });
      }
    }

    const query = `
      SELECT
        u.id, u.first_name, u.last_name, u.email, u.phone,
        p.id as profile_id, p.service_type, p.experience_summary,
        p.location, p.nid_number, p.is_available, p.is_verified,
        p.verification_status, p.verification_submitted_at,
        p.verified_at, p.verification_notes,
        p.hourly_rate, p.total_reviews, p.average_rating
      FROM users u
      JOIN provider_profiles p ON u.id = p.user_id
      WHERE u.id = ? AND u.role = 'provider'
      LIMIT 1
    `;
    const [rows] = await db.query(query, [userId]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      data: shapeProviderRow(rows[0]),
    });
  } catch (error) {
    console.error("Error updating provider settings:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email already exists. Please use a different email.",
      });
    }
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getMyVerification = async (req, res) => {
  const userId = req.user && req.user.id;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  try {
    const [profileRows] = await db.query(
      `SELECT id, user_id, nid_number, is_verified, verification_status,
              verification_submitted_at, verified_at, verification_notes
       FROM provider_profiles
       WHERE user_id = ?
       LIMIT 1`,
      [userId],
    );

    if (profileRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }

    const profile = profileRows[0];
    const [documents] = await db.query(
      `SELECT id, document_type, document_number, document_url, file_name,
              file_mime, status, external_verification_status,
              external_verification_reference, reviewer_notes, reviewed_at, created_at
       FROM provider_verification_documents
       WHERE provider_profile_id = ?
       ORDER BY created_at DESC`,
      [profile.id],
    );
    const [auditLogs] = await db.query(
      `SELECT action, old_status, new_status, actor_id, notes, created_at
       FROM provider_verification_audit_logs
       WHERE provider_profile_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [profile.id],
    );

    return res.status(200).json({
      success: true,
      data: {
        profile,
        documents,
        audit_logs: auditLogs,
      },
    });
  } catch (error) {
    console.error("Error fetching provider verification:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching verification status.",
    });
  }
};

exports.submitVerificationDocument = async (req, res) => {
  const userId = req.user && req.user.id;
  const uploadedFile = req.file || null;
  const {
    document_type,
    document_number,
    document_url: bodyDocumentUrl,
    file_name: bodyFileName,
    file_mime: bodyFileMime,
    notes,
  } = req.body;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  const normalizedType = String(document_type || "").toUpperCase();
  if (!allowedVerificationDocuments.has(normalizedType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid document_type.",
    });
  }

  const storedDocumentUrl = uploadedFile
    ? pathFromProjectUpload(uploadedFile.path)
    : bodyDocumentUrl || null;
  const storedFileName = uploadedFile
    ? uploadedFile.originalname
    : bodyFileName || null;
  const storedFileMime = uploadedFile
    ? uploadedFile.mimetype
    : bodyFileMime || null;

  if (!document_number && !storedDocumentUrl && !storedFileName) {
    return res.status(400).json({
      success: false,
      message:
        "Provide at least one document reference: document_number, document_url, or file_name.",
    });
  }

  try {
    const profile = await getMyProfileRecord(userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }

    const [userRows] = await db.query(
      "SELECT first_name, last_name, phone FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    const submitter = userRows[0] || {};
    const externalVerification = await verifyProviderDocument({
      documentType: normalizedType,
      documentNumber: document_number,
      fullName: `${submitter.first_name || ""} ${submitter.last_name || ""}`.trim(),
      phone: submitter.phone || null,
    });

    const [result] = await db.query(
      `INSERT INTO provider_verification_documents
        (provider_profile_id, provider_user_id, document_type, document_number,
         document_url, file_name, file_mime, external_verification_status,
         external_verification_reference, external_verification_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.id,
        userId,
        normalizedType,
        document_number || null,
        storedDocumentUrl,
        storedFileName,
        storedFileMime,
        externalVerification.status || "NOT_CHECKED",
        externalVerification.reference || null,
        externalVerification.payload
          ? JSON.stringify(externalVerification.payload)
          : externalVerification.message || null,
      ],
    );

    if (profile.verification_status === "NOT_SUBMITTED") {
      await db.query(
        "UPDATE provider_profiles SET verification_status = 'PENDING' WHERE id = ?",
        [profile.id],
      );
    }

    await insertVerificationAudit({
      providerProfileId: profile.id,
      providerUserId: userId,
      action: "DOCUMENT_SUBMITTED",
      oldStatus: profile.verification_status,
      newStatus:
        profile.verification_status === "NOT_SUBMITTED"
          ? "PENDING"
          : profile.verification_status,
      actorId: userId,
      notes: notes || `${normalizedType} document submitted.`,
    });

    return res.status(201).json({
      success: true,
      message: "Verification document submitted.",
      data: {
        id: result.insertId,
        document_type: normalizedType,
        status: "PENDING",
        external_verification_status:
          externalVerification.status || "NOT_CHECKED",
      },
    });
  } catch (error) {
    console.error("Error submitting verification document:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while submitting verification document.",
    });
  }
};

function pathFromProjectUpload(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const marker = "/backend/uploads/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) return null;
  return `uploads/${normalized.slice(markerIndex + marker.length)}`;
}

exports.submitVerificationForReview = async (req, res) => {
  const userId = req.user && req.user.id;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  try {
    const profile = await getMyProfileRecord(userId);
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }

    const [documentRows] = await db.query(
      "SELECT COUNT(*) AS document_count FROM provider_verification_documents WHERE provider_profile_id = ?",
      [profile.id],
    );

    if (!documentRows[0].document_count) {
      return res.status(400).json({
        success: false,
        message: "Submit at least one verification document before review.",
      });
    }

    await db.query(
      `UPDATE provider_profiles
       SET verification_status = 'UNDER_REVIEW',
           verification_submitted_at = NOW()
       WHERE id = ?`,
      [profile.id],
    );

    await insertVerificationAudit({
      providerProfileId: profile.id,
      providerUserId: userId,
      action: "SUBMITTED_FOR_REVIEW",
      oldStatus: profile.verification_status,
      newStatus: "UNDER_REVIEW",
      actorId: userId,
      notes: "Provider submitted verification profile for admin review.",
    });
    await createAdminNotifications({
      notification_type: "KYC_SUBMITTED",
      title: "Provider KYC submitted",
      message: `Provider #${userId} submitted verification for review.`,
      entity_type: "PROVIDER_PROFILE",
      entity_id: profile.id,
      staff_roles: ["admin", "super_admin", "verification_officer"],
    });

    return res.status(200).json({
      success: true,
      message: "Verification submitted for review.",
      data: {
        verification_status: "UNDER_REVIEW",
      },
    });
  } catch (error) {
    console.error("Error submitting verification for review:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while submitting verification for review.",
    });
  }
};
