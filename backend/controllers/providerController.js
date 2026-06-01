const db = require("../config/db");

// Get all verified providers
exports.getAllProviders = async (req, res) => {
  try {
    // We use a SQL JOIN to combine user info (name) with profile info (skills, location)
    const query = `
            SELECT 
                u.id, u.first_name, u.last_name, u.phone, 
                p.service_type, p.experience_summary, p.location, p.rating, p.is_available
            FROM users u
            JOIN provider_profiles p ON u.id = p.user_id
            WHERE u.role = 'provider' AND p.verification_status = 'verified'
        `;

    const [providers] = await db.query(query);

    res.status(200).json({
      success: true,
      count: providers.length,
      data: providers,
    });
  } catch (error) {
    console.error("Error fetching providers:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
