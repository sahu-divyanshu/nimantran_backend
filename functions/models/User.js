const mongoose = require("mongoose");

// Define the Request schema
const RequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  credits: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "completed", "rejected"],
    default: "pending",
  }
}, { timestamps: true });

// Define the User schema
const UserSchema = new mongoose.Schema({
  name:{
    type:String,
    required: true,
  },
  mobile: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  email:{
    type:String,
    required: true
  },
  dateOfBirth:{
    type:Date,
    required: function () {
      return this.role === "customer";
    },
  },
  location:{
    type:String,
    required: function () {
      return this.role === "customer";
    },
  },
  gender:{
    type:String,
    required: function () {
      return this.role === "customer";
    },
    enum:["Male","Female","Other"]
  },
  role: {
    type: String,
    enum: ["admin", "client", "customer"],
    required: true,
  },
  credits: {
    type: Number,
    default: 0
  },
  clientId: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.role === "customer";
      },
    },
  ],
  customers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  sendRequests: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
    },
  ],
  receiveRequests: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
    },
  ],
  events: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event"
    },
  ],
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);
const Request = mongoose.model("Request", RequestSchema);

module.exports = { User, Request };
