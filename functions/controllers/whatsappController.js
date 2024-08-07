const twilio = require("twilio");
const { Event } = require("../models/Event");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const individualWhatsuppInvite = async (req, res) => {
  try {
    let { name, mobileNumber, link } = req.body;
    const { eventId } = req.query;
    mobileNumber =
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
    const { eventId } = req.query;
    const guests = await Event.findById(eventId)?.select("guests");
    if (!guests) throw new Error("Event not Found");

    const fetchedMessages = await Promise.all(
      guests?.guests?.map(async (guest) => {
        const populateGuests = await Promise.all(
          guest?.sid?.map(async (sid) => {
            const message = await client.messages(sid).fetch();
            return message;
          })
        );
        guest.sid = populateGuests;
        return guest;
      })
    );

    return res.status(200).json({ data: fetchedMessages });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

module.exports = { individualWhatsuppInvite, fetchWhatsappInfo };
