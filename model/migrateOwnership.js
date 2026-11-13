const userModel = require("./userModel");
const reservationModel = require("./reservationModel");
const userInfoModel = require("./userInfoModel");

async function migrateOwnership() {
    const users = await userModel.find({})
        .select("_id email activeReservationCount")
        .lean();

    for (const user of users) {
        await reservationModel.updateMany(
            { email: user.email, userId: { $exists: false } },
            { $set: { userId: user._id } }
        );
        await userInfoModel.updateMany(
            { email: user.email, userId: { $exists: false } },
            { $set: { userId: user._id } }
        );

        if (typeof user.activeReservationCount !== "number") {
            const activeReservationCount = await reservationModel.countDocuments({
                userId: user._id,
                status: "active"
            });
            await userModel.updateOne(
                { _id: user._id, activeReservationCount: { $exists: false } },
                { $set: { activeReservationCount } }
            );
        }
    }

    const unownedActiveReservations = await reservationModel.countDocuments({
        status: "active",
        userId: { $exists: false }
    });
    if (unownedActiveReservations > 0) {
        throw new Error(
            `Ownership migration left ${unownedActiveReservations} active reservation(s) without a matching user`
        );
    }
}

module.exports = migrateOwnership;
