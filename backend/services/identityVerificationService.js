const IS_PRODUCTION = process.env.NODE_ENV === "production";

function isValidBangladeshNid(nidNumber) {
  return /^(?:\d{10}|\d{13}|\d{17})$/.test(String(nidNumber || ""));
}

function buildHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.NID_VERIFICATION_API_KEY;
  if (apiKey) {
    const headerName = process.env.NID_VERIFICATION_AUTH_HEADER || "Authorization";
    const scheme = process.env.NID_VERIFICATION_AUTH_SCHEME || "Bearer";
    headers[headerName] = scheme ? `${scheme} ${apiKey}` : apiKey;
  }
  return headers;
}

function buildDocumentHeaders(prefix) {
  const headers = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env[`${prefix}_API_KEY`];
  if (apiKey) {
    const headerName = process.env[`${prefix}_AUTH_HEADER`] || "Authorization";
    const scheme = process.env[`${prefix}_AUTH_SCHEME`] || "Bearer";
    headers[headerName] = scheme ? `${scheme} ${apiKey}` : apiKey;
  }
  return headers;
}

function splitCsv(value, fallback) {
  return String(value || fallback || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPayloadValue(payload, fieldPath) {
  return String(fieldPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => {
      if (current && Object.prototype.hasOwnProperty.call(current, key)) {
        return current[key];
      }
      return undefined;
    }, payload);
}

function firstPayloadValue(payload, fields) {
  for (const field of fields) {
    const value = getPayloadValue(payload, field);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function isTruthyVerificationValue(value) {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  return ["TRUE", "YES", "Y", "1"].includes(String(value || "").toUpperCase());
}

function mapProviderVerificationPayload(payload, envPrefix) {
  const truthyFields = splitCsv(
    process.env[`${envPrefix}_TRUTHY_FIELDS`],
    "verified,matched,is_verified,is_matched,success",
  );
  const statusFields = splitCsv(
    process.env[`${envPrefix}_STATUS_FIELDS`],
    "status,verification_status,result,match_status,data.status",
  );
  const referenceFields = splitCsv(
    process.env[`${envPrefix}_REFERENCE_FIELDS`],
    "reference,request_id,id,transaction_id,trace_id,data.reference,data.id",
  );
  const matchValues = new Set(
    splitCsv(
      process.env[`${envPrefix}_MATCH_VALUES`],
      "MATCHED,VERIFIED,VALID,VALIDATED,APPROVED,SUCCESS,FOUND",
    ).map((value) => value.toUpperCase()),
  );
  const mismatchValues = new Set(
    splitCsv(
      process.env[`${envPrefix}_MISMATCH_VALUES`],
      "MISMATCHED,REJECTED,INVALID,FAILED,NOT_FOUND,NO_MATCH",
    ).map((value) => value.toUpperCase()),
  );

  const truthyValue = firstPayloadValue(payload, truthyFields);
  if (isTruthyVerificationValue(truthyValue)) {
    return {
      matched: true,
      reference: firstPayloadValue(payload, referenceFields) || null,
    };
  }

  const statusValue = firstPayloadValue(payload, statusFields);
  const normalizedStatus = String(statusValue || "").toUpperCase();
  if (matchValues.has(normalizedStatus)) {
    return {
      matched: true,
      reference: firstPayloadValue(payload, referenceFields) || null,
    };
  }
  if (mismatchValues.has(normalizedStatus)) {
    return {
      matched: false,
      reference: firstPayloadValue(payload, referenceFields) || null,
    };
  }

  return {
    matched: false,
    reference: firstPayloadValue(payload, referenceFields) || null,
  };
}

async function verifyGenericDocument({
  envPrefix,
  documentType,
  documentNumber,
  fullName,
  phone,
}) {
  const mode = String(process.env[`${envPrefix}_MODE`] || "disabled").toLowerCase();
  const endpoint = process.env[`${envPrefix}_URL`];
  const mockEnabled =
    process.env[`${envPrefix}_MOCK_ENABLED`] === "true" || !IS_PRODUCTION;

  if (!documentNumber) {
    return {
      checked: false,
      status: "NOT_CHECKED",
      message: `${documentType} document number is required for external verification.`,
    };
  }

  if (mode === "mock" && mockEnabled) {
    return {
      checked: true,
      status: "MATCHED",
      provider: "mock",
      reference: `${documentType}-MOCK-${Date.now()}`,
      payload: {
        document_type: documentType,
        document_number: String(documentNumber),
        full_name: fullName || null,
      },
    };
  }

  if (mode === "disabled" || !endpoint) {
    return {
      checked: false,
      status: "NOT_CHECKED",
      message: `${documentType} verification provider is not configured.`,
    };
  }

  if (mode !== "generic_http") {
    return {
      checked: false,
      status: "ERROR",
      message: `Unsupported ${documentType} verification mode: ${mode}.`,
    };
  }

  const timeoutMs = Number(process.env[`${envPrefix}_TIMEOUT_MS`] || 10000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildDocumentHeaders(envPrefix),
      body: JSON.stringify({
        document_type: documentType,
        document_number: String(documentNumber),
        full_name: fullName || null,
        phone: phone || null,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const mappedPayload = mapProviderVerificationPayload(payload, envPrefix);

    return {
      checked: true,
      status: response.ok && mappedPayload.matched ? "MATCHED" : "MISMATCHED",
      provider: "generic_http",
      reference: mappedPayload.reference,
      payload,
    };
  } catch (error) {
    return {
      checked: true,
      status: "ERROR",
      message:
        error.name === "AbortError"
          ? `${documentType} verification request timed out.`
          : `${documentType} verification request failed.`,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyNid({ nidNumber, fullName, dateOfBirth, phone }) {
  if (!isValidBangladeshNid(nidNumber)) {
    return {
      checked: true,
      status: "MISMATCHED",
      message: "NID number must be 10, 13, or 17 digits.",
    };
  }

  const mode = String(process.env.NID_VERIFICATION_MODE || "disabled").toLowerCase();
  const endpoint = process.env.NID_VERIFICATION_URL;
  const mockEnabled =
    process.env.NID_VERIFICATION_MOCK_ENABLED === "true" || !IS_PRODUCTION;

  if (mode === "mock" && mockEnabled) {
    return {
      checked: true,
      status: "MATCHED",
      provider: "mock",
      reference: `NID-MOCK-${Date.now()}`,
      payload: { nid_number: String(nidNumber), full_name: fullName || null },
    };
  }

  if (mode === "disabled" || !endpoint) {
    return {
      checked: false,
      status: "NOT_CHECKED",
      message: "NID verification provider is not configured.",
    };
  }

  if (mode !== "generic_http") {
    return {
      checked: false,
      status: "ERROR",
      message: `Unsupported NID verification mode: ${mode}.`,
    };
  }

  const timeoutMs = Number(process.env.NID_VERIFICATION_TIMEOUT_MS || 10000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        nid_number: String(nidNumber),
        full_name: fullName || null,
        date_of_birth: dateOfBirth || null,
        phone: phone || null,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const mappedPayload = mapProviderVerificationPayload(
      payload,
      "NID_VERIFICATION",
    );

    return {
      checked: true,
      status: response.ok && mappedPayload.matched ? "MATCHED" : "MISMATCHED",
      provider: "generic_http",
      reference: mappedPayload.reference,
      payload,
    };
  } catch (error) {
    return {
      checked: true,
      status: "ERROR",
      message:
        error.name === "AbortError"
          ? "NID verification request timed out."
          : "NID verification request failed.",
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyProviderDocument({
  documentType,
  documentNumber,
  fullName,
  phone,
}) {
  const normalizedType = String(documentType || "").toUpperCase();

  if (normalizedType === "NID") {
    return verifyNid({
      nidNumber: documentNumber,
      fullName,
      phone,
    });
  }

  if (normalizedType === "POLICE_CLEARANCE") {
    return verifyGenericDocument({
      envPrefix: "POLICE_VERIFICATION",
      documentType: normalizedType,
      documentNumber,
      fullName,
      phone,
    });
  }

  if (normalizedType === "SKILL_CERTIFICATE") {
    return verifyGenericDocument({
      envPrefix: "SKILL_VERIFICATION",
      documentType: normalizedType,
      documentNumber,
      fullName,
      phone,
    });
  }

  return {
    checked: false,
    status: "NOT_CHECKED",
    message: `${normalizedType || "Document"} does not have an external verification adapter.`,
  };
}

module.exports = {
  isValidBangladeshNid,
  verifyProviderDocument,
  verifyNid,
};
