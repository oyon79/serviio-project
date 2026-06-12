const CUSTOMER_ROLES = new Set(["customer"]);
const PROVIDER_ROLES = new Set(["provider"]);
const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const SUPPORT_ROLES = new Set(["admin", "super_admin", "support_agent"]);
const VERIFICATION_ROLES = new Set([
  "admin",
  "super_admin",
  "verification_officer",
]);
const OPERATIONS_ROLES = new Set([
  "admin",
  "super_admin",
  "support_agent",
  "verification_officer",
]);

function normalizeRole(role) {
  return String(role || "").toLowerCase();
}

function hasRole(role, allowedRoles) {
  return allowedRoles.has(normalizeRole(role));
}

function isAdminRole(role) {
  return hasRole(role, ADMIN_ROLES);
}

function isSupportRole(role) {
  return hasRole(role, SUPPORT_ROLES);
}

function isVerificationRole(role) {
  return hasRole(role, VERIFICATION_ROLES);
}

function isOperationsRole(role) {
  return hasRole(role, OPERATIONS_ROLES);
}

module.exports = {
  ADMIN_ROLES,
  CUSTOMER_ROLES,
  OPERATIONS_ROLES,
  PROVIDER_ROLES,
  SUPPORT_ROLES,
  VERIFICATION_ROLES,
  isAdminRole,
  isOperationsRole,
  isSupportRole,
  isVerificationRole,
  normalizeRole,
};
