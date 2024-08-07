const axios = require("axios");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { createCanvas, registerFont, deregisterAllFonts } = require("canvas");
const { Event } = require("../models/Event");

const TEMP_DIR = os.tmpdir() || "/tmp";

const FONT_DIR = path.join(TEMP_DIR, "fonts");

if (!fs.existsSync(FONT_DIR)) {
  fs.mkdirSync(FONT_DIR);
}

const downloadGoogleFont = async (fontFamily) => {
  const fontUrl = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(
    / /g,
    "+"
  )}`;
  const response = await axios.get(fontUrl);
  const fontCss = response.data;

  const fontFileUrlMatch = fontCss.match(/url\((https:\/\/[^)]+)\)/);
  if (!fontFileUrlMatch) {
    throw new Error(
      `Could not find font file URL in Google Fonts response for ${fontFamily}`
    );
  }

  const fontFileUrl = fontFileUrlMatch[1];
  const fontFileName = `${fontFamily.replace(/ /g, "_")}.ttf`;
  const fontFilePath = path.join(FONT_DIR, fontFileName);

  if (!fs.existsSync(fontFilePath)) {
    const fontFileResponse = await axios.get(fontFileUrl, {
      responseType: "arraybuffer",
    });
    fs.writeFileSync(fontFilePath, fontFileResponse.data);
  }

  return fontFilePath;
};

const addOrUpdateGuests = async (eventId, guests) => {
  try {
    const event = await Event.findById(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    guests.forEach((guest) => {
      const existingGuestIndex = event.guests.findIndex(
        (g) => g.mobileNumber === guest.mobileNumber
      );

      if (existingGuestIndex !== -1) {
        event.guests[existingGuestIndex].name = guest.name;
        event.guests[existingGuestIndex].link =
          guest.link || event.guests[existingGuestIndex].link;
      } else {
        event.guests.push({
          name: guest.name,
          mobileNumber: guest.mobileNumber,
          link: guest.link,
        });
      }
    });

    const updatedEvent = await event.save();
    return updatedEvent;
  } catch (error) {
    return error;
  }
};

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

module.exports = {
  downloadGoogleFont,
  addOrUpdateGuests,
  createCanvasWithCenteredText,
};
