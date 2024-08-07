const express = require("express");
const { fileParser } = require("express-multipart-file-parser");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const csv = require("csv-parser");
const { PDFDocument } = require("pdf-lib");
const os = require('os');
const {
  createCanvasWithCenteredText,
  addOrUpdateGuests
} = require("../utility/proccessing");
const createTransaction = require("../utility/creditTransiction");
const { ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const { app, firebaseStorage } = require("../firebaseConfig");
const { authenticateJWT } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = os.tmpdir() || "/tmp";
const PDF_UPLOAD_DIR = path.join(UPLOAD_DIR, "video");
const CSV_UPLOAD_DIR = path.join(UPLOAD_DIR, "guestNames");

if (!fs.existsSync(PDF_UPLOAD_DIR)) {
  fs.mkdirSync(PDF_UPLOAD_DIR);
}

if (!fs.existsSync(CSV_UPLOAD_DIR)) {
  fs.mkdirSync(CSV_UPLOAD_DIR);
}

const uploadFileToFirebase = async (
  fileBuffer,
  filename,
  eventId,
  isSample,
  i
) => {
  try {
    let storageRef;
    if (isSample === "true") {
      storageRef = ref(
        firebaseStorage,
        `sample/sample${i}${i === "zip" ? ".zip" : ".pdf"}`
      );
    } else {
      storageRef = ref(firebaseStorage, `uploads/${eventId}/${filename}`);
    }
    const snapshot = await uploadBytes(storageRef, fileBuffer);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error("Error uploading file to Firebase:", error);
    throw error;
  }
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
    const streams = await Promise.all(
      texts.map((text) =>
        createCanvasWithCenteredText(val, text, scalingFont, scalingH, scalingW)
      )
    );
    streams.forEach((stream, index) => {
      texts[index].stream = stream;
    });

    const inputPdf = await fs.promises.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(inputPdf);

    const pages = pdfDoc.getPages();

    for (const text of texts) {
      const img = await pdfDoc.embedPng(text.stream);
      const page = pages[text.page];

      page.drawImage(img, {
        x: text.position.x * scalingW,
        y:
          page.getHeight() -
          text.position.y * scalingH -
          text.size.height * scalingH,
      });
    }

    const pdfBytes = await pdfDoc.save();
    // let outputFile = `processed_pdf_${i}_${Date.now()}_${OUTPUT_FILENAME}`;
    // const outputPath = path.join(UPLOAD_DIR, outputFile);
    // await fs.promises.writeFile(outputPath, pdfBytes);

    return pdfBytes;
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
  authenticateJWT,
  fileParser({ rawBodyOptions: { limit: "100mb" } }),
  async (req, res) => {
    let inputPath;
    try {
      const { textProperty, scalingFont, scalingW, scalingH, isSample } =
        req.body;

      const eventId = req?.query?.eventId;
      
      const inputFileName = req.files.find((val) => val.fieldname === "pdf");
      const guestsFileName = req.files.find(
        (val) => val.fieldname === "guestNames"
      );

      inputPath = `${path.join(PDF_UPLOAD_DIR)}/${
        inputFileName.originalname
      }`;

      const csvFilePath =
        isSample === "true"
          ? ""
          : `${path.join(CSV_UPLOAD_DIR)}/${guestsFileName.originalname}`;

      fs.writeFileSync(inputPath, inputFileName.buffer);

      if (isSample !== "true") {
        fs.writeFileSync(csvFilePath, guestsFileName.buffer);
      }
      
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
          { name: "sanjay", mobile: "4258454" },
        ];
      } else {
        guestNames = await processCsvFile(csvFilePath);
      }

      const zipFilename = `processed_pdfs_${Date.now()}.zip`;
      const zipPath = path.join(UPLOAD_DIR, zipFilename);

      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.on("error", (err) => {
        throw err;
      });

      archive.pipe(output);

      await Promise.all(
        guestNames.map(async (val, i) => {
          const buffer = await createPdfForGuest(
            inputPath,
            texts,
            scalingFont,
            scalingH,
            scalingW,
            val,
            i
          );

          const filename = `${val?.name}_${val?.mobileNumber}.pdf`;
          archive.append(new Buffer.from(buffer), { name: filename });

          const url = await uploadFileToFirebase(
            buffer,
            filename,
            eventId, 
            isSample,
            i
          );
          val.link = url;
          return url;
        })
      );

      await archive.finalize();

      output.on("close", async () => {
        const zipBuffer = fs.readFileSync(zipPath);
        const zipUrl = await uploadFileToFirebase(
          zipBuffer,
          zipFilename,
          eventId,
          isSample,
          "zip"
        );
        fs.unlinkSync(zipPath);

        if (isSample !== "true") {
          const amountSpend = 0.5 * guestNames.length;

          await addOrUpdateGuests(eventId, guestNames);
          await createTransaction(
            "pdf",
            eventId,
            null,
            amountSpend,
            "completed",
            eventId
          );
        }

        res.status(200).json({
          zipUrl,
          videoUrls: guestNames,
        });
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "PDF processing failed" });
    } finally {
      fs.unlinkSync(inputPath); // Clean up the uploaded PDF file
    }
  }
);

module.exports = router;
