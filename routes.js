const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");

const userModel = require("./model/userModel");
const reservationModel = require("./model/reservationModel");
const userInfoModel = require("./model/userInfoModel");

// File reader
function readJSON(filePath) {
    const data = fs.readFileSync(path.join(__dirname, filePath), "utf-8");
    return JSON.parse(data);
}

// To seed 5 sample data deletes existing, creates 5 new, remove delete if db has exisiting data
async function seedDB() {
    try {
        await userModel.deleteMany({});
        await reservationModel.deleteMany({});
        await userInfoModel.deleteMany({});

        const users = readJSON("model/sampleData/sampleUser.json");
        const reservations = readJSON("model/sampleData/sampleReservation.json");
        const userInfo = readJSON("model/sampleData/sampleUserInfo.json");

        const hashedUsers = await Promise.all(
            users.map(async (user) => ({
                ...user,
                password: await bcrypt.hash(user.password, 10)
            }))
        );

        await userModel.insertMany(hashedUsers);
        await reservationModel.insertMany(reservations);
        await userInfoModel.insertMany(userInfo);

        console.log("Sample data inserted");
    } catch (err){
        console.error(err);
    }
}

seedDB();

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
        const email = req.session.user.email;
        const userInfo = await userInfoModel.findOne({ email: email }).lean();
        const reservations = await reservationModel.find({ email: email, status: 'active' }).lean();

        res.render("profile", {
            title: "Profile",
            user: req.session.user,
            isTechnician: req.session.user.role === 'technician' || req.session.user.role === 'admin',
            profileActive: true, 
            userInfo,
            reservations
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading profile");
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
    const { email, password, role } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new userModel({ 
        email, 
        password: hashedPassword,
        role 
    });
    await newUser.save();

    res.send("User registered");
});

router.get("/api/me", requireLogin, (req, res) => {
    res.json({ email: req.session.user.email });
});

// LOGIN - /index
router.post("/login", async(req, res) => {
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.send("Invalid email or password");
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.send("Invalid email or password");
        }

        req.session.user = {
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
    if (!req.session.user) {
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
    try {
        let timeSlots = req.body['timeSlots[]'] || req.body['timeSlots'];
        let seats = req.body['seats[]'] || req.body['seats'];

        if (!timeSlots) timeSlots = [];
        else if (!Array.isArray(timeSlots)) timeSlots = [timeSlots];

        if (!seats) seats = [];
        else if (!Array.isArray(seats)) seats = [seats];

        if (timeSlots.length === 0) return res.status(400).send("Please select at least one time slot");
        if (seats.length === 0) return res.status(400).send("Please select at least one seat");

        const newReservation = new reservationModel({
            email: req.session.user.email,
            date: req.body.date,
            room: req.body.lab,
            timeSlots: timeSlots,
            seats: seats,
            isAnonymous: req.body.isAnonymous === 'true',
            status: 'active'
        });

        await newReservation.save();
        res.redirect("/userReservations");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating reservation: " + err.message);
    }
});

/**
 *  User Reservations
 */

router.get("/userReservations", requireLogin, async (req, res) => {
    try {
        const reservations = await reservationModel.find({
            email: req.session.user.email,
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
        const reservation = await reservationModel.findById(req.params.id);

        if (!reservation) return res.status(404).send("Reservation not found");
        if (reservation.email !== req.session.user.email && req.session.user.role !== 'technician' && 
        req.session.user.role !== 'admin') {
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
    try {
        const reservation = await reservationModel.findById(req.params.id);

        if (!reservation) return res.status(404).send("Reservation not found");
        if (reservation.email !== req.session.user.email) return res.status(403).send("Not authorized");

        let timeSlots = req.body['timeSlots[]'] || req.body['timeSlots'];
        if (!timeSlots) timeSlots = [];
        else if (!Array.isArray(timeSlots)) timeSlots = [timeSlots];

        let seats = req.body['seat'];
        if (!seats) seats = reservation.seats;
        else if (!Array.isArray(seats)) seats = [seats];

        await reservationModel.findByIdAndUpdate(req.params.id, {
            date: req.body.date || reservation.date,
            timeSlots: timeSlots.length > 0 ? timeSlots : reservation.timeSlots,
            seats: seats,
            isAnonymous: req.body.isAnonymous === 'true'
        });

        console.log("UPDATE SUCCESS");
        res.redirect("/userReservations");
    } catch (err) {
        console.error("EDIT ERROR:", err.message);
        res.status(500).send("Error updating reservation: " + err.message);
    }
});

/**
 *  Cancel Reservation
 */

router.post("/cancelReservation/:id", requireLogin, async (req, res) => {
    try {
        const reservation = await reservationModel.findById(req.params.id);

        if (!reservation) return res.status(404).send("Reservation not found");
        if (reservation.email !== req.session.user.email) return res.status(403).send("Not authorized");

        await reservationModel.findByIdAndUpdate(req.params.id, { status: 'cancelled' });

        res.redirect("/userReservations");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error cancelling reservation");
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
        await reservationModel.findByIdAndUpdate(req.params.id, { status: 'no-show' });
        res.redirect("/techView");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error removing reservation");
    }
});

router.post("/walkIn", requireTechnician, async (req, res) => {
    try {
        const newReservation = new reservationModel({
            email: req.body.studentEmail,
            room: req.body.lab,
            date: new Date().toISOString().split('T')[0],
            seats: [req.body.seat],
            timeSlots: ['walk-in'],
            isAnonymous: false,
            status: 'active'
        });
        await newReservation.save();
        res.redirect("/techView");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating walk-in");
    }
});

/**
 *  Delete Account
 */

router.delete("/users/:email", async (req, res) => {
    console.log("DELETE route hit");
    console.log("Session:", req.session.user);
    console.log("Email param:", req.params.email);

    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Not logged in" });
    }

    try {
        const email = req.params.email;

        if (req.session.user.email !== email) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        const user = await userModel.findOne({ email: email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        await userModel.deleteOne({ email: email });
        await reservationModel.deleteMany({ email: email, status: { $in: ['active', 'no-show'] } });
        await userInfoModel.deleteOne({ email: email });

        req.session.destroy();
        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to delete account' });
    }
});

module.exports = router;