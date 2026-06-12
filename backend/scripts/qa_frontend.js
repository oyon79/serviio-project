const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const frontendRoot = path.join(projectRoot, "frontend");
const htmlFiles = fs
  .readdirSync(frontendRoot)
  .filter((file) => file.endsWith(".html"))
  .sort();

const errors = [];
const warnings = [];
const protectedPages = {
  "admin.html": "admin",
  "profile.html": "customer",
  "profileBooking.html": "provider",
};

function normalizeLocalReference(value) {
  const raw = String(value || "").trim();
  if (
    !raw ||
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("//") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("javascript:")
  ) {
    return null;
  }

  if (raw === "#") return { deadHash: true, path: raw };
  if (raw.startsWith("#")) return null;

  const withoutHash = raw.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  if (!withoutQuery) return null;
  return { path: withoutQuery.replace(/\\/g, "/") };
}

function resolveLocalReference(htmlFile, refPath) {
  const baseDir = path.dirname(path.join(frontendRoot, htmlFile));
  return path.resolve(baseDir, refPath);
}

function findAttributes(markup, attributeName) {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*(["'])(.*?)\\1`, "gi");
  const matches = [];
  let match;
  while ((match = pattern.exec(markup))) {
    matches.push({ value: match[2], index: match.index });
  }
  return matches;
}

function extractInlineScriptSource(markup) {
  const scriptPattern = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts = [];
  let match;
  while ((match = scriptPattern.exec(markup))) {
    scripts.push(match[1]);
  }
  return scripts.join("\n");
}

function extractScriptTags(markup) {
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const scripts = [];
  let match;
  while ((match = scriptPattern.exec(markup))) {
    const tag = match[0];
    scripts.push({
      attrs: match[1] || "",
      content: match[2] || "",
      index: match.index,
      src: getAttribute(tag, "src"),
    });
  }
  return scripts;
}

function readFrontendJsSource() {
  const jsRoot = path.join(frontendRoot, "js");
  if (!fs.existsSync(jsRoot)) return "";
  return fs
    .readdirSync(jsRoot)
    .filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(jsRoot, name), "utf8"))
    .join("\n");
}

function checkReference(htmlFile, attributeName, value) {
  const localRef = normalizeLocalReference(value);
  if (!localRef) return;

  if (localRef.deadHash) {
    errors.push(`${htmlFile}: ${attributeName}="#" is a dead control link.`);
    return;
  }

  const resolved = resolveLocalReference(htmlFile, localRef.path);
  if (!resolved.startsWith(frontendRoot) || !fs.existsSync(resolved)) {
    errors.push(`${htmlFile}: missing local ${attributeName} target "${value}".`);
  }
}

function checkInlineScripts(htmlFile, markup) {
  const scriptPattern = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;
  while ((match = scriptPattern.exec(markup))) {
    const script = match[1].trim();
    if (!script) continue;
    count += 1;
    try {
      new Function(script);
    } catch (error) {
      errors.push(`${htmlFile}: inline script #${count} syntax error: ${error.message}`);
    }
  }
}

function sourceNeedsSharedConfig(source) {
  return (
    /\bfetch\s*\(/.test(source) ||
    /\bio\s*\(/.test(source) ||
    /http:\/\/localhost:5000/.test(source) ||
    /\bgetApiBaseUrl\b/.test(source) ||
    /\bServiio\./.test(source)
  );
}

function checkSharedConfigOrder(htmlFile, markup) {
  const scripts = extractScriptTags(markup);
  const configScript = scripts.find(
    (script) => script.src.replace(/\\/g, "/") === "js/config.js",
  );

  if (!configScript) {
    errors.push(`${htmlFile}: js/config.js must be included for deploy-safe API configuration.`);
    return;
  }

  for (const script of scripts) {
    if (!script.src) {
      if (sourceNeedsSharedConfig(script.content) && script.index < configScript.index) {
        errors.push(`${htmlFile}: API/socket inline script appears before js/config.js.`);
      }
      continue;
    }

    const normalizedSrc = script.src.replace(/\\/g, "/").split("?")[0];
    if (!normalizedSrc.startsWith("js/") || normalizedSrc === "js/config.js") {
      continue;
    }

    const localScriptPath = path.join(frontendRoot, normalizedSrc);
    if (
      fs.existsSync(localScriptPath) &&
      sourceNeedsSharedConfig(fs.readFileSync(localScriptPath, "utf8")) &&
      script.index < configScript.index
    ) {
      errors.push(`${htmlFile}: ${normalizedSrc} must load after js/config.js.`);
    }
  }
}

function checkNoNativeDialogs(fileLabel, source) {
  if (/\balert\s*\(/.test(source)) {
    errors.push(`${fileLabel}: use Serviio.notify() instead of native alert().`);
  }
  if (/\bconfirm\s*\(/.test(source)) {
    errors.push(`${fileLabel}: use an in-page confirmation instead of native confirm().`);
  }
  if (/\bprompt\s*\(/.test(source)) {
    errors.push(`${fileLabel}: use an in-page form/modal instead of native prompt().`);
  }
}

function toDatasetName(attributeName) {
  return attributeName
    .replace(/^data-/, "")
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isButtonInsideForm(markup, offset) {
  const before = markup.slice(0, offset).toLowerCase();
  return before.lastIndexOf("<form") > before.lastIndexOf("</form>");
}

function sourceUsesButtonId(id, source) {
  const escaped = escapeRegex(id);
  return (
    new RegExp(`getElementById\\(\\s*["']${escaped}["']\\s*,?\\s*\\)`).test(source) ||
    new RegExp(`querySelector(?:All)?\\(\\s*["']#${escaped}["']\\s*,?\\s*\\)`).test(
      source,
    )
  );
}

function sourceUsesButtonClass(className, source) {
  const escaped = escapeRegex(className);
  return (
    new RegExp(`querySelector(?:All)?\\(\\s*["'][^"']*\\.${escaped}(?:\\b|[^\\w-])`).test(
      source,
    ) ||
    new RegExp(`getElementsByClassName\\(\\s*["']${escaped}["']\\s*\\)`).test(source) ||
    new RegExp(`classList\\.contains\\(\\s*["']${escaped}["']\\s*\\)`).test(source)
  );
}

function sourceUsesButtonDataAttribute(attributeName, source) {
  const escaped = escapeRegex(attributeName);
  const datasetName = escapeRegex(toDatasetName(attributeName));
  return (
    new RegExp(`\\[${escaped}(?:\\]|=)`).test(source) ||
    new RegExp(`\\.dataset\\.${datasetName}\\b`).test(source)
  );
}

function checkButtonWiring(htmlFile, markup, scriptSource) {
  const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let match;
  while ((match = buttonPattern.exec(markup))) {
    const attrs = match[1] || "";
    const tag = `<button ${attrs}>`;
    const type = getAttribute(tag, "type").toLowerCase();
    if (type === "submit" || type === "reset" || /\bonclick\s*=/.test(attrs)) {
      continue;
    }

    if (!type && isButtonInsideForm(markup, match.index)) {
      continue;
    }

    const id = getAttribute(tag, "id");
    if (id && sourceUsesButtonId(id, scriptSource)) {
      continue;
    }

    const classNames = getAttribute(tag, "class")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (classNames.some((className) => sourceUsesButtonClass(className, scriptSource))) {
      continue;
    }

    const dataAttributes = [];
    const dataPattern = /\b(data-[a-z0-9-]+)\s*=/gi;
    let dataMatch;
    while ((dataMatch = dataPattern.exec(attrs))) {
      dataAttributes.push(dataMatch[1]);
    }
    if (
      dataAttributes.some((attributeName) =>
        sourceUsesButtonDataAttribute(attributeName, scriptSource),
      )
    ) {
      continue;
    }

    errors.push(`${htmlFile}: button near offset ${match.index} has no detectable action.`);
  }
}

function checkImages(htmlFile, markup) {
  const imgPattern = /<img\b[^>]*>/gi;
  const altPattern = /\balt\s*=\s*(["']).*?\1/i;
  let match;
  while ((match = imgPattern.exec(markup))) {
    if (!altPattern.test(match[0])) {
      errors.push(`${htmlFile}: image is missing alt text near offset ${match.index}.`);
    }
  }
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function hasAttribute(tag, attributeName) {
  return new RegExp(`\\b${attributeName}\\s*=`, "i").test(tag);
}

function getAttribute(tag, attributeName) {
  const match = new RegExp(`\\b${attributeName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(
    tag,
  );
  return match ? match[2] : "";
}

function isWrappedByLabel(markup, offset) {
  const before = markup.slice(Math.max(0, offset - 200), offset).toLowerCase();
  const lastOpen = before.lastIndexOf("<label");
  const lastClose = before.lastIndexOf("</label>");
  return lastOpen !== -1 && lastOpen > lastClose;
}

function checkFormControls(htmlFile, markup) {
  const controlPattern = /<(input|select|textarea)\b[^>]*>/gi;
  let match;
  while ((match = controlPattern.exec(markup))) {
    const tag = match[0];
    const type = getAttribute(tag, "type").toLowerCase();
    if (type === "hidden") continue;

    const id = getAttribute(tag, "id");
    const hasExplicitLabel =
      id && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*(["'])${id}\\1`, "i").test(markup);
    const hasAccessibleLabel =
      hasAttribute(tag, "aria-label") ||
      hasAttribute(tag, "aria-labelledby") ||
      hasAttribute(tag, "title") ||
      hasExplicitLabel ||
      isWrappedByLabel(markup, match.index);

    if (!hasAccessibleLabel) {
      errors.push(
        `${htmlFile}: ${match[1]}${id ? `#${id}` : ""} is missing an accessible label.`,
      );
    }
  }
}

function checkButtons(htmlFile, markup) {
  const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let match;
  while ((match = buttonPattern.exec(markup))) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    const hasName =
      stripTags(inner) ||
      /\baria-label\s*=/.test(attrs) ||
      /\baria-labelledby\s*=/.test(attrs) ||
      /\btitle\s*=/.test(attrs);
    if (!hasName) {
      errors.push(`${htmlFile}: button near offset ${match.index} has no accessible name.`);
    }
  }
}

function checkLocalJsSyntax() {
  const jsRoot = path.join(frontendRoot, "js");
  if (!fs.existsSync(jsRoot)) return;
  for (const file of fs.readdirSync(jsRoot).filter((name) => name.endsWith(".js"))) {
    const fullPath = path.join(jsRoot, file);
    const result = spawnSync(process.execPath, ["--check", fullPath], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      errors.push(`js/${file}: syntax check failed: ${result.stderr || result.stdout}`);
    }

    const source = fs.readFileSync(fullPath, "utf8");
    checkNoNativeDialogs(`js/${file}`, source);
  }
}

function checkProtectedPageGuard(htmlFile, markup) {
  const expectedRole = protectedPages[htmlFile];
  if (!expectedRole) return;

  if (!markup.includes("Serviio.requireAuth")) {
    errors.push(`${htmlFile}: protected page must use Serviio.requireAuth.`);
    return;
  }

  if (!markup.includes(`"${expectedRole}"`) && !markup.includes(`'${expectedRole}'`)) {
    errors.push(`${htmlFile}: protected page guard must include ${expectedRole} role.`);
  }
}

function checkAuthRedirectSafety() {
  const authJs = fs.readFileSync(path.join(frontendRoot, "js", "auth.js"), "utf8");
  if (!authJs.includes("safeNext(")) {
    errors.push("js/auth.js: login next redirects must use safeNext().");
  }
}

function checkProviderListEscaping() {
  const source = fs.readFileSync(path.join(frontendRoot, "js", "providerList.js"), "utf8");
  for (const field of ["name", "cat", "area", "desc", "status"]) {
    if (
      source.includes(`\${provider.${field}}`) ||
      source.includes(`\${p.${field}}`)
    ) {
      errors.push(
        `js/providerList.js: provider.${field} must be escaped before template rendering.`,
      );
    }
  }
  if (!source.includes("escapeHTML(")) {
    errors.push("js/providerList.js: provider cards must use escapeHTML().");
  }
  if (!source.includes("window.Serviio?.apiBaseUrl")) {
    errors.push("js/providerList.js: provider API calls must use shared API config.");
  }
}

function checkProviderDashboardEscaping() {
  const source = fs.readFileSync(path.join(frontendRoot, "profileBooking.html"), "utf8");
  const unsafeSnippets = [
    "${job.service_type}",
    "${job.customer_name}",
    "${job.job_location",
    "${job.customer_phone",
    "${job.estimated_price_range",
    "${job.payment_status",
    "${review.title",
    "${review.customer_name",
    "${review.comment",
    "${message.sender_name",
    "${profile.nid_number",
    "${profile.verification_notes",
    "${doc.document_type",
    "${doc.file_name",
    "${doc.document_number",
    "${log.action",
    "- ${log.notes",
    "${notification.title",
    "${notification.notification_type",
    "${notification.message",
  ];

  for (const snippet of unsafeSnippets) {
    if (source.includes(snippet)) {
      errors.push(`profileBooking.html: dynamic provider dashboard value must be escaped near ${snippet}.`);
    }
  }
}

function checkAdminClassTokenSafety() {
  const source = fs.readFileSync(path.join(frontendRoot, "admin.html"), "utf8");
  if (!source.includes("function safeClassToken(")) {
    errors.push("admin.html: dynamic class tokens must be sanitized with safeClassToken().");
  }
  if (source.includes('class="pill ${normalized}"') && !source.includes("const normalized = safeClassToken(status)")) {
    errors.push("admin.html: statusPill() must sanitize status before using it as a class token.");
  }
  if (source.includes("toast show ${type}")) {
    errors.push("admin.html: showToast() must sanitize toast type before using it as a class token.");
  }
}

function checkNoHardcodedLocalApiUrls() {
  const allowed = new Set(["js/config.js"]);
  const files = [];

  for (const htmlFile of htmlFiles) {
    files.push({
      label: htmlFile,
      path: path.join(frontendRoot, htmlFile),
    });
  }

  const jsRoot = path.join(frontendRoot, "js");
  if (fs.existsSync(jsRoot)) {
    for (const file of fs.readdirSync(jsRoot).filter((name) => name.endsWith(".js"))) {
      files.push({
        label: `js/${file}`,
        path: path.join(jsRoot, file),
      });
    }
  }

  for (const file of files) {
    if (allowed.has(file.label.replace(/\\/g, "/"))) continue;
    const source = fs.readFileSync(file.path, "utf8");
    if (source.includes("http://localhost:5000")) {
      errors.push(
        `${file.label}: use Serviio.apiUrl() or Serviio.apiBaseUrl instead of hardcoded localhost API URLs.`,
      );
    }
  }
}

const frontendScriptSource =
  readFrontendJsSource() +
  "\n" +
  htmlFiles
    .map((htmlFile) => extractInlineScriptSource(fs.readFileSync(path.join(frontendRoot, htmlFile), "utf8")))
    .join("\n");

for (const htmlFile of htmlFiles) {
  const markup = fs.readFileSync(path.join(frontendRoot, htmlFile), "utf8");

  checkSharedConfigOrder(htmlFile, markup);

  for (const { value } of findAttributes(markup, "href")) {
    checkReference(htmlFile, "href", value);
  }
  for (const { value } of findAttributes(markup, "src")) {
    checkReference(htmlFile, "src", value);
  }

  checkImages(htmlFile, markup);
  checkFormControls(htmlFile, markup);
  checkButtons(htmlFile, markup);
  checkButtonWiring(htmlFile, markup, frontendScriptSource);
  checkInlineScripts(htmlFile, markup);
  checkNoNativeDialogs(htmlFile, markup);
  checkProtectedPageGuard(htmlFile, markup);
}

checkLocalJsSyntax();
checkAuthRedirectSafety();
checkProviderListEscaping();
checkProviderDashboardEscaping();
checkAdminClassTokenSafety();
checkNoHardcodedLocalApiUrls();

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}

if (errors.length) {
  console.error("Frontend QA failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Frontend QA passed for ${htmlFiles.length} HTML pages.`);
