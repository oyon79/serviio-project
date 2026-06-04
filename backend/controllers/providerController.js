const db = require("../config/db");

function shapeProviderRow(row) {
  return {
    ...row,
    full_name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
  };
}

// Get all verified providers
exports.getAllProviders = async (req, res) => {
  try {
    // Primary query: include verification flag if available
    const query = `
            SELECT 
                u.id, u.first_name, u.last_name, u.phone,
                p.service_type, p.experience_summary, p.location, p.is_available, p.is_verified
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
                    p.service_type, p.experience_summary, p.location, p.is_available
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
        u.id, u.first_name, u.last_name, u.email, u.phone,
        p.id as profile_id, p.service_type, p.experience_summary,
        p.location, p.nid_number, p.is_available, p.is_verified
      FROM users u
      JOIN provider_profiles p ON u.id = p.user_id
      WHERE u.id = ? AND u.role = 'provider'
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
        p.location, p.nid_number, p.is_available, p.is_verified
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
        p.location, p.nid_number, p.is_available, p.is_verified
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
