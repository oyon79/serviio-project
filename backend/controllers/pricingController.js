const { estimatePrice } = require("../services/pricingService");

exports.estimate = async (req, res) => {
  const {
    service_type,
    location,
    scheduled_at,
    workload = "moderate",
    is_emergency = false,
    provider_hourly_rate,
  } = req.body;

  const estimate = estimatePrice({
    serviceType: service_type,
    location,
    scheduledAt: scheduled_at,
    workload,
    isEmergency: Boolean(is_emergency),
    providerHourlyRate: provider_hourly_rate,
  });

  return res.status(200).json({
    success: true,
    data: estimate,
  });
};
