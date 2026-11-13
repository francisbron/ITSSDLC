const express = require('express');     // Express Server
const path = require("path");           
const mongoose = require("mongoose");   // mongoose to interact with MongoDB
const routes = require("./routes");
const session = require("express-session"); // to save session of logged in user
const exphbs = require("express-handlebars"); // Express Handlebars
const Handlebars = require("handlebars"); // Handlebars
const { allowInsecurePrototypeAccess } = require("@handlebars/allow-prototype-access");
const migrateOwnership = require("./model/migrateOwnership");


const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json())
app.use((req, res, next) => {
    if (!req.body) req.body = {};
    next();
});

app.use(session({
    secret: 'no-clue',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname, { index: false }));

app.engine("hbs", exphbs.engine({
    extname: "hbs",
    handlebars: allowInsecurePrototypeAccess(Handlebars),
    defaultLayout: "main",
    layoutsDir: path.join(__dirname, "views/layouts"),
    partialsDir: path.join(__dirname, "views/partials"),
    helpers: {
        includes: function(array, value) {
            if (!array) return false;
            return array.includes(value);
        },
        join: function(array, separator) {
            if (!array) return '';
            return array.join(typeof separator === 'string' ? separator : ', ');
        }
    }
}));

app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));

async function startServer() {
    try {
        await mongoose.connect(
            process.env.MONGODB_URI || "mongodb://localhost:27017/mydatabase?replicaSet=rs0",
            {
                maxPoolSize: 10,
                minPoolSize: 1,
                waitQueueTimeoutMS: 10000
            }
        );
        console.log("MongoDB Connected");
        await migrateOwnership();

        app.use(routes);
        app.listen(process.env.PORT || 3000, () => {
            console.log("Server Listening...");
        });
    } catch (err) {
        console.error("Server startup failed:", err);
        process.exit(1);
    }
}

startServer();
