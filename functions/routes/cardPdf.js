const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { createCanvas, registerFont, deregisterAllFonts } = require("canvas");
const csv = require("csv-parser");
const { PDFDocument } = require("pdf-lib");

const router = express.Router();

let OUTPUT_FILENAME = "";
const UPLOAD_DIR = path.join(__dirname, "../tmp");
const PDF_UPLOAD_DIR = path.join(UPLOAD_DIR, "video");
const CSV_UPLOAD_DIR = path.join(UPLOAD_DIR, "guestNames");
const FONT_DIR = path.join(__dirname, "../fonts");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}
if (!fs.existsSync(FONT_DIR)) {
  fs.mkdirSync(FONT_DIR);
}
if (!fs.existsSync(CSV_UPLOAD_DIR)) {
  fs.mkdirSync(CSV_UPLOAD_DIR);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "guestNames") {
      cb(null, CSV_UPLOAD_DIR);
    } else if (file.fieldname === "pdf") {
      cb(null, PDF_UPLOAD_DIR);
    }
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const createCanvasWithCenteredText = (
  val,
  property,
  scalingFont,
  scalingH,
  scalingW
) => {
  registerFont(path.join(FONT_DIR, `${property.fontFamily}.ttf`), {
    family: property.fontFamily,
  });

  let tempTextName = property.text.replace(
    /{(\w+)}/g,
    (match, p1) => val[p1] || ""
  );

  const width = property.size.width * scalingW;
  const height = property.size.height * scalingH;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (property.backgroundColor !== "none") {
    ctx.fillStyle = property.backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = property.fontColor;

  let fontSize = property.fontSize * scalingFont;
  ctx.font = `${fontSize}px ${property.fontFamily}`;
  
  // Adjust font size to fit text within canvas width
  while (ctx.measureText(tempTextName).width > width && fontSize > 1) {
    fontSize--;
    ctx.font = `${fontSize}px ${property.fontFamily}`;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = width / 2;
  const y = height / 2;
  ctx.fillText(tempTextName, x, y);

  deregisterAllFonts();

  return canvas.toDataURL();
};

const createPdfForGuest = async (
  inputPath,
  texts,
  scalingFont,
  scalingH,
  scalingW,
  val,
  i
) => {
  try {

    texts.forEach((text) => {
      text.stream = createCanvasWithCenteredText(
        val,
        text,
        scalingFont,
        scalingH,
        scalingW
      );
    });
    
    const inputPdf = await fs.promises.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(inputPdf);

    const pages = pdfDoc.getPages();

    for (const text of texts) {
      const tempTextName = text.text.replace(
        /{(\w+)}/g,
        (match, p1) => val[p1] || ""
      );

      const width = text.size.width * scalingW;
      const height = text.size.height * scalingH;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      if (text.backgroundColor !== "none") {
        ctx.fillStyle = text.backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.fillStyle = text.fontColor;
      ctx.font = `${text.fontSize * scalingFont}px ${text.fontFamily}`;

      let fontSize = text.fontSize * scalingFont;
      ctx.font = `${fontSize}px ${text.fontFamily}`;

      // Adjust font size to fit text within canvas width
      while (ctx.measureText(tempTextName).width > width && fontSize > 1) {
        fontSize--;
        ctx.font = `${fontSize}px ${text.fontFamily}`;
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const x = width / 2;
      const y = height / 2;
      ctx.fillText(tempTextName, x, y);

      const img = await pdfDoc.embedPng(canvas.toDataURL());

      const page = pages[text.page];
      page.drawImage(img, {
        x: text.position.x * scalingW,
        y: page.getHeight() - text.position.y * scalingH - height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    let outputFile = `processed_pdf_${i}_${Date.now()}_${OUTPUT_FILENAME}`;
    const outputPath = path.join(UPLOAD_DIR, outputFile);
    await fs.promises.writeFile(outputPath, pdfBytes);

    return outputFile;
  } catch (error) {
    throw error;
  }
};

const processCsvFile = (csvFilePath) => {
  return new Promise((resolve, reject) => {
    const guestNames = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on("data", (data) => guestNames.push(data))
      .on("end", () => {
        fs.unlinkSync(csvFilePath);
        resolve(guestNames);
      })
      .on("error", reject);
  });
};

router.post(
  "/",
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "guestNames", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { textProperty, scalingFont, scalingW, scalingH, isSample } = req.body;

      console.log("vvvvvvv", isSample)

      const csvFilePath = isSample === "true" ? "" : req.files.guestNames[0].path;
      const inputPath = req.files.pdf[0].path;
      OUTPUT_FILENAME = req.files.pdf[0].filename;
      const texts = JSON.parse(textProperty);

      if (!texts || !inputPath) {
        return res
          .status(400)
          .json({ error: "Please provide the guest list and video." });
      }

      let guestNames = [];
      if (isSample === "true") {
        guestNames = [
          { name: "pawan", mobile: "84145874" },
          // { name: "sanjay", mobile: "4258454" },
        ];
      } else {
        guestNames = await processCsvFile(csvFilePath);
      }
      const videoFilenames = await Promise.all(
        guestNames.map((val, i) =>
          createPdfForGuest(
            inputPath,
            texts,
            scalingFont,
            scalingH,
            scalingW,
            val,
            i
          )
        )
      );

      const zipFilename = `processed_videos_${Date.now()}.zip`;
      const zipPath = path.join(UPLOAD_DIR, zipFilename);

      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.on("error", (err) => {
        throw err;
      });

      archive.pipe(output);

      videoFilenames.forEach((filename) => {
        const filePath = path.join(UPLOAD_DIR, filename);
        archive.file(filePath, { name: filename });
      });

      await archive.finalize();
      output.on("close", () => {
        res.status(201).json({
          zipUrl: `${req.protocol}://${req.get("host")}/uploads/${zipFilename}`,
          videoUrls: videoFilenames.map(
            (filename) => `${req.protocol}://${req.get("host")}/uploads/${filename}`
          ),
        });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "PDF processing failed" });
    } finally {
      fs.unlinkSync(req.files.pdf[0].path); // Clean up the uploaded PDF file
    }
  }
);

module.exports = router;
