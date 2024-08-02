const individualWhatsuppInvite = async (req, res) => {
  try {
    return res.status(200).json({ message: "message sent." });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

module.exports = { individualWhatsuppInvite };
