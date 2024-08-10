const twilio = require("twilio"); // for business messages
const { Event } = require("../models/Event");
const { Client, MessageMedia } = require("whatsapp-web.js"); // for personal messages
const qrcode = require("qrcode");
const { response } = require("express");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const clientPersonal = new Client();
let qrCodeData = "";

clientPersonal.on("qr", (qr) => {
  qrcode.toDataURL(qr, (err, url) => {
    qrCodeData = url;
  });
});

clientPersonal.on("ready", () => {
  console.log("WhatsApp Web is ready!");
});

clientPersonal.initialize();

const generateQR = (req, res) => {
  if (qrCodeData) {
    res.status(200).send({ qrCode: qrCodeData });
  } else {
    res.status(200).send({ qrCode: null });
  }
};

const individualWhatsuppPersonalInvite = async (req, res) => {
  try {
    const { number, mediaUrl } = req.body;
    const chatId = `${number}@c.us`;
    const caption = "This is a Invitation Message";
    const { eventId } = req.query;

    // Fetch the media from the Firebase URL
    const media = await MessageMedia.fromUrl(mediaUrl);

    // Send the media with an optional caption
    const response = await clientPersonal.sendMessage(chatId, media, {
      caption,
    });

    res.status(200).send({ success: true, response });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
};

const bulkWhatsuppPersonalInvite = async (req, res) => {
  try {
    const { eventId } = req.query;
    const guests = await Event.findById(eventId).select("guests");

    guests?.guests?.forEach(async (guest) => {
      const chatId = `${guest?.mobileNumber}@c.us`;
      const caption = "This is a Invitation Message";
      const mediaUrl = guest.link;

      // Fetch the media from the Firebase URL
      const media = await MessageMedia.fromUrl(mediaUrl);

      // Send the media with an optional caption
      const response = await clientPersonal.sendMessage(chatId, media, {
        caption,
      });

      console.log(response);
    });

    res.status(200).send({ success: true });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
};

const individualWhatsuppBusinessInvite = async (req, res) => {
  try {
    let { mobileNumber, link } = req.body;
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

const fetchWhatsappBusinessInfo = async (req, res) => {
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

module.exports = {
  individualWhatsuppBusinessInvite,
  fetchWhatsappBusinessInfo,
  individualWhatsuppPersonalInvite,
  generateQR,
  bulkWhatsuppPersonalInvite,
};
