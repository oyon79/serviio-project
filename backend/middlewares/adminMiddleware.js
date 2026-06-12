const { isAdminRole } = require("../utils/roles");

module.exports = function (req, res, next) {
  if (!req.user || !isAdminRole(req.user.role)) {
    return res
      .status(403)
      .json({ success: false, message: "Admin privileges required" });
  }
  next();
};
