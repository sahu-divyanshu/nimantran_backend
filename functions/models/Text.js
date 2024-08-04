const mongoose = require("mongoose");

const TextSchema = new mongoose.Schema({
    backgroundColor: String,
    duration: Number,
    fontColor: String,
    fontFamily: String,
    fontSize: Number,
    fontStyle: String,
    fontWeight: String,
    hidden: Boolean,
    id: Number,
    page: Number,
    position: {
        x: Number,
        y: Number,
    },
    size: {
        height: Number,
        width: Number,
    },
    startTime: Number,
    text: String,
    transition: {
        options: Object,
        type: String,
    },
    length: Number,
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event"
    }
}, { timestamps: true });

const Text = mongoose.model("Text", TextSchema);

module.exports = Text;
