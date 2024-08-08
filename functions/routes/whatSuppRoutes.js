const router = require("express").Router();
const { authenticateJWT } = require("../middleware/auth");
const {
  individualWhatsuppInvite,
  fetchWhatsappInfo
} = require("../controllers/whatsappController");

// Send a Individual Invite on whatsapp
router.post("/individual", authenticateJWT, individualWhatsuppInvite);
router.get("/all", authenticateJWT, fetchWhatsappInfo)

module.exports = router;