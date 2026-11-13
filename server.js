"use strict";
require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const exphbs = require("express-handlebars");
const routes = require("./routes");
const migrateOwnership = require("./model/migrateOwnership");

const app = express();
const isProd = process.env.NODE_ENV === "production";
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 30 * 60 * 1000; // MCO2 C-05: absolute 30-minute expiry
const CSRF_BYTES = 32;

app.disable("x-powered-by");
// Trust only a proxy that is actually controlled by your hosting provider.
if (isProd && process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(helmet({
  // Existing Handlebars pages contain inline JavaScript; strict CSP is a separate hardening task.
  contentSecurityPolicy: false,
  strictTransportSecurity: isProd ? undefined : false
}));
app.use(express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 100 }));
app.use(express.json({ limit: "16kb" }));

// Reject database operators and prototype-pollution keys, including nested JSON payloads.
function unsafeInput(value, depth = 0) {
  if (depth > 12) return true;
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(v => unsafeInput(v, depth + 1));
  return Object.keys(value).some(key =>
    key.startsWith("$") || key.includes(".") ||
    ["__proto__", "prototype", "constructor"].includes(key) ||
    unsafeInput(value[key], depth + 1)
  );
}
app.use((req, res, next) => {
  if (unsafeInput(req.body) || unsafeInput(req.query)) {
    console.warn("Rejected unsafe request input", { path: req.path, ip: req.ip });
    return res.status(400).send("Invalid request parameters");
  }
  next();
});

if (isProd) {
  app.use((req, res, next) => {
    if (!req.secure) return res.status(403).send("HTTPS required");
    next();
  });
}

const hbs = exphbs.create({
  extname: "hbs",
  defaultLayout: "main",
  layoutsDir: path.join(__dirname, "views", "layouts"),
  partialsDir: path.join(__dirname, "views", "partials"),
  helpers: {
    includes(array, value) { return Array.isArray(array) && array.includes(value); },
    join(array, separator) {
      return Array.isArray(array) ? array.join(typeof separator === "string" ? separator : ", ") : "";
    }
  }
});
app.engine("hbs", hbs.engine);
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));

// Serve ONLY frontend assets, never routes.js, server.js, model files, .env, etc.
app.use(express.static(path.join(__dirname, "public"), { index: false, dotfiles: "deny" }));

async function startServer() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/mydatabase?replicaSet=rs0";
  const secret = process.env.SESSION_SECRET || (!isProd ? crypto.randomBytes(32).toString("hex") : null);
  if (!secret || secret.length < 32 || secret.startsWith("PASTE_")) {
    throw new Error("Set SESSION_SECRET to a cryptographically random value (not the example placeholder)");
  }

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    waitQueueTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000
  });
  console.log("MongoDB connected");
  await migrateOwnership();

  app.use(session({
    name: "lab.sid",
    secret,
    store: MongoStore.create({
      client: mongoose.connection.getClient(),
      dbName: mongoose.connection.name,
      collectionName: "sessions",
      ttl: Math.ceil(SESSION_IDLE_MS / 1000)
    }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: SESSION_IDLE_MS
    }
  }));

  app.use((req, res, next) => {
    const now = Date.now();
    if (req.session.user) {
      const lastAction = req.session.lastUserActionAt || req.session.loggedInAt || now;
      const firstLogin = req.session.loggedInAt || now;
      if (now - lastAction >= SESSION_IDLE_MS || now - firstLogin >= SESSION_ABSOLUTE_MS) {
        console.warn("Session expired for inactivity or absolute lifetime", { path: req.path });
        return req.session.destroy(err => {
          if (err) return next(err);
          res.clearCookie("lab.sid", { path: "/" });
          return req.path.startsWith("/api/")
            ? res.status(401).json({ success: false, message: "Session expired" })
            : res.redirect("/");
        });
      }
      // A background availability poll is NOT treated as user activity.
      if (req.method !== "GET" || (!req.path.startsWith("/api/") && req.accepts("html"))) {
        req.session.lastUserActionAt = now;
      }
    }
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(CSRF_BYTES).toString("hex");
    res.locals.csrfToken = req.session.csrfToken;
    res.locals.sessionExpiresAt = req.session.user ? (req.session.loggedInAt + SESSION_ABSOLUTE_MS) : "";
    next();
  });

  // Same-site cookie alone is not complete CSRF protection.
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const submitted = req.get("X-CSRF-Token") || (req.body && req.body._csrf);
    const expected = req.session.csrfToken;
    if (typeof submitted !== "string" || typeof expected !== "string") {
      return res.status(403).send("Invalid CSRF token");
    }
    const a = Buffer.from(submitted, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).send("Invalid CSRF token");
    }
    next();
  });

  // Limits untrusted traffic globally; booking endpoints also have a user-scoped limiter.
  app.use(rateLimit({
    windowMs: 60_000,
    // The dashboard polls every 5s; 100 users may share a single campus NAT IP.
    limit: 3000,
    standardHeaders: "draft-7",
    legacyHeaders: false
  }));
  app.use(routes);

  app.use((err, req, res, next) => {
    console.error("Unhandled server error", err);
    if (res.headersSent) return next(err);
    return res.status(500).send("Internal server error");
  });

  app.listen(Number(process.env.PORT || 3000), () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
  });
}
startServer().catch(err => { console.error("Server startup failed:", err); process.exit(1); });
