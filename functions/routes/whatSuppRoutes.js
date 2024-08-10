const router = require("express").Router();
const { authenticateJWT } = require("../middleware/auth");
const {
  individualWhatsuppBusinessInvite,
  fetchWhatsappBusinessInfo,
  generateQR, 
  individualWhatsuppPersonalInvite,
  bulkWhatsuppPersonalInvite
} = require("../controllers/whatsappController");

router.post("/individual", authenticateJWT, individualWhatsuppBusinessInvite);
router.get("/all", authenticateJWT, fetchWhatsappBusinessInfo)

router.get("/generate-qr", authenticateJWT, generateQR)
router.post("/individualPersonal", authenticateJWT, individualWhatsuppPersonalInvite);
router.get("/allPersonal", authenticateJWT, bulkWhatsuppPersonalInvite)

module.exports = router;

