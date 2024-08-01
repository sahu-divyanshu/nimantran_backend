const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({
  customerId:{
    type:mongoose.Schema.Types.ObjectId,
    required:true,
    ref:"User"
  },
  eventName: {
    type: String,
    required: true,
  },
  dateOfOrganising: {
    type: Date,
    required: true,
  },
  editType: {
    type: String, 
    enum: ["imageEdit", "cardEdit", "videoEdit"]
  }, 
  guests: [
    {
      _id: false,
      name: {
        type: String,
        required: true,
      },
      mobileNumber: {
        type: String,
        required: true
      },
      pdfUrl:{
        type:String,
      },
      imageUrl:{
        type:String
      },
      videoUrl:{
        type:String
      }
    },
  ],
  location:{
    type:String,
    required:true
  },
  active: {
    type: Boolean,
    default: false,
    enum: [true, false],
  },
});

const Event = mongoose.model("Event", EventSchema);

module.exports = { Event};
