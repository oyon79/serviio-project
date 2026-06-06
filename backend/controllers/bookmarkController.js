const db = require("../config/db");

function normalizeProviderId(value) {
  const providerId = Number(value);
  if (!Number.isInteger(providerId) || providerId <= 0) {
    return null;
  }
  return providerId;
}

function shapeBookmarkRow(row) {
  return {
    bookmark_id: row.bookmark_id,
    provider_id: row.provider_id,
    saved_at: row.saved_at,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
    phone: row.phone,
    service_type: row.service_type,
    experience_summary: row.experience_summary,
    location: row.location,
    is_available: row.is_available,
    is_verified: row.is_verified,
    hourly_rate: row.hourly_rate,
    total_reviews: row.total_reviews,
    average_rating: row.average_rating,
  };
}

async function providerExists(providerId) {
  const [rows] = await db.query(
    `SELECT u.id
     FROM users u
     INNER JOIN provider_profiles p ON p.user_id = u.id
     WHERE u.id = ? AND u.role = 'provider'
     LIMIT 1`,
    [providerId],
  );
  return rows.length > 0;
}

exports.getMyBookmarks = async (req, res) => {
  const customerId = req.user && req.user.id;
  if (!customerId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required." });
  }

  try {
    const [rows] = await db.query(
      `SELECT
        pb.id AS bookmark_id,
        pb.provider_id,
        pb.created_at AS saved_at,
        u.first_name,
        u.last_name,
        u.phone,
        p.service_type,
        p.experience_summary,
        p.location,
        p.is_available,
        p.is_verified,
        p.hourly_rate,
        p.total_reviews,
        p.average_rating
       FROM provider_bookmarks pb
       INNER JOIN users u ON u.id = pb.provider_id
       INNER JOIN provider_profiles p ON p.user_id = u.id
       WHERE pb.customer_id = ?
       ORDER BY pb.created_at DESC`,
      [customerId],
    );

    const bookmarks = rows.map(shapeBookmarkRow);
    return res.status(200).json({
      success: true,
      count: bookmarks.length,
      data: bookmarks,
    });
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching bookmarks.",
    });
  }
};

exports.getBookmarkStatus = async (req, res) => {
  const customerId = req.user && req.user.id;
  const providerId = normalizeProviderId(req.params.providerId);

  if (!customerId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required." });
  }

  if (!providerId) {
    return res
      .status(400)
      .json({ success: false, message: "Valid provider id is required." });
  }

  try {
    const [rows] = await db.query(
      "SELECT id FROM provider_bookmarks WHERE customer_id = ? AND provider_id = ? LIMIT 1",
      [customerId, providerId],
    );

    return res.status(200).json({
      success: true,
      data: {
        provider_id: providerId,
        is_bookmarked: rows.length > 0,
        bookmark_id: rows[0]?.id || null,
      },
    });
  } catch (error) {
    console.error("Error checking bookmark status:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while checking bookmark status.",
    });
  }
};

exports.addBookmark = async (req, res) => {
  const customerId = req.user && req.user.id;
  const providerId = normalizeProviderId(req.body.provider_id);

  if (!customerId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required." });
  }

  if (!providerId) {
    return res
      .status(400)
      .json({ success: false, message: "provider_id is required." });
  }

  if (String(providerId) === String(customerId)) {
    return res.status(400).json({
      success: false,
      message: "You cannot bookmark your own provider profile.",
    });
  }

  try {
    if (!(await providerExists(providerId))) {
      return res
        .status(404)
        .json({ success: false, message: "Provider not found." });
    }

    const [result] = await db.query(
      `INSERT INTO provider_bookmarks (customer_id, provider_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [customerId, providerId],
    );

    return res.status(result.insertId ? 201 : 200).json({
      success: true,
      message: "Provider saved.",
      data: {
        provider_id: providerId,
        is_bookmarked: true,
      },
    });
  } catch (error) {
    console.error("Error adding bookmark:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving provider.",
    });
  }
};

exports.removeBookmark = async (req, res) => {
  const customerId = req.user && req.user.id;
  const providerId = normalizeProviderId(req.params.providerId);

  if (!customerId) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required." });
  }

  if (!providerId) {
    return res
      .status(400)
      .json({ success: false, message: "Valid provider id is required." });
  }

  try {
    await db.query(
      "DELETE FROM provider_bookmarks WHERE customer_id = ? AND provider_id = ?",
      [customerId, providerId],
    );

    return res.status(200).json({
      success: true,
      message: "Provider removed from saved list.",
      data: {
        provider_id: providerId,
        is_bookmarked: false,
      },
    });
  } catch (error) {
    console.error("Error removing bookmark:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while removing saved provider.",
    });
  }
};
