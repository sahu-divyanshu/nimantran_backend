const mongoose = require("mongoose");

const TextSchema = new mongoose.Schema({
    backgroundColor: String,
    duration:{
        type:Number
    },
    fontColor:{
        type:String
    },
    fontFamily:{
        type:String
    },
    fontSize:{
        type:Number
    },
    fontStyle:{
        type:String
    },
    fontWeight:{
        type:String
    },
    hidden:{
        type:Boolean
    },
    id:{
        type:Number
    },
    page:{
        type:Number
    },
    position:{
        x:{
            type:Number
        },
        y:{
            type:Number
        },
    },
    size:{
        height:{ 
            type:Number
        },
        width:{
            type:Number
        },
    },
    startTime:{
        type:Number
    },
    text:{
        type:String
    },
    transition:{
        options:{
            type:Object,
        },
        type:{
            type:String
        },
    },
    length:{
        type:Number
    },

}, { timestamps: true })

const Text = mongoose.model("Text",TextSchema)
module.exports = {Text}

