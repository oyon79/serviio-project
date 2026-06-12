const DEFAULT_PLATFORM_COMMISSION_RATE = 0.1;

function parsePlatformCommissionRate(env = process.env) {
  const raw = String(env.PLATFORM_COMMISSION_RATE ?? "").trim();
  if (!raw) return DEFAULT_PLATFORM_COMMISSION_RATE;

  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) {
    throw new Error(
      "PLATFORM_COMMISSION_RATE must be a decimal rate from 0 up to but not including 1.",
    );
  }

  return rate;
}

function validatePlatformCommissionRate(env = process.env) {
  try {
    parsePlatformCommissionRate(env);
    return null;
  } catch (error) {
    return error.message;
  }
}

module.exports = {
  DEFAULT_PLATFORM_COMMISSION_RATE,
  parsePlatformCommissionRate,
  validatePlatformCommissionRate,
};
