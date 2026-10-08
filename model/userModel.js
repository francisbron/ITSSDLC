const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true    // no duplicates
    },
    password: String,
    role: String
});

module.exports = mongoose.model("User", userSchema)