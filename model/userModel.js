const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ["student", "technician", "admin"],
        default: "student",
        required: true
    },
    activeReservationCount: {
        type: Number,
        min: 0,
        default: 0
    }
}, { strict: "throw", strictQuery: true });

module.exports = mongoose.model("User", userSchema)