const express = require("express");
const { fileParser } = require("express-multipart-file-parser");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const archiver = require("archiver");
const { createCanvas, registerFont, deregisterAllFonts } = require("canvas");
const csv = require("csv-parser");
const { authenticateJWT } = require("../middleware/auth");
const { downloadGoogleFont } = require("../utility/proccessing");

ffmpeg.setFfmpegPath(ffmpegPath);

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "../tmp");
// const UPLOAD_DIR = os.tmpdir() || "/tmp";
const VIDEO_UPLOAD_DIR = path.join(UPLOAD_DIR, "video");
const CSV_UPLOAD_DIR = path.join(UPLOAD_DIR, "guestNames");
const TEMP_DIR = path.join(UPLOAD_DIR, "temp");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}
if (!fs.existsSync(CSV_UPLOAD_DIR)) {
  fs.mkdirSync(CSV_UPLOAD_DIR);
}
if (!fs.existsSync(VIDEO_UPLOAD_DIR)) {
  fs.mkdirSync(VIDEO_UPLOAD_DIR);
}

// Helper function to save DataURL as an image file
const saveDataURLAsImage = (dataURL, filePath) => {
  const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(filePath, base64Data, "base64");
};

const convertImageToVideo = (imagePath, videoPath, duration = 2) => {
  return new Promise((resolve, reject) => {
    ffmpeg(imagePath)
      .loop(duration) // Set video duration
      .outputOptions([
        "-pix_fmt yuva420p", // Ensure compatibility with transparency
        "-c:v libx264", // Use the H.264 codec
        "-crf 18", // Set the quality (lower is better)
        "-preset veryfast", // Set the encoding speed/quality trade-off
        "-movflags +faststart", // Optimize for web playback
      ])
      .output(videoPath)
      .on("end", () => {
        resolve(videoPath);
      })
      .on("error", (err, stdout, stderr) => {
        console.error("FFmpeg error:", err);
        console.error("FFmpeg stdout:", stdout);
        console.error("FFmpeg stderr:", stderr);
        reject(err);
      })
      .run();
  });
};

const createCanvasWithCenteredText = async (
  val,
  property,
  scalingFont,
  scalingH,
  scalingW
) => {
  const fontPath = await downloadGoogleFont(property.fontFamily);
  registerFont(fontPath, { family: property.fontFamily });

  let tempTextName = property.text.replace(
    /{(\w+)}/g,
    (match, p1) => val[p1] || ""
  );
  let width = parseInt(property.size.width * scalingW);
  let height = parseInt(property.size.height * scalingH);

  width = width % 2 ? width + 1 : width;
  height = height % 2 ? height + 1 : height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (property.backgroundColor !== "none") {
    ctx.fillStyle = property.backgroundColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height); // Clear the canvas for transparency
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

  const dataURL = canvas.toDataURL();

  // Save image and convert to video
  const imageFilePath = path.join(TEMP_DIR, `text_overlay_${Date.now()}.png`);
  const videoFilePath = path.join(TEMP_DIR, `text_overlay_${Date.now()}.mp4`);

  saveDataURLAsImage(dataURL, imageFilePath);

  await convertImageToVideo(
    imageFilePath,
    videoFilePath,
    property.duration - property.startTime
  );

  // Clean up the temporary image file
  fs.unlinkSync(imageFilePath);

  return videoFilePath;
};

const createVideoForGuest = (
  inputPath,
  texts,
  scalingFont,
  scalingH,
  scalingW,
  val,
  i
) => {
  return new Promise(async (resolve, reject) => {
    const streams = await Promise.all(
      texts.map((text) =>
        createCanvasWithCenteredText(val, text, scalingFont, scalingH, scalingW)
      )
    );

    // Assign the resolved values to text.stream
    streams.forEach((stream, index) => {
      texts[index].stream = stream;
      const createVideoForGuest = (
        inputPath,
        texts,
        scalingFont,
        scalingH,
        scalingW,
        val,
        i
      ) => {
        return new Promise(async (resolve, reject) => {
          const streams = await Promise.all(
            texts.map((text) =>
              createCanvasWithCenteredText(
                val,
                text,
                scalingFont,
                scalingH,
                scalingW
              )
            )
          );

          // Assign the resolved values to text.stream
          streams.forEach((stream, index) => {
            texts[index].stream = stream;
          });

          const outputFilename = `processed_${i}_${Date.now()}.mp4`;
          const outputPath = path.join(UPLOAD_DIR, outputFilename);

          const processedVideo = ffmpeg(inputPath);

          texts.forEach(async (text) => {
            processedVideo.input(await text.stream);
          });

          const configuration = texts.flatMap((text, idx) => {
            const xPos = parseInt(text.position.x * scalingW);
            const yPos = parseInt(text.position.y * scalingH + 5);

            let filterConfig = {
              filter: "overlay",
              options: {
                x: xPos,
                y: yPos,
                enable: `between(t,${parseInt(text.startTime)},${parseInt(
                  text.duration // this is end time
                )})`,
              },
              inputs:
                idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
              outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
            };

            // Add transition filter if specified
            if (text.transition) {
              switch (text.transition.type) {
                case "move_up":
                  filterConfig = {
                    filter: "overlay",
                    options: {
                      x: xPos,
                      y: `if(lt(t,${text.startTime}+${
                        text.transition.options.duration
                      }), (${yPos + text.transition.options.top} + (t-${
                        text.startTime
                      })*(${yPos}-${yPos + text.transition.options.top})/${
                        text.transition.options.duration
                      }), ${yPos})`,
                      enable: `between(t,${text.startTime},${text.duration})`,
                    },
                    inputs:
                      idx === 0
                        ? ["0:v", "1:v"]
                        : [`[tmp${idx}]`, `${idx + 1}:v`],
                    outputs:
                      idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
                  };
                  break;
                case "move_down":
                  filterConfig = {
                    filter: "overlay",
                    options: {
                      x: xPos,
                      y: `if(lt(t,${text.startTime}+${
                        text.transition.options.duration
                      }), (${yPos - text.transition.options.bottom} + (t-${
                        text.startTime
                      })*(${yPos}-${yPos - text.transition.options.bottom})/${
                        text.transition.options.duration
                      }), ${yPos})`,
                      enable: `between(t,${text.startTime},${text.duration})`,
                    },
                    inputs:
                      idx === 0
                        ? ["0:v", "1:v"]
                        : [`[tmp${idx}]`, `${idx + 1}:v`],
                    outputs:
                      idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
                  };
                  break;
                case "move_right":
                  filterConfig = {
                    filter: "overlay",
                    options: {
                      x: `if(lt(t,${text.startTime}+${
                        text.transition.options.duration
                      }), (${xPos - text.transition.options.right} + (t-${
                        text.startTime
                      })*(${xPos}-${xPos - text.transition.options.right})/${
                        text.transition.options.duration
                      }), ${xPos})`,
                      y: yPos,
                      enable: `between(t,${text.startTime},${text.duration})`,
                    },
                    inputs:
                      idx === 0
                        ? ["0:v", "1:v"]
                        : [`[tmp${idx}]`, `${idx + 1}:v`],
                    outputs:
                      idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
                  };
                  break;
                case "move_left":
                  filterConfig = {
                    filter: "overlay",
                    options: {
                      x: `if(lt(t,${text.startTime}+${
                        text.transition.options.duration
                      }), (${xPos + text.transition.options.left} + (t-${
                        text.startTime
                      })*(${xPos}-${xPos + text.transition.options.left})/${
                        text.transition.options.duration
                      }), ${xPos})`,
                      y: yPos,
                      enable: `between(t,${text.startTime},${text.duration})`,
                    },
                    inputs:
                      idx === 0
                        ? ["0:v", "1:v"]
                        : [`[tmp${idx}]`, `${idx + 1}:v`],
                    outputs:
                      idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
                  };
                  break;
                case "slide":
                  filterConfig = {
                    filter: "overlay",
                    options: {
                      x: `if(lt(t,${text.startTime}+${
                        text.transition.options.duration
                      }), (${xPos - text.transition.options.left} + (t-${
                        text.startTime
                      })*(${xPos + text.transition.options.right}-${
                        xPos - text.transition.options.left
                      })/${text.transition.options.duration}), ${
                        xPos + text.transition.options.right
                      })`,
                      y: `if(lt(t,${text.startTime}+${
                        text.transition.options.duration
                      }), (${yPos - text.transition.options.top} + (t-${
                        text.startTime
                      })*(${yPos + text.transition.options.bottom}-${
                        yPos - text.transition.options.top
                      })/${text.transition.options.duration}), ${
                        yPos + text.transition.options.bottom
                      })`,
                      enable: `between(t,${text.startTime},${text.duration})`,
                    },
                    inputs:
                      idx === 0
                        ? ["0:v", "1:v"]
                        : [`[tmp${idx}]`, `${idx + 1}:v`],
                    outputs:
                      idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
                  };
                  break;
                case "path_cover":
                  const rotationSpeed = text.transition.options.rotationSpeed;
                  const clockwise = text.transition.options.clockwise !== false; // Default to clockwise if not specified

                  filterConfig = {
                    filter: "overlay",
                    options: {
                      x: `if(lt(t,${text.startTime}),${xPos},if(lt(t,${
                        text.startTime
                      } + 1/${rotationSpeed}),${xPos} + (overlay_w/5) * cos(2*PI*${
                        clockwise ? "" : "-"
                      }${rotationSpeed}*(t-${text.startTime})),${xPos}))`,
                      y: `if(lt(t,${text.startTime}),${yPos},if(lt(t,${
                        text.startTime
                      } + 1/${rotationSpeed}),${yPos} + (overlay_h/5) * sin(2*PI*${
                        clockwise ? "" : "-"
                      }${rotationSpeed}*(t-${text.startTime})),${yPos}))`,
                      enable: `between(t,${text.startTime},${text.duration})`,
                      eval: "frame",
                    },
                    inputs:
                      idx === 0
                        ? ["0:v", "1:v"]
                        : [`[tmp${idx}]`, `${idx + 1}:v`],
                    outputs:
                      idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
                  };
                  break;
                case "fade":
                  const fadeConfig = [
                    {
                      filter: "fade",
                      options: {
                        type: "in",
                        start_time: text.startTime,
                        duration: text.transition.options.duration, // Fade duration in seconds
                      },
                      inputs: `1:v`, // Each input stream (starting from 1)
                      outputs: `fade${idx + 1}`,
                    },
                    {
                      filter: "overlay",
                      options: {
                        x: xPos,
                        y: yPos,
                        enable: `between(t,${parseInt(
                          text.startTime
                        )},${parseInt(text.duration)})`,
                      },
                      inputs:
                        idx === 0
                          ? ["0:v", `fade${idx + 1}`]
                          : [`[tmp${idx}]`, `fade${idx + 1}`],
                      outputs:
                        idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
                    },
                  ];
                  return fadeConfig;
                default:
                  break;
              }
            }

            return filterConfig;
          });

          processedVideo
            .complexFilter(configuration, "result")
            .outputOptions(["-c:v libx264", "-c:a aac", "-map 0:a:0"])
            .output(outputPath)
            .on("end", () => {
              resolve(outputFilename);
            })
            .on("error", (err) => {
              console.log(err);
              reject(err);
            })
            .run();
        });
      };
    });

    const outputFilename = `processed_${i}_${Date.now()}.mp4`;
    const outputPath = path.join(UPLOAD_DIR, outputFilename);

    const processedVideo = ffmpeg(inputPath);

    texts.forEach(async (text) => {
      processedVideo.input(await text.stream);
    });

    const configuration = texts.flatMap((text, idx) => {
      const xPos = parseInt(text.position.x * scalingW);
      const yPos = parseInt(text.position.y * scalingH + 5);

      let filterConfig = {
        filter: "overlay",
        options: {
          x: xPos,
          y: yPos,
          enable: `between(t,${parseInt(text.startTime)},${parseInt(
            text.duration // this is end time
          )})`,
        },
        inputs: idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
        outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
      };

      // Add transition filter if specified
      if (text.transition) {
        switch (text.transition.type) {
          case "move_up":
            filterConfig = {
              filter: "overlay",
              options: {
                x: xPos,
                y: `if(lt(t,${text.startTime}+${
                  text.transition.options.duration
                }), (${yPos + text.transition.options.top} + (t-${
                  text.startTime
                })*(${yPos}-${yPos + text.transition.options.top})/${
                  text.transition.options.duration
                }), ${yPos})`,
                enable: `between(t,${text.startTime},${text.duration})`,
              },
              inputs:
                idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
              outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
            };
            break;
          case "move_down":
            filterConfig = {
              filter: "overlay",
              options: {
                x: xPos,
                y: `if(lt(t,${text.startTime}+${
                  text.transition.options.duration
                }), (${yPos - text.transition.options.bottom} + (t-${
                  text.startTime
                })*(${yPos}-${yPos - text.transition.options.bottom})/${
                  text.transition.options.duration
                }), ${yPos})`,
                enable: `between(t,${text.startTime},${text.duration})`,
              },
              inputs:
                idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
              outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
            };
            break;
          case "move_right":
            filterConfig = {
              filter: "overlay",
              options: {
                x: `if(lt(t,${text.startTime}+${
                  text.transition.options.duration
                }), (${xPos - text.transition.options.right} + (t-${
                  text.startTime
                })*(${xPos}-${xPos - text.transition.options.right})/${
                  text.transition.options.duration
                }), ${xPos})`,
                y: yPos,
                enable: `between(t,${text.startTime},${text.duration})`,
              },
              inputs:
                idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
              outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
            };
            break;
          case "move_left":
            filterConfig = {
              filter: "overlay",
              options: {
                x: `if(lt(t,${text.startTime}+${
                  text.transition.options.duration
                }), (${xPos + text.transition.options.left} + (t-${
                  text.startTime
                })*(${xPos}-${xPos + text.transition.options.left})/${
                  text.transition.options.duration
                }), ${xPos})`,
                y: yPos,
                enable: `between(t,${text.startTime},${text.duration})`,
              },
              inputs:
                idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
              outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
            };
            break;
          case "slide":
            filterConfig = {
              filter: "overlay",
              options: {
                x: `if(lt(t,${text.startTime}+${
                  text.transition.options.duration
                }), (${xPos - text.transition.options.left} + (t-${
                  text.startTime
                })*(${xPos + text.transition.options.right}-${
                  xPos - text.transition.options.left
                })/${text.transition.options.duration}), ${
                  xPos + text.transition.options.right
                })`,
                y: `if(lt(t,${text.startTime}+${
                  text.transition.options.duration
                }), (${yPos - text.transition.options.top} + (t-${
                  text.startTime
                })*(${yPos + text.transition.options.bottom}-${
                  yPos - text.transition.options.top
                })/${text.transition.options.duration}), ${
                  yPos + text.transition.options.bottom
                })`,
                enable: `between(t,${text.startTime},${text.duration})`,
              },
              inputs:
                idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
              outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
            };
            break;
          case "path_cover":
            const rotationSpeed = text.transition.options.rotationSpeed;
            const clockwise = text.transition.options.clockwise !== false; // Default to clockwise if not specified

            filterConfig = {
              filter: "overlay",
              options: {
                x: `if(lt(t,${text.startTime}),${xPos},if(lt(t,${
                  text.startTime
                } + 1/${rotationSpeed}),${xPos} + (overlay_w/5) * cos(2*PI*${
                  clockwise ? "" : "-"
                }${rotationSpeed}*(t-${text.startTime})),${xPos}))`,
                y: `if(lt(t,${text.startTime}),${yPos},if(lt(t,${
                  text.startTime
                } + 1/${rotationSpeed}),${yPos} + (overlay_h/5) * sin(2*PI*${
                  clockwise ? "" : "-"
                }${rotationSpeed}*(t-${text.startTime})),${yPos}))`,
                enable: `between(t,${text.startTime},${text.duration})`,
                eval: "frame",
              },
              inputs:
                idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
              outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
            };
            break;
          case "fade":
            const fadeConfig = [
              {
                filter: "fade",
                options: {
                  type: "in",
                  start_time: text.startTime,
                  duration: text.transition.options.duration, // Fade duration in seconds
                },
                inputs: `1:v`, // Each input stream (starting from 1)
                outputs: `fade${idx + 1}`,
              },
              {
                filter: "overlay",
                options: {
                  x: xPos,
                  y: yPos,
                  enable: `between(t,${parseInt(text.startTime)},${parseInt(
                    text.duration
                  )})`,
                },
                inputs:
                  idx === 0
                    ? ["0:v", `fade${idx + 1}`]
                    : [`[tmp${idx}]`, `fade${idx + 1}`],
                outputs:
                  idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
              },
            ];
            return fadeConfig;
          default:
            break;
        }
      }

      return filterConfig;
    });

    processedVideo
      .complexFilter(configuration, "result")
      .outputOptions(["-c:v libx264", "-c:a aac", "-map 0:a:0"])
      .output(outputPath)
      .on("end", () => {
        resolve(outputFilename);
      })
      .on("error", (err) => {
        console.log(err);
        reject(err);
      })
      .run();
  });
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
  fileParser({ rawBodyOptions: { limit: "200mb" } }),
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
          { name: "pawan", mobile: "84145874" },
          { name: "sanjay", mobile: "4258454" },
        ];
      } else {
        guestNames = await processCsvFile(csvFilePath);
      }

      const zipFilename = `processed_videos_${Date.now()}.zip`;
      const zipPath = path.join(UPLOAD_DIR, zipFilename);

      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.on("error", (err) => {
        throw err;
      });

      archive.pipe(output);

      const videoFilenames = await Promise.all(
        guestNames.map(
          async (val, i) =>
            await createVideoForGuest(
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

      videoFilenames.forEach((filename) => {
        const filePath = path.join(UPLOAD_DIR, filename);
        archive.file(filePath, { name: filename });
      });

      await archive.finalize();

      output.on("close", () => {
        res.status(200).json({
          zipUrl: `${req.protocol}://${req.get("host")}/tmp/${zipFilename}`,
          videoUrls: videoFilenames.map((filename) => ({
            link: `${req.protocol}://${req.get("host")}/tmp/${filename}`,
            name: "dummy name",
          })),
        });
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    } finally {
      fs.unlinkSync(inputPath); // Clean up the uploaded video file
    }
  }
);

module.exports = router;

//////////////////////////////////////////////////////////////////////////

// const express = require("express");
// const multer = require("multer");
// const fs = require("fs");
// const path = require("path");
// const ffmpeg = require("fluent-ffmpeg");
// const ffmpegPath = require("ffmpeg-static");
// const archiver = require("archiver");
// const { createCanvas, registerFont, deregisterAllFonts } = require("canvas");
// const csv = require("csv-parser");

// ffmpeg.setFfmpegPath(ffmpegPath);

// const router = express.Router();

// const UPLOAD_DIR = path.join(__dirname, "../uploads");
// const VIDEO_UPLOAD_DIR = path.join(UPLOAD_DIR, "video");
// const CSV_UPLOAD_DIR = path.join(UPLOAD_DIR, "guestNames");
// const IMAGE_UPLOAD_DIR = path.join(UPLOAD_DIR, "images");
// const FONT_DIR = path.join(__dirname, "../fonts");

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     if (file.fieldname === "guestNames") {
//       cb(null, CSV_UPLOAD_DIR);
//     } else if (file.fieldname === "video" || file.fieldname === "image") {
//       cb(null, VIDEO_UPLOAD_DIR);
//     }
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + path.extname(file.originalname));
//   },
// });

// const upload = multer({ storage });

// const createCanvasWithCenteredText = (
//   val,
//   property,
//   scalingFont,
//   scalingH,
//   scalingW
// ) => {
//   registerFont(path.join(FONT_DIR, `${property.fontFamily}.ttf`), {
//     family: property.fontFamily,
//   });

//   let tempTextName = property.text.replace(
//     /{(\w+)}/g,
//     (match, p1) => val[p1] || ""
//   );

//   const width = property.size.width * scalingW;
//   const height = property.size.height * scalingH;
//   const canvas = createCanvas(width, height);
//   const ctx = canvas.getContext("2d");

//   if (property.backgroundColor !== "none") {
//     ctx.fillStyle = property.backgroundColor;
//     ctx.fillRect(0, 0, width, height);
//   }

//   ctx.fillStyle = property.fontColor;
//   ctx.font = `${property.fontSize * scalingFont}px ${property.fontFamily}`;
//   ctx.textAlign = "center";
//   ctx.textBaseline = "middle";

//   const x = width / 2;
//   const y = height / 2;
//   ctx.fillText(tempTextName, x, y);

//   deregisterAllFonts();

//   return canvas.toDataURL();
// };

// const createVideoForGuest = (
//   inputPath,
//   texts,
//   scalingFont,
//   scalingH,
//   scalingW,
//   val,
//   i
// ) => {
//   return new Promise((resolve, reject) => {
//     const textVideosPromises = texts.map((text, index) => {
//       const canvasStream = createCanvasWithCenteredText(
//         val,
//         text,
//         scalingFont,
//         scalingH,
//         scalingW
//       );

//       const imagePath = path.join(IMAGE_UPLOAD_DIR, `text_image_${i}_${index}.png`);
//       const videoPath = path.join(VIDEO_UPLOAD_DIR, `text_video_${i}_${index}.mp4`);

//       // Save the canvas stream as an image
//       const base64Data = canvasStream.replace(/^data:image\/png;base64,/, "");
//       fs.writeFileSync(imagePath, base64Data, 'base64');

//       // Convert image to video
//       return convertImageToVideo(imagePath, text.duration, videoPath).then(() => videoPath);
//     });

//     Promise.all(textVideosPromises).then((textVideoPaths) => {
//       const outputFilename = `processed_${i}_${Date.now()}.mp4`;
//       const outputPath = path.join(UPLOAD_DIR, outputFilename);

//       const processedVideo = ffmpeg(inputPath);

//       textVideoPaths.forEach((textVideoPath) => {
//         processedVideo.input(textVideoPath);
//       });

//       const configuration = texts.flatMap((text, idx) => {
//         const xPos = parseInt(text.position.x * scalingW);
//         const yPos = parseInt(text.position.y * scalingH + 5);

//         let filterConfig = {
//           filter: "overlay",
//           options: {
//             x: xPos,
//             y: yPos,
//             enable: `between(t,${parseInt(text.startTime)},${parseInt(
//               text.duration // this is end time
//             )})`,
//           },
//           inputs: idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
//           outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
//         };

//         text.transition = {
//           type: 'fade',
//           options: {
//             duration: 1
//           }
//         }

//         // Add transition filter if specified
//         if (text.transition) {
//           switch (text.transition.type) {
//             case "move_up":
//               filterConfig = {
//                 filter: "overlay",
//                 options: {
//                   x: xPos,
//                   y: `if(lt(t,${text.startTime}+${
//                     text.transition.options.duration
//                   }), (${yPos + text.transition.options.top} + (t-${
//                     text.startTime
//                   })*(${yPos}-${yPos + text.transition.options.top})/${
//                     text.transition.options.duration
//                   }), ${yPos})`,
//                   enable: `between(t,${text.startTime},${text.duration})`,
//                 },
//                 inputs:
//                   idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
//                 outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
//               };
//               break;
//             case "move_down":
//               filterConfig = {
//                 filter: "overlay",
//                 options: {
//                   x: xPos,
//                   y: `if(lt(t,${text.startTime}+${
//                     text.transition.options.duration
//                   }), (${yPos - text.transition.options.bottom} + (t-${
//                     text.startTime
//                   })*(${yPos}-${yPos - text.transition.options.bottom})/${
//                     text.transition.options.duration
//                   }), ${yPos})`,
//                   enable: `between(t,${text.startTime},${text.duration})`,
//                 },
//                 inputs:
//                   idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
//                 outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
//               };
//               break;
//             case "move_right":
//               filterConfig = {
//                 filter: "overlay",
//                 options: {
//                   x: `if(lt(t,${text.startTime}+${
//                     text.transition.options.duration
//                   }), (${xPos - text.transition.options.right} + (t-${
//                     text.startTime
//                   })*(${xPos}-${xPos - text.transition.options.right})/${
//                     text.transition.options.duration
//                   }), ${xPos})`,
//                   y: yPos,
//                   enable: `between(t,${text.startTime},${text.duration})`,
//                 },
//                 inputs:
//                   idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
//                 outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
//               };
//               break;
//             case "move_left":
//               filterConfig = {
//                 filter: "overlay",
//                 options: {
//                   x: `if(lt(t,${text.startTime}+${
//                     text.transition.options.duration
//                   }), (${xPos + text.transition.options.left} + (t-${
//                     text.startTime
//                   })*(${xPos}-${xPos + text.transition.options.left})/${
//                     text.transition.options.duration
//                   }), ${xPos})`,
//                   y: yPos,
//                   enable: `between(t,${text.startTime},${text.duration})`,
//                 },
//                 inputs:
//                   idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
//                 outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
//               };
//               break;
//             case "slide":
//               filterConfig = {
//                 filter: "overlay",
//                 options: {
//                   x: `if(lt(t,${text.startTime}+${
//                     text.transition.options.duration
//                   }), (${xPos - text.transition.options.left} + (t-${
//                     text.startTime
//                   })*(${xPos + text.transition.options.right}-${
//                     xPos - text.transition.options.left
//                   })/${text.transition.options.duration}), ${
//                     xPos + text.transition.options.right
//                   })`,
//                   y: `if(lt(t,${text.startTime}+${
//                     text.transition.options.duration
//                   }), (${yPos - text.transition.options.top} + (t-${
//                     text.startTime
//                   })*(${yPos + text.transition.options.bottom}-${
//                     yPos - text.transition.options.top
//                   })/${text.transition.options.duration}), ${
//                     yPos + text.transition.options.bottom
//                   })`,
//                   enable: `between(t,${text.startTime},${text.duration})`,
//                 },
//                 inputs:
//                   idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
//                 outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
//               };
//               break;
//             case "rotate":
//               const rotationSpeed = text.transition.options.speed || 1;
//               const clockwise = text.transition.options.clockwise || false;
//               filterConfig = {
//                 filter: "overlay",
//                 options: {
//                   x: `if(lt(t,${text.startTime}),${xPos},if(lt(t,${
//                     text.startTime
//                   } + 1/${rotationSpeed}),${xPos} + (overlay_w/5) * cos(2*PI*${
//                     clockwise ? "" : "-"
//                   }${rotationSpeed}*(t-${text.startTime})),${xPos}))`,
//                   y: `if(lt(t,${text.startTime}),${yPos},if(lt(t,${
//                     text.startTime
//                   } + 1/${rotationSpeed}),${yPos} + (overlay_h/5) * sin(2*PI*${
//                     clockwise ? "" : "-"
//                   }${rotationSpeed}*(t-${text.startTime})),${yPos}))`,
//                   enable: `between(t,${text.startTime},${text.duration})`,
//                   eval: "frame",
//                 },
//                 inputs:
//                   idx === 0 ? ["0:v", "1:v"] : [`[tmp${idx}]`, `${idx + 1}:v`],
//                 outputs: idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
//               };
//               break;
//             case "fade":
//               const fadeDuration = parseFloat(text.transition.options.duration);
//               const startTime = parseFloat(text.startTime);
//               const fadeConfig = [
//                 {
//                   filter: "fade",
//                   options: {
//                     type: "in",
//                     start_time: text.startTime,
//                     duration: fadeDuration, // Fade duration in seconds
//                   },
//                   inputs: `1:v`, // Each input stream (starting from 1)
//                   outputs: `fade${idx + 1}`,
//                 },
//                 {
//                   filter: "overlay",
//                   options: {
//                     x: xPos,
//                     y: yPos,
//                     enable: `between(t,${parseInt(text.startTime)},${parseInt(
//                       text.duration
//                     )})`,
//                   },
//                   inputs:
//                     idx === 0
//                       ? ["0:v", `fade${idx + 1}`]
//                       : [`[tmp${idx}]`, `fade${idx + 1}`],
//                   outputs:
//                     idx === texts.length - 1 ? "result" : `[tmp${idx + 1}]`,
//                 },
//               ];
//               return fadeConfig;
//             default:
//               break;
//           }
//         }
//         return filterConfig;
//       });

//       processedVideo
//         .complexFilter(configuration, "result")
//         .outputOptions(["-c:v libx264", "-c:a aac", "-map 0:a:0"])
//         .output(outputPath)
//         .on("end", () => resolve(outputFilename))
//         .on("error", reject)
//         .run();
//     });
//   });
// };

// const convertImageToVideo = (imagePath, duration, outputPath) => {
//   return new Promise((resolve, reject) => {
//     ffmpeg(imagePath)
//       .loop(duration)
//       .fps(30)
//       .outputOptions(["-c:v libx264", "-pix_fmt yuv420p", "-vf scale=1920:1080"])
//       .save(outputPath)
//       .on("end", () => resolve(outputPath))
//       .on("error", reject);
//   });
// };

// const processCsvFile = (csvFilePath) => {
//   return new Promise((resolve, reject) => {
//     const guestNames = [];
//     fs.createReadStream(csvFilePath)
//       .pipe(csv())
//       .on("data", (data) => guestNames.push(data))
//       .on("end", () => {
//         fs.unlinkSync(csvFilePath);
//         resolve(guestNames);
//       })
//       .on("error", reject);
//   });
// };

// router.post(
//   "/upload",
//   upload.fields([
//     { name: "video", maxCount: 1 },
//     { name: "guestNames", maxCount: 1 },
//     { name: "image", maxCount: 1 },
//   ]),
//   async (req, res) => {
//     try {
//       const { textProperty, scalingFont, scalingW, scalingH, duration } = req.body;

//       const csvFilePath = req.files.guestNames[0].path;
//       let inputPath = req.files.video ? req.files.video[0].path : null;
//       const imageFilePath = req.files.image ? req.files.image[0].path : null;

//       if (imageFilePath) {
//         inputPath = path.join(VIDEO_UPLOAD_DIR, `${Date.now()}.mp4`);
//         await convertImageToVideo(imageFilePath, duration || 10, inputPath);
//         fs.unlinkSync(imageFilePath); // Clean up the uploaded image file
//       }

//       const texts = JSON.parse(textProperty);

//       if (!texts || !inputPath) {
//         return res
//           .status(400)
//           .json({ error: "Please provide the guest list and video or image." });
//       }

//       const guestNames = await processCsvFile(csvFilePath);

//       const videoFilenames = await Promise.all(
//         guestNames.map((val, i) =>
//           createVideoForGuest(
//             inputPath,
//             texts,
//             scalingFont,
//             scalingH,
//             scalingW,
//             val,
//             i
//           )
//         )
//       );

//       const zipFilename = `processed_videos_${Date.now()}.zip`;
//       const zipPath = path.join(UPLOAD_DIR, zipFilename);

//       const output = fs.createWriteStream(zipPath);
//       const archive = archiver("zip", { zlib: { level: 9 } });

//       archive.on("error", (err) => {
//         throw err;
//       });

//       archive.pipe(output);

//       videoFilenames.forEach((filename) => {
//         const filePath = path.join(UPLOAD_DIR, filename);
//         archive.file(filePath, { name: filename });
//       });

//       await archive.finalize();
//       output.on("close", () => {
//         res.status(201).json({
//           zipUrl: `http://localhost:8000/uploads/${zipFilename}`,
//           videoUrls: videoFilenames.map(
//             (filename) => ({
//               name: "Video",
//               link: `http://localhost:8000/uploads/${filename}`,
//             })
//           ),
//         });
//       });
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ error: "Video processing failed" });
//     } finally {
//       if (req.files.video) fs.unlinkSync(req.files.video[0].path); // Clean up the uploaded video file
//     }
//   }
// );

// module.exports = router;
