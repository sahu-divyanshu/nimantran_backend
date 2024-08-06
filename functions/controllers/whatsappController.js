const twilio = require("twilio");
const { Event } = require("../models/Event");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const individualWhatsuppInvite = async (req, res) => {
  try {
    let { name, mobileNumber, link } = req.body;
    const { eventId } = req.query;
    // mobileNumber =
    mobileNumber?.at(0) === "+" ? mobileNumber : "+" + mobileNumber;

    const messageResp = await client.messages.create({
      body: "Your appointment is coming up on July 21 at 10PM",
      from: "whatsapp:+14155238886",
      to: `whatsapp:${mobileNumber}`,
    });

    const savedEvent = await Event.findById(eventId);

    savedEvent.guests.forEach((guest) => {
      console.log(guest.mobileNumber, mobileNumber);
      if (guest.mobileNumber === mobileNumber) {
        guest.sid.push(messageResp.sid);
      }
    });

    const result = await savedEvent.save();

    return res.status(200).json({ message: "message sent.", data: result });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

const fetchWhatsappInfo = async (req, res) => {
  try {
    client
      .messages("SM67c7e07c84e22927014bb984c3c39eee")
      .fetch()
      .then((message) => {
        console.log(`Message SID: ${message.sid}`);
        console.log(`Message Status: ${message.status}`);
        console.log(`Error Code: ${message.errorCode}`);
        console.log(`Error Message: ${message.errorMessage}`);
      });
  } catch (error) {}
};

// fetchWhatsappInfo();

module.exports = { individualWhatsuppInvite };
