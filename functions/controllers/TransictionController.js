const mongoose = require("mongoose");
const CreditTransaction = require("../models/Credits");

const getAllCustomerTransactions = async (req, res) => {
  try {
    const { customerId } = req.params;

    // Validate customerId
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: "Invalid customer ID format" });
    }

    // Find all transactions where customerId matches
    const transactions = await CreditTransaction.find({recieverId:customerId}).populate("senderId").select("-password -token");

    // Check if transactions were found
    if (!transactions.length) {
      return res
        .status(404)
        .json({ message: "No transactions found for this customer." });
    }

    // Return the found transactions
    return res.status(200).json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error.message);
    return res
      .status(400)
      .json({ message: "Server error. Please try again later." });
  }
};

const getClientTransaction = async (req, res) => {
  try {
    const { _id } = req.user;
    const { areaOfUse } = req.query;
    let transaction = [];

    console.log(areaOfUse)

    if (areaOfUse === "transfer") {
      //   transaction = await CreditTransaction.aggregate([
      //     {
      //       $match: {
      //         areaOfUse: areaOfUse,
      //         senderId: _id,
      //       },
      //     },
      //     {
      //       $lookup: {
      //         from: "users", // Assuming your receiver collection is named 'users'
      //         localField: "recieverId",
      //         foreignField: "_id",
      //         as: "reciever",
      //       },
      //     },
      //     {
      //       $unwind: "$reciever",
      //     },
      //     {
      //       $lookup: {
      //         from: "event", // Assuming your event collection is named 'events'
      //         localField: "eventId",
      //         foreignField: "_id",
      //         as: "event",
      //       },
      //     },
      //     {
      //       $unwind: "$event",
      //     },
      //     {
      //       $project: {
      //         "reciever.name": 1,
      //         amount: 1,
      //         status: 1,
      //         transactionDate: 1,
      //         "event.eventName": 1,
      //       },
      //     },
      //   ]);

      transaction = await CreditTransaction.find({
        senderId: _id,
        areaOfUse: areaOfUse,
      })
        .populate("recieverId", "name");

    }

    if (["pdf", "image", "video"].includes(areaOfUse)) {
      transaction = await CreditTransaction.find({
        senderId: _id,
        areaOfUse: areaOfUse,
      }).populate("eventId");
    }

    return res.status(200).json(transaction);
  } catch (error) {
    console.error("Error fetching transactions:", error.message);
    return res
      .status(400)
      .json({ message: "Server error. Please try again later." });
  }
};

const adminTransactions = async (req, res) => {
  try {
    const { _id } = req.user;
    const transaction = await CreditTransaction.find({
      senderId: _id,
    }).populate("recieverId", "name");
    return res.status(200).json({
      message: "all transaction fetched successfully",
      data: transaction,
      success: true
    })
      
  } catch (error) {
    console.error("Error fetching transactions:", error.message);
    return res
      .status(400)
      .json({ message: "Server error. Please try again later." });
  }

}

module.exports = {
  getAllCustomerTransactions,
  getClientTransaction,
  adminTransactions
};
