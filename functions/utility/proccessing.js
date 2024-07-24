const axios = require("axios");
const path = require("path");
const fs = require("fs");
const os = require("os");

const TEMP_DIR = os.tmpdir() || "/tmp"

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

module.exports = { downloadGoogleFont };
