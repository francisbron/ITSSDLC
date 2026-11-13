"use strict";
const labsConfig = [
  { id: "LAB1", name: "Gokongwei G301", totalSeats: 40 },
  { id: "LAB2", name: "Gokongwei G302", totalSeats: 35 },
  { id: "LAB3", name: "Velasco V201", totalSeats: 30 }
];
let refreshing = false;
function getLocalDateString() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-");
}
function populateTimeDropdown() {
  const timeSelect = document.getElementById("search-time");
  timeSelect.replaceChildren();
  for (let h = 8; h < 20; h++) {
    for (const m of [0, 30]) {
      const opt = document.createElement("option");
      opt.value = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      opt.textContent = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
      timeSelect.append(opt);
    }
  }
  const now = new Date();
  const rounded = `${String(now.getHours()).padStart(2,"0")}:${now.getMinutes()<30?"00":"30"}`;
  if ([...timeSelect.options].some(o => o.value === rounded)) timeSelect.value = rounded;
}
async function updateGrid() {
  if (refreshing) return;
  refreshing = true;
  const lab = document.getElementById("search-lab").value;
  const date = document.getElementById("search-date").value;
  const time = document.getElementById("search-time").value;
  const grid = document.getElementById("availability-grid");
  try {
    const query = new URLSearchParams({lab,date,time});
    const response = await fetch(`/api/availability?${query}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/"); return; }
    if (!response.ok) throw new Error("Could not fetch availability");
    const { reservedSeats, totalSeats } = await response.json();
    const reserved = new Set(reservedSeats);
    const cards = document.createDocumentFragment();
    for (let i = 0; i < totalSeats; i++) {
      const seatId = `${"ABCDE"[Math.floor(i / 8)]}${(i % 8) + 1}`;
      const card = document.createElement("div");
      const taken = reserved.has(seatId);
      card.className = `seat-card ${taken ? "reserved" : "available"}`;
      const label = document.createElement("span");
      label.className = "seat-number";
      label.textContent = `Seat ${seatId}`;
      const state = document.createElement("span");
      state.className = "reserver-name";
      state.textContent = taken ? "Reserved" : "Open";
      card.append(label, state);
      cards.append(card);
    }
    grid.replaceChildren(cards);
    document.getElementById("last-updated").textContent = new Date().toLocaleTimeString();
  } catch (err) {
    grid.textContent = "Unable to load availability. Please try again.";
  } finally { refreshing = false; }
}
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("search-date").value = getLocalDateString();
  populateTimeDropdown();
  document.getElementById("btn-search").addEventListener("click", updateGrid);
  document.getElementById("search-date").addEventListener("change", updateGrid);
  document.getElementById("search-lab").addEventListener("change", updateGrid);
  document.getElementById("search-time").addEventListener("change", updateGrid);
  updateGrid();
  setInterval(() => { if (!document.hidden) updateGrid(); }, 5000);
});
