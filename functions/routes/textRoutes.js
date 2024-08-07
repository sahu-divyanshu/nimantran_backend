const { saveText } = require("../controllers/textController");
const { authenticateJWT } = require("../middleware/auth");

const router = require("express").Router();

// router.post("/texts/save",authenticateJWT,saveText)
// router.post("/texts/eventId=:eventId",authenticateJWT,getTexts)


