const mongoose = require("mongoose");

const userInfoSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    email: {
        type: String,
        unique: true,
        required: true
    },
    name: String,
    course: String,
    yearLevel: String,
    bio: String
}, { strict: "throw", strictQuery: true });

module.exports = mongoose.model("UserInfo", userInfoSchema)