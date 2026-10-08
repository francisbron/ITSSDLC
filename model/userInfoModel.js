const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true    // no duplicates
    },
    name: String,
    course: String,
    yearLevel: String,
    bio: String
});

module.exports = mongoose.model("UserInfo", userSchema)