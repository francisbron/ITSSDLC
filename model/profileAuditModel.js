"use strict";
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  action: { type: String, enum: ["profile_updated"], required: true, immutable: true },
  changedFields: { type: [String], required: true, immutable: true },
  occurredAt: { type: Date, default: Date.now, immutable: true }
}, { strict: "throw", strictQuery: true, versionKey: false, collection: "profile_audits" });
schema.pre("save", function () { if (!this.isNew) throw new Error("Audit events cannot be modified"); });
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"]) {
  schema.pre(operation, function () { throw new Error("Audit events cannot be modified or deleted"); });
}
module.exports = mongoose.model("ProfileAudit", schema);
