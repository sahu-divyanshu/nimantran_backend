const express = require("express");
const { fileParser } = require("express-multipart-file-parser");
const fs = require("fs");
const os = require("os");
const path = require("path");
const csv = require("csv-parser");
const sharp = require("sharp");
const { authenticateJWT } = require("../middleware/auth");
const createTransaction = require("../utility/creditTransiction");
const { app, firebaseStorage } = require("../firebaseConfig");
const { ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const {
  addOrUpdateGuests,
  createCanvasWithCenteredText,
} = require("../utility/proccessing");
const archiver = require("archiver");

const router = express.Router();

const UPLOAD_DIR = os.tmpdir() || "/tmp";
const VIDEO_UPLOAD_DIR = path.join(UPLOAD_DIR, "video");
const CSV_UPLOAD_DIR = path.join(UPLOAD_DIR, "guestNames");

if (!fs.existsSync(VIDEO_UPLOAD_DIR)) {
  fs.mkdirSync(VIDEO_UPLOAD_DIR);
}

if (!fs.existsSync(CSV_UPLOAD_DIR)) {
  fs.mkdirSync(CSV_UPLOAD_DIR);
}

const createImagesForGuest = async (
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

    let baseImage = sharp(inputPath);

    const overlays = await Promise.all(
      texts.map(async (overlay) => {
        const { stream, position, size } = overlay;
        const overlayImage = await sharp(stream).toBuffer();

        return {
          input: overlayImage,
          left: parseInt(position.x * scalingW),
          top: parseInt(position.y * scalingH + 5),
        };
      })
    );

    baseImage = baseImage.composite(overlays);

    const outputBuffer = await baseImage.toBuffer();
    console.log("Image processing complete.");

    return outputBuffer;
  } catch (error) {
    throw error;
  }
};

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
        `sample/sample${i}${i === "zip" ? ".zip" : ".png"}`
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
  fileParser({ rawBodyOptions: { limit: "10mb" } }),
  async (req, res) => {
    let inputPath;
    try {
      const { textProperty, scalingFont, scalingW, scalingH, isSample } =
        req.body;

      const eventId = req?.query?.eventId;

      const inputFileName = req.files.find((val) => val.fieldname === "video");
      const guestsFileName = req.files.find(
        (val) => val.fieldname === "guestNames"
      );

      inputPath = `${path.join(VIDEO_UPLOAD_DIR)}/${
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

      if (!eventId) throw new Error("Required Event Id");

      const texts = JSON.parse(textProperty);

      if (!texts || !inputPath) {
        return res
          .status(400)
          .json({ error: "Please provide the guest list and video." });
      }

      let guestNames = [];

      if (isSample === "true") {
        guestNames = [
          { name: "change guest", mobileNumber: "11111" },
          { name: "second", mobileNumber: "22222" },
        ];
      } else {
        guestNames = await processCsvFile(csvFilePath);
      }

      const zipFilename = `processed_images_${Date.now()}.zip`;
      const zipPath = path.join(UPLOAD_DIR, zipFilename);

      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.on("error", (err) => {
        throw err;
      });

      archive.pipe(output);

      const uploadedUrls = await Promise.all(
        guestNames.map(async (val, i) => {
          const buffer = await createImagesForGuest(
            inputPath,
            texts,
            scalingFont,
            scalingH,
            scalingW,
            val,
            i
          );

          const filename = `processed_img_${i}_${Date.now()}.png`;
          archive.append(buffer, { name: filename });

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
          await addOrUpdateGuests(eventId, guestNames);

          const amountSpend = 0.25 * guestNames.length;
          await createTransaction(
            "image",
            req.user._id,
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
      res.status(400).json({ error: "Image processing failed" });
    } finally {
      fs.unlinkSync(inputPath);
    }
  }
);

module.exports = router;
