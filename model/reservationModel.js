const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema({
    email: String,
    reservationID: String,
    date: String,
    room: String,
    timeStart: String,
    timeEnd: String,
    seats: [String],
    timeSlots:[String],
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
});

module.exports = mongoose.model("Reservation", reservationSchema)