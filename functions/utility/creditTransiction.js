const CreditTransaction = require("../models/Credits");

// areaOfUse: {
//     type: String,
//     enum: ['video', 'image', 'pdf','transfer'],
//     required: true
//   },
//   senderId: {
//     type: Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   recieverId: {
//     type: Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   eventId: {
//     type: Schema.Types.ObjectId,
//     ref: 'Event',
//     required: false
//   },
//   amount: {
//     type: Number,
//     required: true
//   },
//   status:{
//     type:String,
//     enum:['pending','rejected','accepted'],
//     required:true
//   },
//   transactionDate: {
//     type: Date,
//     default: Date.now
//   }

const createTransaction = async (
  areaOfUse,
  senderId,
  recieverId,
  amount,
  status,
  eventId
) => {
  try {
    // Validate required fields
    if (
      !areaOfUse ||
      !["video", "image", "pdf", "transfer"].includes(areaOfUse)
    ) {
      throw new Error("Invalid area of use");
    }
    if (!senderId || !amount) {
      throw new Error("Missing required fields");
    }

    if (!status || !["pending", "rejected", "completed"].includes(status)) {
      throw new Error("Missing status of transaction");
    }

    // Create a new transaction
    const transaction = new CreditTransaction({
      areaOfUse,
      senderId,
      recieverId,
      eventId,
      amount,
      status,
      transactionDatej: new Date(),
    });

    // Save the transaction to the database
    await transaction.save();

    // Return the saved transaction
    return transaction;
  } catch (error) {
    console.error("Error creating transaction:", error.message);
    return error;
  }
};

module.exports = createTransaction;
