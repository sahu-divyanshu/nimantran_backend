const { saveText ,getTexts} = require("../controllers/textController");
const { authenticateJWT } = require("../middleware/auth");

const router = require("express").Router();

router.post("/texts/save",authenticateJWT,saveText)
router.get("/texts/get",authenticateJWT,getTexts)

module.exports = router;
