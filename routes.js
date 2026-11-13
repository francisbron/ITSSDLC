const express = require("express");
const router = express.Router();
const path = require("path");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const userModel = require("./model/userModel");
const reservationModel = require("./model/reservationModel");
const userInfoModel = require("./model/userInfoModel");
const {
    ReservationLimitError,
    createReservation,
    updateReservation,
    changeReservationStatus
} = require("./services/reservationService");

const VALID_LABS = new Set(["LAB1", "LAB2", "LAB3"]);
const VALID_SEATS = new Set(
    ["A", "B", "C", "D", "E"].flatMap(row =>
        Array.from({ length: 8 }, (_, index) => `${row}${index + 1}`)
    )
);
const VALID_TIME_SLOTS = new Set(
    Array.from({ length: 24 }, (_, index) => {
        const hour = 8 + Math.floor(index / 2);
        const minute = index % 2 === 0 ? "00" : "30";
        return `${String(hour).padStart(2, "0")}:${minute}`;
    })
);

function hasOnlyFields(body, allowedFields) {
    const allowed = new Set(allowedFields);
    return Object.keys(body).every(field => allowed.has(field));
}

function readArray(body, primaryKey, alternateKey) {
    const value = body[primaryKey] || body[alternateKey];
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

function isValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

function isStaff(user) {
    return user.role === "technician" || user.role === "admin";
}

function respondWithReservationError(res, err, message) {
    if (err instanceof ReservationLimitError) {
        return res.status(409).send(err.message);
    }
    if (err.name === "ValidationError" || err.name === "StrictModeError") {
        return res.status(400).send(err.message);
    }
    console.error(err);
    return res.status(500).send(message);
}

/*
*   Helper function to build seat rows with reservation info
*/
async function buildSeatRows(lab, date, currentSeats = [], excludeReservationId = null) {
    const rows = ['A', 'B', 'C', 'D', 'E'];
    const seatsPerRow = 8;

    const query = {
        room: lab,
        date: date,
        status: 'active'
    };

    // exclude current reservation so its seats don't show as taken
    if (excludeReservationId) {
        query._id = { $ne: excludeReservationId };
    }

    const existingReservations = await reservationModel.find(query);

    const takenMap = {};
    existingReservations.forEach(res => {
        res.seats.forEach(seat => {
            takenMap[seat] = {
                email: res.email,
                isAnonymous: res.isAnonymous
            };
        });
    });

    return rows.map(label => ({
        label,
        seats: Array.from({ length: seatsPerRow }, (_, i) => {
            const num = i + 1;
            const id = `${label}${num}`;
            const takenInfo = takenMap[id];
            const isCurrent = currentSeats.includes(id);
            return {
                id,
                num,
                taken: !!takenInfo && !isCurrent,
                current: isCurrent,
                anonymous: takenInfo ? takenInfo.isAnonymous : false,
                reservedBy: takenInfo ? takenInfo.email : null
            };
        })
    }));
}

/*
*   Routes
*/
router.get("/", (req, res) => {
    if (req.session.user) {
        return res.redirect("/dashboard");
    }
    res.sendFile(path.join(__dirname, "index.html")); 
});

/**
 *  Profile
 */

router.get("/profile", requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userInfo = await userInfoModel.findOne({ userId }).lean();
        const reservations = await reservationModel.find({ userId, status: "active" }).lean();

        res.render("profile", {
            title: "Profile",
            user: req.session.user,
            isTechnician: isStaff(req.session.user),
            profileActive: true,
            userInfo,
            reservations
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading profile");
    }
});

router.put("/users/:userId/profile", requireLogin, async (req, res) => {
    if (!isValidObjectId(req.params.userId)) {
        return res.status(404).json({ success: false, message: "Profile not found" });
    }
    if (req.params.userId !== req.session.user.id) {
        return res.status(403).json({ success: false, message: "Not authorized" });
    }
    if (!hasOnlyFields(req.body, ["course", "yearLevel", "bio"])) {
        return res.status(400).json({ success: false, message: "Unexpected profile field" });
    }

    const { course, yearLevel, bio } = req.body;
    const validCourses = [
        "Computer Science",
        "Software Engineering",
        "Information Technology",
        "Data Science",
        "Information Systems"
    ];
    const validYearLevels = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

    if (!validCourses.includes(course) ||
        !validYearLevels.includes(yearLevel) ||
        typeof bio !== "string" ||
        bio.length > 500) {
        return res.status(400).json({ success: false, message: "Invalid profile details" });
    }

    try {
        await userInfoModel.findOneAndUpdate(
            { userId: req.session.user.id },
            {
                $set: { course, yearLevel, bio },
                $setOnInsert: { email: req.session.user.email }
            },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Failed to update profile" });
    }
});

router.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error(err);
        res.redirect("/");
    })
});

/**
 *  Pages
 */

// REGISTER - /register
router.get("/register", async (req, res) => {
    res.render("register");
});

router.post("/register", async (req, res) => {
    if (!hasOnlyFields(req.body, ["email", "password"])) {
        return res.status(400).send("Unexpected registration field");
    }
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" ||
        !email.trim() || password.length < 8) {
        return res.status(400).send("Enter a valid email and a password of at least 8 characters");
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new userModel({
            email: email.trim(),
            password: hashedPassword,
            role: "student",
            activeReservationCount: 0
        });
        await newUser.save();

        res.send("User registered");
    } catch (err) {
        if (err.code === 11000) return res.status(409).send("An account with that email already exists");
        console.error(err);
        res.status(500).send("Registration failed");
    }
});

router.get("/api/me", requireLogin, (req, res) => {
    res.json({ id: req.session.user.id, email: req.session.user.email });
});

// LOGIN - /index
router.post("/login", async(req, res) => {
    try {
        if (!hasOnlyFields(req.body, ["email", "password"])) {
            return res.status(400).send("Unexpected login field");
        }
        const { email, password } = req.body;
        if (typeof email !== "string" || typeof password !== "string") {
            return res.status(400).send("Invalid login details");
        }
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.send("Invalid email or password");
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.send("Invalid email or password");
        }

        req.session.user = {
            id: user._id.toString(),
            email: user.email,
            role: user.role
        };
        return res.redirect("/dashboard");

    } catch (err) {
        console.error(err);
        res.status(500).send("Login error");
    }
});

// Middleware - checks if logged in
function requireLogin(req, res, next) {
    if (!req.session.user || !isValidObjectId(req.session.user.id)) {
        return res.redirect('/');
    }
    next();
}

// Middleware - checks if technician
function requireTechnician(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'technician' && req.session.user.role !== 'admin') {
        return res.redirect('/userReservations');
    }
    next();
}

router.get("/dashboard", requireLogin, (req, res) => {

    const userRole = req.session.user.role;
    
    res.render("dashboard", {
        title: "Dashboard",
        user: req.session.user,
        isTechnician: userRole === 'technician' || userRole === 'admin',
        dashboardActive: true
    });
});

// About page
router.get("/about", requireLogin, (req, res) => {
    res.render("about", {
        title: "About",
        user: req.session.user,
        isTechnician: req.session.user.role === 'technician' || req.session.user.role === 'admin',
        aboutActive: true
    });
});

/**
 *  Making Reservation
 */

router.get("/makeReservation", requireLogin, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const seatRows = await buildSeatRows('LAB1', today);
        res.render("makeReservation", {
            title: "Make Reservation",
            user: req.session.user,
            isTechnician: req.session.user.role === 'technician' || req.session.user.role === 'admin',
            makeReservationActive: true,
            seatRows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading reservation page");
    }
});

router.post("/makeReservation", requireLogin, async (req, res) => {
    if (req.session.user.role !== "student") {
        return res.status(403).send("Only students can make reservations");
    }
    if (!hasOnlyFields(req.body, [
        "lab", "date", "timeSlots[]", "timeSlots", "seats[]", "seats", "isAnonymous"
    ])) {
        return res.status(400).send("Unexpected reservation field");
    }

    const timeSlots = readArray(req.body, "timeSlots[]", "timeSlots");
    const seats = readArray(req.body, "seats[]", "seats");
    const { lab, date, isAnonymous } = req.body;

    if (!VALID_LABS.has(lab) ||
        !isValidDate(date) ||
        timeSlots.length === 0 ||
        !timeSlots.every(slot => typeof slot === "string" && VALID_TIME_SLOTS.has(slot)) ||
        seats.length === 0 ||
        !seats.every(seat => typeof seat === "string" && VALID_SEATS.has(seat)) ||
        new Set(seats).size !== seats.length ||
        (isAnonymous !== undefined && isAnonymous !== "true")) {
        return res.status(400).send("Invalid reservation details");
    }

    try {
        const student = await userModel.findById(req.session.user.id);
        if (!student || student.role !== "student") {
            return res.status(403).send("Only students can make reservations");
        }

        await createReservation(student, {
            date,
            room: lab,
            timeSlots,
            seats,
            isAnonymous: isAnonymous === "true"
        });
        res.redirect("/userReservations");
    } catch (err) {
        respondWithReservationError(res, err, "Error creating reservation");
    }
});

/**
 *  User Reservations
 */

router.get("/userReservations", requireLogin, async (req, res) => {
    try {
        const reservations = await reservationModel.find({
            userId: req.session.user.id,
            status: 'active'
        }).lean();

        res.render("userReservations", {
            title: "My Reservations",
            user: req.session.user,
            isTechnician: req.session.user.role === 'technician' || req.session.user.role === 'admin',
            userReservationsActive: true,
            reservations
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching reservations");
    }
});

/**
 *  Edit Reservation
 */

router.get("/editReservation/:id", requireLogin, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return res.status(404).send("Reservation not found");
        const reservation = await reservationModel.findById(req.params.id);

        if (!reservation) return res.status(404).send("Reservation not found");
        if (reservation.userId.toString() !== req.session.user.id && !isStaff(req.session.user)) {
            return res.status(403).send("Not authorized");
        }

        const seatRows = await buildSeatRows(
            reservation.room, 
            reservation.date, 
            reservation.seats,
            req.params.id
        );

        res.render("editReservation", {
            title: "Edit Reservation",
            user: req.session.user,
            isTechnician: req.session.user.role === 'technician' || req.session.user.role === 'admin',
            userReservationsActive: true,
            reservation,
            seatRows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching reservation");
    }
});

router.post("/editReservation/:id", requireLogin, async (req, res) => {
    if (!isValidObjectId(req.params.id)) return res.status(404).send("Reservation not found");
    if (!hasOnlyFields(req.body, ["date", "timeSlots[]", "timeSlots", "seat", "isAnonymous"])) {
        return res.status(400).send("Unexpected reservation field");
    }

    const timeSlots = readArray(req.body, "timeSlots[]", "timeSlots");
    const seat = req.body.seat;
    if ((req.body.date !== undefined && !isValidDate(req.body.date)) ||
        !timeSlots.every(slot => typeof slot === "string" && VALID_TIME_SLOTS.has(slot)) ||
        (seat !== undefined && (typeof seat !== "string" || !VALID_SEATS.has(seat))) ||
        (req.body.isAnonymous !== undefined && req.body.isAnonymous !== "true")) {
        return res.status(400).send("Invalid reservation details");
    }

    try {
        const reservation = await reservationModel.findById(req.params.id);

        if (!reservation) return res.status(404).send("Reservation not found");
        if (reservation.userId.toString() !== req.session.user.id) {
            return res.status(403).send("Not authorized");
        }

        const updated = await updateReservation(
            req.params.id,
            req.session.user.id,
            {
                date: req.body.date || reservation.date,
                timeSlots: timeSlots.length > 0 ? timeSlots : reservation.timeSlots,
                seats: seat === undefined ? reservation.seats : [seat],
                isAnonymous: req.body.isAnonymous === "true"
            },
            req.session.user.id
        );
        if (!updated) return res.status(404).send("Reservation not found");
        res.redirect("/userReservations");
    } catch (err) {
        respondWithReservationError(res, err, "Error updating reservation");
    }
});

/**
 *  Cancel Reservation
 */

router.post("/cancelReservation/:id", requireLogin, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return res.status(404).send("Reservation not found");
        const reservation = await reservationModel.findById(req.params.id);

        if (!reservation) return res.status(404).send("Reservation not found");
        if (reservation.userId.toString() !== req.session.user.id) {
            return res.status(403).send("Not authorized");
        }

        const cancelled = await changeReservationStatus(
            req.params.id,
            "cancelled",
            req.session.user.id,
            req.session.user.id
        );
        if (!cancelled) return res.status(409).send("Reservation is no longer active");

        res.redirect("/userReservations");
    } catch (err) {
        respondWithReservationError(res, err, "Error cancelling reservation");
    }
});

/**
 *  Technician View
 */

router.get("/techView", requireTechnician, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const reservations = await reservationModel.find({
            date: today,
            status: { $in: ['active', 'no-show'] }
        }).lean();

        const reservationsWithFlag = reservations.map(r => ({
            ...r,
            isNoShow: r.status === 'no-show'
        }));

        res.render("techView", {
            title: "Technician Dashboard",
            user: req.session.user,
            isTechnician: true,
            techViewActive: true,
            reservations: reservationsWithFlag
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching tech view");
    }
});

router.post("/removeReservation/:id", requireTechnician, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) return res.status(404).send("Reservation not found");
        const reservation = await changeReservationStatus(
            req.params.id,
            "no-show",
            req.session.user.id
        );
        if (!reservation) return res.status(404).send("Active reservation not found");
        res.redirect("/techView");
    } catch (err) {
        respondWithReservationError(res, err, "Error removing reservation");
    }
});

router.post("/walkIn", requireTechnician, async (req, res) => {
    if (!hasOnlyFields(req.body, ["studentEmail", "lab", "seat"])) {
        return res.status(400).send("Unexpected walk-in field");
    }
    if (typeof req.body.studentEmail !== "string" ||
        !VALID_LABS.has(req.body.lab) ||
        !VALID_SEATS.has(req.body.seat)) {
        return res.status(400).send("Invalid walk-in reservation details");
    }

    try {
        const student = await userModel.findOne({
            email: req.body.studentEmail.trim(),
            role: "student"
        });
        if (!student) return res.status(404).send("Student account not found");

        await createReservation(student, {
            date: new Date().toISOString().split('T')[0],
            room: req.body.lab,
            seats: [req.body.seat],
            timeSlots: ['walk-in'],
            isAnonymous: false
        }, req.session.user.id);
        res.redirect("/techView");
    } catch (err) {
        respondWithReservationError(res, err, "Error creating walk-in");
    }
});

/**
 *  Delete Account
 */

router.delete("/users/:userId", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Not logged in" });
    }
    if (!isValidObjectId(req.params.userId)) {
        return res.status(404).json({ success: false, message: "User not found" });
    }
    if (req.session.user.id !== req.params.userId) {
        return res.status(403).json({ success: false, message: "Not authorized" });
    }

    try {
        const user = await userModel.findById(req.params.userId);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        await reservationModel.deleteMany({
            userId: user._id,
            status: { $in: ["active", "no-show"] }
        });
        await userInfoModel.deleteOne({ userId: user._id });
        await userModel.deleteOne({ _id: user._id });

        req.session.destroy(err => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: "Failed to end session" });
            }
            res.json({ success: true });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to delete account' });
    }
});

module.exports = router;