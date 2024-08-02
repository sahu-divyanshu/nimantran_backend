const router = require("express").Router();
const { authenticateJWT } = require("../middleware/auth");
const {
  individualWhatsuppInvite,
} = require("../controllers/whatsappController");

// Send a Individual Invite on whatsapp
router.post("/individual", authenticateJWT, individualWhatsuppInvite);

module.exports = router;
