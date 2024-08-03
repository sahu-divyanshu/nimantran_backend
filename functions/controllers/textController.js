const { authenticateJWT } = require("../middleware/auth.js");
const Text = require("../models/Text.js");

const saveText = async(req,res) =>{
    const {text} = req.body;
    // const {eventId} =  req.params
    
    // const event = await Event.findById(eventId);
    // if(!event) return res.status(404).json({message: "Event not found"})

    try {
        const textUpload = await Text.create({
            text ,
        })
        if(!textUpload){
            return res.status(400).json({message: "Error uploading text" })
        }
        return res.status(200).json({text})
        

    } catch (error) {
        console.log(error)
    }


}

const getText = async(req,res) =>{
    const user = req.user?._id;
    const {id} = req.params;
    if(!user) res.status(400).json({message: "user not found" })

    try {
        
    } catch (error) {
        
    }
}


module.exports = {saveText};