const router = require("express").Router();
const { authenticateJWT, roleMiddleware } = require("../middleware/auth");
const { getClient, createCustomer, transferCredit, purchaseRequestFromAdmin, getRequests } = require("../controllers/clientController");

// Client - Information
router.get(
  "/",
  authenticateJWT,
  roleMiddleware(["client"]),
  getClient
);
router.get(
  "/client-requests",
  authenticateJWT,
  roleMiddleware(["client"]),
  getRequests
);

// Client - Create Customer
router.post(
  "/create-customer",
  authenticateJWT,
  roleMiddleware(["client"]),
  createCustomer
);

// Client - Transfer Credits to Customer
router.post(
  "/transfer-credits",
  authenticateJWT,
  roleMiddleware(["client"]),
  transferCredit
);

// purchase credit request from admin
router.post(
  "/purchase-request-from-admin",
  authenticateJWT,
  roleMiddleware(["client"]),
  purchaseRequestFromAdmin
);

module.exports = router;
