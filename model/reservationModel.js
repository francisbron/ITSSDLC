const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    email: {
        type: String,
        required: true
    },
    reservationID: String,
    date: {
        type: String,
        required: true
    },
    room: {
        type: String,
        required: true
    },
    timeStart: String,
    timeEnd: String,
    seats: {
        type: [String],
        required: true
    },
    timeSlots: {
        type: [String],
        required: true
    },
    isAnonymous: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'no-show', 'completed'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { strict: "throw", strictQuery: true });

module.exports = mongoose.model("Reservation", reservationSchema)