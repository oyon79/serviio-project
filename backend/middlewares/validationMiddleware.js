function isEmpty(value) {
  return value === undefined || value === null || value === "";
}

function isMissing(value) {
  return value === undefined || value === null;
}

function makeValidator(check) {
  return check;
}

const validators = {
  required(label = "Field") {
    return makeValidator((value) =>
      isEmpty(value) ? `${label} is required.` : null,
    );
  },

  string(label = "Field") {
    return makeValidator((value) =>
      typeof value === "string" ? null : `${label} must be a string.`,
    );
  },

  nonEmptyString(label = "Field") {
    return makeValidator((value) =>
      typeof value === "string" && value.trim()
        ? null
        : `${label} must be a non-empty string.`,
    );
  },

  maxLength(max, label = "Field") {
    return makeValidator((value) =>
      String(value).length <= max
        ? null
        : `${label} must be ${max} characters or fewer.`,
    );
  },

  minLength(min, label = "Field") {
    return makeValidator((value) =>
      String(value).length >= min
        ? null
        : `${label} must be at least ${min} characters.`,
    );
  },

  email(label = "Email") {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return makeValidator((value) =>
      pattern.test(String(value).trim()) ? null : `${label} is invalid.`,
    );
  },

  positiveInteger(label = "Field") {
    return makeValidator((value) => {
      const number = Number(value);
      return Number.isInteger(number) && number > 0
        ? null
        : `${label} must be a positive integer.`;
    });
  },

  positiveNumber(label = "Field") {
    return makeValidator((value) => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0
        ? null
        : `${label} must be a positive number.`;
    });
  },

  boolean(label = "Field") {
    return makeValidator((value) =>
      typeof value === "boolean" ? null : `${label} must be a boolean.`,
    );
  },

  oneOf(values, label = "Field") {
    const allowed = new Set(values.map((value) => String(value).toUpperCase()));
    return makeValidator((value) =>
      allowed.has(String(value).toUpperCase())
        ? null
        : `${label} must be one of: ${values.join(", ")}.`,
    );
  },

  dateLike(label = "Date") {
    return makeValidator((value) =>
      Number.isNaN(Date.parse(value)) ? `${label} must be a valid date.` : null,
    );
  },

  regex(pattern, message) {
    return makeValidator((value) =>
      pattern.test(String(value)) ? null : message,
    );
  },

  matchField(otherField, label = "Field") {
    return makeValidator((value, source) =>
      value === source[otherField] ? null : `${label} does not match.`,
    );
  },
};

function validate(rules) {
  return (req, res, next) => {
    const errors = [];

    for (const [location, fields] of Object.entries(rules)) {
      const source = req[location] || {};

      for (const [field, fieldValidators] of Object.entries(fields)) {
        const value = source[field];
        const hasRequired = fieldValidators.some(
          (validator) => validator.name === "requiredValidator",
        );

        if (!hasRequired && isEmpty(value)) {
          continue;
        }

        for (const validator of fieldValidators) {
          const error = validator(value, source);
          if (error) {
            errors.push({ field, location, message: error });
            break;
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors,
      });
    }

    return next();
  };
}

function required(label = "Field") {
  const validator = validators.required(label);
  Object.defineProperty(validator, "name", { value: "requiredValidator" });
  return validator;
}

module.exports = {
  validate,
  validators: {
    ...validators,
    required,
  },
};
