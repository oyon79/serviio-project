const db = require("../config/db");

// List all providers with profile info (admin only)
exports.listProviders = async (req, res) => {
  try {
    const query = `
      SELECT u.id as user_id, u.first_name, u.last_name, u.email, u.phone,
             p.id as profile_id, p.service_type, p.location, p.nid_number, p.is_verified
      FROM users u
      JOIN provider_profiles p ON u.id = p.user_id
      WHERE u.role = 'provider'
      ORDER BY p.is_verified ASC, u.id DESC
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
  try {
    await db.query(
      "UPDATE provider_profiles SET is_verified = TRUE WHERE id = ?",
      [profileId],
    );
    res.status(200).json({ success: true, message: "Provider verified" });
  } catch (err) {
    console.error("Admin verifyProvider error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
