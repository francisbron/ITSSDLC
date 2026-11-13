"use strict";
// UI-only reminder: the server enforces expiration independently.
const expiresAt = Number(document.querySelector('meta[name="session-expires-at"]')?.content);
if (Number.isFinite(expiresAt) && expiresAt > 0) {
  const check = () => { if (Date.now() >= expiresAt) window.location.replace("/"); };
  setInterval(check, 10_000);
  check();
}
