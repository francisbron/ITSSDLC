# CCAPDEV-MCO-Database

=========================================

Project Description

Lab Reservation System for students to reserve lab seats to access computers
includes details regarding the reservation,
student profile page to edit their own information

=========================================

package.json
Dependencies
- Express
- Mongoose
- Session
- Handlebars
- bcrypt

To Run
- Run `npm install`.
- Configure MongoDB as a replica set (the booking limit and its audit event use transactions). For a local development instance, start MongoDB with replica-set support and run `rs.initiate()` once in `mongosh`.
- Set `MONGODB_URI` to the replica-set connection string, for example:

  ```text
  mongodb://localhost:27017/mydatabase?replicaSet=rs0
  ```

- Run `npm start` and open `http://localhost:3000`.

The server uses a connection pool capped at 10 connections and performs a non-destructive ownership/counter migration at startup. It does not seed or clear the database automatically. Existing reservations and profiles are linked to user IDs using their existing email address; startup fails if an active reservation cannot be linked.

New self-registrations always receive the `student` role. The server enforces a maximum of two reservations with status `active` per student, including technician-created walk-ins. Cancelling a reservation or marking it no-show decrements the active count.

Reservation audit events are written in the same transaction as the corresponding reservation change. Mongoose marks audit fields immutable, but production immutability also depends on MongoDB permissions. Use a dedicated application database role that can `find` and `insert` in `reservation_audits` but cannot `update` or `remove` there; do not grant the application a broader role that overrides this restriction. Keep audit records when deleting user accounts.

For example, provision the application role through an administrator account with collection-scoped privileges. Grant the application the CRUD actions it needs on `users`, `reservations`, and `userinfos`, but only `find` and `insert` on `reservation_audits`. Add `createIndex`/`createCollection` only if your deployment needs Mongoose to create those collections or indexes. Do not assign the built-in `readWrite` role on the whole database because it would also allow audit updates and deletion.
