const router = require("express").Router();
const {
  getCustomer,
  updateCustomer,
} = require("../controllers/customerController");
const {
  getEvent,
  getAllCustomerEvents,
} = require("../controllers/eventController");
const { authenticateJWT, roleMiddleware } = require("../middleware/auth");

router.get(
  "/customerInfo/:customerId",
  authenticateJWT,
  getCustomer
);
router.put(
  "/updateCustomer/:customerId",
  authenticateJWT,
  updateCustomer
);
router.get(
  "/customerEvents/:customerId",
  authenticateJWT,
  getAllCustomerEvents
);



router.get('/customerInfo/:customerId',authenticateJWT,getCustomer)
router.put('/updateCustomer/:customerId',authenticateJWT,updateCustomer)
router.get('/customerEvents/:customerId',authenticateJWT,getAllCustomerEvents)

module.exports = router;
