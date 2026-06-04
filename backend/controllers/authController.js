const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// 1. User Registration
exports.register = async (req, res) => {
  // Now explicitly capturing 'nid' alongside your other parameters
  const { first_name, last_name, email, phone, password, role, nid } = req.body;

  try {
    // 1. Basic Backend Validation
    if (!first_name || !last_name || !email || !phone || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All basic fields are required." });
    }

    // 2. Strict NID Verification for Providers ONLY
    if (role === "provider") {
      if (!nid) {
        return res.status(400).json({
          success: false,
          message: "NID is required for Service Providers.",
        });
      }
      const nidRegex = /^(?:\d{10}|\d{13}|\d{17})$/;
      if (!nidRegex.test(nid)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid Bangladesh NID format." });
      }
    }

    // 3. Check if user already exists by email or phone
    const [existingUsers] = await db.query(
      "SELECT * FROM users WHERE email = ? OR phone = ?",
      [email, phone],
    );
    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User with this email or phone already exists.",
      });
    }

    // 4. Hash the password securely
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 5. Insert into users table
    const [result] = await db.query(
      "INSERT INTO users (first_name, last_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)",
      [first_name, last_name, email, phone, hashedPassword, role || "customer"],
    );

    // 6. If Provider, create secure profile with NID
    // Insert without `is_verified` to be compatible with older schemas
    if (role === "provider") {
      await db.query(
        "INSERT INTO provider_profiles (user_id, service_type, location, nid_number) VALUES (?, ?, ?, ?)",
        [result.insertId, "Unspecified", "Unspecified", nid],
      );
    }

    res
      .status(201)
      .json({ success: true, message: "User registered successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error during registration.",
      error: error.message,
    });
  }
};

// 2. User Login (Maintained exactly as you built it)
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find the user by email
    const [users] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (users.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const user = users[0];

    // Compare the provided password with the hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    // Generate a secure JSON Web Token (JWT)
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }, // Token expires in 7 days
    );

    res.status(200).json({
      success: true,
      message: "Login successful!",
      token: token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Server error during login." });
  }
};
