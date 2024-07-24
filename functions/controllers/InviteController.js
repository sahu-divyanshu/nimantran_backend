
const individualInvite = async (req, res) => {
  try {
    console.log(req.body)
    const {senderName, mobile} = req.body;
    console.log(senderName, mobile)
    res.status(200).json({message: "message Sended Successfully"});
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = { individualInvite };
