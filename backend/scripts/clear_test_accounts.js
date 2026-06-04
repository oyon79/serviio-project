const db = require("../config/db");

(async function () {
  try {
    const patterns = ["e2e.%", "dbg.%", "%+test@example.com"];
    console.log(
      "Searching for test users matching patterns:",
      patterns.join(", "),
    );
    const query = `SELECT id, email, first_name, last_name, role FROM users WHERE email LIKE ? OR email LIKE ? OR email LIKE ?`;
    const rows = await db.queryExec(query, patterns);
    if (!rows || rows.length === 0) {
      console.log("No test users found.");
      process.exit(0);
    }
    console.log("Found users:");
    rows.forEach((r) =>
      console.log(
        ` - id=${r.id} email=${r.email} name=${r.first_name} ${r.last_name} role=${r.role}`,
      ),
    );

    // Delete matching users (will cascade to provider_profiles/bookings per schema)
    const delQuery = `DELETE FROM users WHERE email LIKE ? OR email LIKE ? OR email LIKE ?`;
    const result = await db.queryExec(delQuery, patterns);
    console.log("Delete query executed.");
    console.log(result);

    // Verify deletion
    const remaining = await db.queryExec(query, patterns);
    console.log("Remaining matches after delete:", remaining.length);
    process.exit(0);
  } catch (err) {
    console.error("Error while clearing test accounts:", err);
    process.exit(1);
  }
})();
