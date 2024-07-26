const express = require("express");
const { fileParser } = require("express-multipart-file-parser");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createCanvas, registerFont, deregisterAllFonts } = require("canvas");
const csv = require("csv-parser");
const sharp = require("sharp");
const { authenticateJWT } = require("../middleware/auth");
const createTransaction = require("../utility/creditTransiction");
const { User } = require("../models/User");
const { app, firebaseStorage } = require("../firebaseConfig");
const { ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const {
  downloadGoogleFont,
  addOrUpdateGuests,
} = require("../utility/proccessing");
const archiver = require("archiver");

const router = express.Router();

const UPLOAD_DIR =path.join(__dirname,"../tmp");
const VIDEO_UPLOAD_DIR = path.join(UPLOAD_DIR, "video");
const CSV_UPLOAD_DIR = path.join(UPLOAD_DIR, "guestNames");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

if (!fs.existsSync(VIDEO_UPLOAD_DIR)) {
  fs.mkdirSync(VIDEO_UPLOAD_DIR);
}

if (!fs.existsSync(CSV_UPLOAD_DIR)) {
  fs.mkdirSync(CSV_UPLOAD_DIR);
}

const createCanvasWithCenteredText = async (
  val,
  property,
  scalingFont,
  scalingH,
  scalingW
) => {
  const fontPath = await downloadGoogleFont(property.fontFamily);
  let fontSize = parseInt(property.fontSize * scalingFont);
  const fontInfo = `${property.fontStyle === "italic" && "italic"} ${
    property.fontWeight
  } ${fontSize}px ${property.fontFamily}`;

  registerFont(fontPath, { family: fontInfo });

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
  ctx.font = fontInfo;

  while (ctx.measureText(tempTextName).width > width && fontSize > 1) {
    fontSize--;
    ctx.font = fontInfo;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = width / 2;
  const y = height / 2;
  ctx.fillText(tempTextName, x, y);

  // deregisterAllFonts();

  return canvas.toBuffer();
};

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
  } catch (error){
    throw error;
  }
};

const uploadFileToFirebase = async (
  fileBuffer,
  filename,
  clientId,
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
      storageRef = ref(firebaseStorage, `uploads/${clientId}/${filename}`);
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

      const eventId = req?.query?.eventId;

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
            req.user._id,
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
          req.user._id,
          isSample,
          "zip"
        );
        fs.unlinkSync(zipPath);

        if (isSample !== "true") {
          await addOrUpdateGuests(eventId, guestNames);

          const amountSpend = 2;
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
      res.status(400).json({ error: "Video processing failed" });
    } finally {
      // fs.unlinkSync(inputPath);
    }
  }
);

module.exports = router;
