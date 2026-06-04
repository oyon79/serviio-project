const fs = require("fs");
const path = require("path");

async function extract() {
  const root = path.resolve(__dirname, "..", "..");
  const files = [
    path.join(root, "Serviio (1).pdf"),
    path.join(root, "Serviio Unique Features.docx"),
    path.join(root, "Team Lazycat_Soft-Lab_assignment.pdf"),
  ];

  const out = [];

  // Lazily require heavy modules so the script fails with clear message if not installed
  let pdfParse;
  let mammoth;
  try {
    pdfParse = require("pdf-parse");
    mammoth = require("mammoth");
  } catch (e) {
    console.error("Missing dependencies. Run: npm install pdf-parse mammoth");
    process.exit(1);
  }

  for (const file of files) {
    if (!fs.existsSync(file)) {
      out.push(`*** MISSING: ${path.basename(file)}\n`);
      continue;
    }

    const ext = path.extname(file).toLowerCase();
    out.push(`*** FILE: ${path.basename(file)}\n`);

    try {
      if (ext === ".pdf") {
        const data = fs.readFileSync(file);
        // Try pdf-parse first (if available); if it fails, fallback to pdfjs-dist
        let parsedText = "";
        try {
          let parsed;
          if (typeof pdfParse === "function") parsed = await pdfParse(data);
          else if (pdfParse && typeof pdfParse.default === "function")
            parsed = await pdfParse.default(data);
          else parsed = await pdfParse(data);

          if (parsed && parsed.text) parsedText = parsed.text;
        } catch (e) {
          // fallback to pdfjs-dist if installed
          try {
            // Try a more generic import for pdfjs-dist
            const pdfjs = require("pdfjs-dist");
            // pdfjs expects a Uint8Array in Node.js environments
            const uint8 = new Uint8Array(data);
            const loadingTask = pdfjs.getDocument({ data: uint8 });
            const pdfDoc = await loadingTask.promise;
            const maxPages = pdfDoc.numPages;
            const pageTexts = [];
            for (let i = 1; i <= maxPages; i++) {
              const page = await pdfDoc.getPage(i);
              const content = await page.getTextContent();
              const strings = content.items.map((s) => s.str);
              pageTexts.push(strings.join(" "));
            }
            parsedText = pageTexts.join("\n\n");
          } catch (e2) {
            throw new Error("pdf parsing failed: " + (e2.message || e2));
          }
        }

        out.push(parsedText.slice(0, 20000));
      } else if (ext === ".docx") {
        const res = await mammoth.extractRawText({ path: file });
        out.push(res.value.slice(0, 20000));
      } else {
        out.push("Unsupported file type");
      }
    } catch (err) {
      out.push(
        "ERROR: " + (err && err.message ? err.message : String(err)) + "\n",
      );
    }

    out.push("\n\n");
  }

  const outPath = path.join(root, "backend", "specs_summary.txt");
  fs.writeFileSync(outPath, out.join("\n"));
  console.log("Spec extraction complete. See", outPath);
}

extract();
