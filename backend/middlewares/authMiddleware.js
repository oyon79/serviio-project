const jwt = require("jsonwebtoken");

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "Authorization header is required.",
    });
  }

  const parts = String(authHeader).trim().split(/\s+/);
  const [scheme, token] = parts;
  if (parts.length !== 2 || String(scheme).toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Authorization header must be in the format: Bearer <token>.",
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("Missing JWT_SECRET for auth middleware");
    return res.status(500).json({
      success: false,
      message: "Server misconfiguration.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    const message =
      error.name === "TokenExpiredError"
        ? "Token has expired. Please log in again."
        : "Invalid authorization token.";

    return res.status(401).json({
      success: false,
      message,
    });
  }
};
