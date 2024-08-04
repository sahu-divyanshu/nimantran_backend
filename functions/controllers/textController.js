const { authenticateJWT } = require("../middleware/auth.js");
const Text = require("../models/Text.js");
const { Text } = require("../models/Text.js");

const saveText = async (req, res) => {
    const {
        backgroundColor,
        duration,
        fontColor,
        fontFamily,
        fontSize,
        fontStyle,
        fontWeight,
        hidden,
        id,
        page,
        position,
        size,
        startTime,
        text,
        transition,
        length,
        eventId
    } = req.body;

    if (!text) return res.status(400).json({ message: "Text not found" });

    try {
        const textUpload = await Text.create({
            backgroundColor,
            duration,
            fontColor,
            fontFamily,
            fontSize,
            fontStyle,
            fontWeight,
            hidden,
            id,
            page,
            position,
            size,
            startTime,
            text,
            transition,
            length,
            eventId
        });

        if (!textUpload) {
            return res.status(400).json({ message: "Error uploading text" });
        }

        return res.status(200).json(textUpload);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
}




const mongoose = require("mongoose");
const { Text } = require("../models/Text.js");

const getTexts = async (req, res) => {
    const user = req.user?._id;
    const { eventId } = req.params;
    
    if (!eventId) return res.status(400).json({ message: "Event ID not found" });
    if (!user) return res.status(400).json({ message: "User not found" });

    try {
        const texts = await Text.aggregate([
            {
                $match: {
                    eventId: new mongoose.Types.ObjectId(eventId)
                }
            },
            {
                $lookup: {
                    from: "events",
                    localField: "eventId",
                    foreignField: "_id",
                    as: "eventDetails",
                    pipeline: [
                        {
                            $project: {
                                _id: 1, // Include the _id field if needed
                                backgroundColor: 1,
                                duration: 1,
                                fontColor: 1,
                                fontFamily: 1,
                                fontSize: 1,
                                fontStyle: 1,
                                fontWeight: 1,
                                hidden: 1,
                                id: 1,
                                page: 1,
                                position: 1,
                                size: 1,
                                startTime: 1,
                                text: 1,
                                transition: 1,
                                length: 1,
                                eventId: 1
                            }
                        }
                    ]
                }
            },
            {
                $unwind: "$eventDetails"
            },
            {
                $project: {
                    _id: 1,
                    backgroundColor: 1,
                    duration: 1,
                    fontColor: 1,
                    fontFamily: 1,
                    fontSize: 1,
                    fontStyle: 1,
                    fontWeight: 1,
                    hidden: 1,
                    id: 1,
                    page: 1,
                    position: 1,
                    size: 1,
                    startTime: 1,
                    text: 1,
                    transition: 1,
                    length: 1,
                    eventId: 1,
                    eventDetails: 1 // Include the event details
                }
            }
        ]);

        return res.status(200).json(texts);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
}




module.exports = {saveText,getTexts};