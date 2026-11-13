const mongoose = require("mongoose");

const reservationAuditSchema = new mongoose.Schema({
    action: {
        type: String,
        enum: ["booked", "edited", "cancelled", "no-show"],
        required: true,
        immutable: true
    },
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true
    },
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true
    },
    studentEmail: {
        type: String,
        required: true,
        immutable: true
    },
    reservationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reservation",
        required: true,
        immutable: true
    },
    room: {
        type: String,
        required: true,
        immutable: true
    },
    date: {
        type: String,
        required: true,
        immutable: true
    },
    seats: {
        type: [String],
        required: true,
        immutable: true
    },
    timeSlots: {
        type: [String],
        required: true,
        immutable: true
    },
    occurredAt: {
        type: Date,
        default: Date.now,
        immutable: true
    }
}, {
    strict: "throw",
    strictQuery: true,
    versionKey: false,
    collection: "reservation_audits"
});

reservationAuditSchema.pre("save", function () {
    if (!this.isNew) {
        throw new Error("Audit events cannot be changed after insertion");
    }
});

for (const operation of [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "replaceOne",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete"
]) {
    reservationAuditSchema.pre(operation, function () {
        throw new Error("Audit events cannot be changed or deleted");
    });
}

reservationAuditSchema.pre("deleteOne", { document: true, query: false }, function () {
    throw new Error("Audit events cannot be changed or deleted");
});

module.exports = mongoose.model("ReservationAudit", reservationAuditSchema);
