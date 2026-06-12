const { normalizeRole } = require("../utils/roles");

module.exports = function authorizeRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles.map(normalizeRole));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!allowed.has(normalizeRole(req.user.role))) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    next();
  };
};
