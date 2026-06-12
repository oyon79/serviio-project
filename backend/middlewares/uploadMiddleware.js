const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadRoot = path.resolve(__dirname, "..", "uploads", "verification");
fs.mkdirSync(uploadRoot, { recursive: true });

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const mimeExtensions = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function sanitizeBaseName(value) {
  return String(value || "document")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "document";
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadRoot);
  },
  filename(req, file, cb) {
    const ext = mimeExtensions[file.mimetype] || path.extname(file.originalname || "").toLowerCase();
    const safeBase = sanitizeBaseName(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeBase}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    cb(new Error("Only PDF, JPG, PNG, or WEBP verification files are allowed."));
    return;
  }
  cb(null, true);
}

const verificationUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:
      (Number(process.env.KYC_MAX_FILE_MB) > 0
        ? Number(process.env.KYC_MAX_FILE_MB)
        : 5) *
      1024 *
      1024,
  },
});

function hasMagicSignature(filePath, mimetype) {
  const buffer = fs.readFileSync(filePath);
  if (mimetype === "application/pdf") {
    return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  if (mimetype === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimetype === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

function deleteUploadedFile(file) {
  if (!file?.path) return;
  try {
    fs.unlinkSync(file.path);
  } catch (_) {
    // Nothing else to do if cleanup fails; the request will still be rejected.
  }
}

function handleUploadErrors(middleware) {
  return (req, res, next) => {
    middleware(req, res, (error) => {
      if (!error) {
        if (req.file && !hasMagicSignature(req.file.path, req.file.mimetype)) {
          deleteUploadedFile(req.file);
          return res.status(400).json({
            success: false,
            message: "Verification file content does not match the declared file type.",
          });
        }
        return next();
      }

      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Verification file is too large."
          : error.message || "Verification upload failed.";
      return res.status(400).json({
        success: false,
        message,
      });
    });
  };
}

module.exports = {
  verificationUpload,
  handleUploadErrors,
  hasMagicSignature,
  sanitizeBaseName,
};
