const mongoose = require("mongoose");
const userModel = require("../model/userModel");
const reservationModel = require("../model/reservationModel");
const reservationAuditModel = require("../model/reservationAuditModel");

const MAX_ACTIVE_RESERVATIONS = 2;

class ReservationLimitError extends Error {
    constructor() {
        super("A student can have at most two active reservations");
        this.name = "ReservationLimitError";
    }
}

function createAuditEvent(reservation, action, actorId) {
    return new reservationAuditModel({
        action,
        actorId,
        studentId: reservation.userId,
        studentEmail: reservation.email,
        reservationId: reservation._id,
        room: reservation.room,
        date: reservation.date,
        seats: reservation.seats,
        timeSlots: reservation.timeSlots
    });
}

async function createReservation(student, fields, actorId = student._id) {
    const session = await mongoose.startSession();
    let reservation;

    try {
        await session.withTransaction(async () => {
            const quotaResult = await userModel.updateOne(
                {
                    _id: student._id,
                    role: "student",
                    activeReservationCount: { $lt: MAX_ACTIVE_RESERVATIONS }
                },
                { $inc: { activeReservationCount: 1 } },
                { session }
            );

            if (quotaResult.modifiedCount !== 1) {
                throw new ReservationLimitError();
            }

            reservation = new reservationModel({
                ...fields,
                userId: student._id,
                email: student.email,
                status: "active"
            });
            await reservation.save({ session });
            await createAuditEvent(reservation, "booked", actorId).save({ session });
        });

        return reservation;
    } finally {
        await session.endSession();
    }
}

async function updateReservation(reservationId, studentId, fields, actorId) {
    const session = await mongoose.startSession();
    let reservation;

    try {
        await session.withTransaction(async () => {
            reservation = await reservationModel.findOneAndUpdate(
                { _id: reservationId, userId: studentId },
                { $set: fields },
                { new: true, runValidators: true, session }
            );

            if (reservation) {
                await createAuditEvent(reservation, "edited", actorId).save({ session });
            }
        });
        return reservation;
    } finally {
        await session.endSession();
    }
}

async function changeReservationStatus(reservationId, status, actorId, ownerId = null) {
    const session = await mongoose.startSession();
    let reservation;

    try {
        await session.withTransaction(async () => {
            const filter = { _id: reservationId, status: "active" };
            if (ownerId) filter.userId = ownerId;

            reservation = await reservationModel.findOneAndUpdate(
                filter,
                { $set: { status } },
                { new: true, runValidators: true, session }
            );

            if (!reservation) return;

            const quotaResult = await userModel.updateOne(
                {
                    _id: reservation.userId,
                    activeReservationCount: { $gt: 0 }
                },
                { $inc: { activeReservationCount: -1 } },
                { session }
            );

            if (quotaResult.modifiedCount !== 1) {
                throw new Error("Active reservation counter is inconsistent");
            }

            await createAuditEvent(reservation, status, actorId).save({ session });
        });
        return reservation;
    } finally {
        await session.endSession();
    }
}

module.exports = {
    ReservationLimitError,
    createReservation,
    updateReservation,
    changeReservationStatus
};
