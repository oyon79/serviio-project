const allowedStatuses = new Set([
  "PENDING",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

const providerTransitions = {
  PENDING: new Set(["ACCEPTED", "CANCELLED"]),
  ACCEPTED: new Set(["ON_THE_WAY", "CANCELLED"]),
  ON_THE_WAY: new Set(["ARRIVED", "CANCELLED"]),
  ARRIVED: new Set(["CANCELLED"]),
  IN_PROGRESS: new Set(["COMPLETED", "CANCELLED"]),
  COMPLETED: new Set([]),
  CANCELLED: new Set([]),
};

const statusTimestampColumns = {
  ACCEPTED: "accepted_at",
  ON_THE_WAY: "on_the_way_at",
  ARRIVED: "arrived_at",
  IN_PROGRESS: "started_at",
  COMPLETED: "completed_at",
  CANCELLED: "cancelled_at",
};

const handshakeStartStatuses = new Set([
  "PENDING",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
]);

function normalizeStatus(value) {
  return String(value || "").toUpperCase();
}

function canStartWithHandshake(status) {
  return handshakeStartStatuses.has(normalizeStatus(status));
}

function canProviderTransition(fromStatus, toStatus) {
  return Boolean(
    providerTransitions[normalizeStatus(fromStatus)]?.has(
      normalizeStatus(toStatus),
    ),
  );
}

function getStatusTimestampColumn(status) {
  return statusTimestampColumns[normalizeStatus(status)] || null;
}

module.exports = {
  allowedStatuses,
  canStartWithHandshake,
  canProviderTransition,
  getStatusTimestampColumn,
  normalizeStatus,
};
