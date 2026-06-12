const BASE_RATES = {
  electrician: 550,
  plumber: 500,
  cleaner: 450,
  repair: 600,
  painter: 700,
  carpenter: 650,
  "ac technician": 800,
  default: 550,
};

const AREA_FACTORS = {
  gulshan: 1.18,
  banani: 1.15,
  dhanmondi: 1.1,
  uttara: 1.05,
  mirpur: 1,
  badda: 1,
};

const WORKLOAD_FACTORS = {
  light: 0.9,
  moderate: 1,
  hard: 1.35,
};

function findBaseRate(serviceType, providerHourlyRate) {
  const hourlyRate = Number(providerHourlyRate);
  if (Number.isFinite(hourlyRate) && hourlyRate > 0) return hourlyRate;

  const normalized = String(serviceType || "").toLowerCase();
  const match = Object.keys(BASE_RATES).find((key) => normalized.includes(key));
  return BASE_RATES[match] || BASE_RATES.default;
}

function getAreaFactor(location) {
  const normalized = String(location || "").toLowerCase();
  const match = Object.keys(AREA_FACTORS).find((area) =>
    normalized.includes(area),
  );
  return AREA_FACTORS[match] || 1;
}

function getTimeFactor(dateLike) {
  if (!dateLike) return 1;
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return 1;
  const hour = date.getHours();
  const isWeekend = date.getDay() === 5 || date.getDay() === 6;
  const peak = hour >= 18 || hour < 8;
  return (isWeekend ? 1.12 : 1) * (peak ? 1.15 : 1);
}

function estimatePrice({
  serviceType,
  location,
  scheduledAt,
  workload = "moderate",
  isEmergency = false,
  providerHourlyRate = null,
}) {
  const base = findBaseRate(serviceType, providerHourlyRate);
  const areaFactor = getAreaFactor(location);
  const timeFactor = getTimeFactor(scheduledAt);
  const workloadFactor =
    WORKLOAD_FACTORS[String(workload || "").toLowerCase()] ||
    WORKLOAD_FACTORS.moderate;
  const emergencyFactor = isEmergency ? 1.4 : 1;

  const midpoint = base * areaFactor * timeFactor * workloadFactor * emergencyFactor;
  const min = Math.max(300, Math.round((midpoint * 0.85) / 50) * 50);
  const max = Math.max(min + 100, Math.round((midpoint * 1.2) / 50) * 50);
  const quotedAmount = Math.round(((min + max) / 2) / 10) * 10;

  return {
    currency: "BDT",
    min,
    max,
    quotedAmount,
    rangeLabel: `BDT ${min} - BDT ${max}`,
    factors: {
      base,
      areaFactor,
      timeFactor: Number(timeFactor.toFixed(2)),
      workloadFactor,
      emergencyFactor,
    },
  };
}

module.exports = {
  estimatePrice,
};
