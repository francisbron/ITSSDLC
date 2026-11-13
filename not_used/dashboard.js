// dashboard.js

const labsConfig = [
    { id: "LAB1", name: "Gokongwei G301", totalSeats: 40 },
    { id: "LAB2", name: "Gokongwei G302", totalSeats: 35 },
    { id: "LAB3", name: "Velasco V201", totalSeats: 30 }
];

document.addEventListener('DOMContentLoaded', function() {
    // 1. Initialize Date Input to Today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('search-date').value = today;

    // 2. Populate Time Dropdown (using your generateTimeSlots helper)
    populateTimeDropdown(today);

    // 3. Event Listeners
    document.getElementById('btn-search').addEventListener('click', updateGrid);
    
    // Update time dropdown if date changes
    document.getElementById('search-date').addEventListener('change', function() {
        populateTimeDropdown(this.value);
    });

    // 4. Initial Load
    updateGrid();

    // 5. AUTO REFRESH (Auto refresh using setInterval())
    setInterval(() => {
        updateGrid(false); // false = don't show "Loading..." text, just silent update
    }, 5000); 
});

function populateTimeDropdown(date) {
    const timeSelect = document.getElementById('search-time');
    // Using your existing helper from reservations.js
    const slots = generateTimeSlots(date, 8, 20); 
    
    // Save current selection if exists
    const currentVal = timeSelect.value;
    
    timeSelect.innerHTML = '';
    slots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot.datetime; 
        option.textContent = slot.display;
        timeSelect.appendChild(option);
    });

    // Restore selection or default to first
    if(currentVal) timeSelect.value = currentVal;
}

function updateGrid(showLoading = true) {
    const labId = document.getElementById('search-lab').value;
    const datetime = document.getElementById('search-time').value;
    const grid = document.getElementById('availability-grid');

    if (!datetime) return; // Wait for slots to generate

    // Find config for selected lab to know total seats
    const currentLab = labsConfig.find(l => l.id === labId);
    
    if(showLoading) {
        // Optional: Visual cue that we are searching
        // grid.innerHTML = '<p>Checking availability...</p>'; 
    }

    // Get ALL reservations from storage (using your localStorage key)
    const allReservations = JSON.parse(localStorage.getItem("reservations")) || [];
    
    // Clear grid for rebuild
    grid.innerHTML = '';

    // Loop through every seat in the lab
    for (let i = 1; i <= currentLab.totalSeats; i++) {
        const seatNum = i;
        
        // Use your helper function: getSlotReservation
        // (This function checks if a specific seat at a specific time is taken)
        const reservationInfo = getSlotReservation(labId, seatNum, datetime, allReservations);

        const card = document.createElement('div');
        const seatLabel = document.createElement('span');
        seatLabel.className = 'seat-number';
        seatLabel.textContent = `Seat ${seatNum}`;
        
        const statusLabel = document.createElement('span');
        statusLabel.className = 'reserver-name';

        if (reservationInfo) {
            // --- RESERVED LOGIC ---
            card.className = 'seat-card reserved';
            
            // --- ANONYMOUS LOGIC (Req: "Anonymous display logic") ---
            if (reservationInfo.isAnonymous) {
                statusLabel.innerHTML = `<em>Reserved</em><br><small>(Anonymous)</small>`;
            } else {
                // Link to profile if public
                // Assuming you have a profile viewer page, e.g., profile.hbs?user=email
                // For now, linking to generic profile or just showing text
                statusLabel.innerHTML = `<a href="profile.hbs?user=${reservationInfo.userId}">${reservationInfo.userName}</a>`;
            }
        } else {
            // --- AVAILABLE LOGIC ---
            card.className = 'seat-card available';
            statusLabel.textContent = "Open";
        }

        card.appendChild(seatLabel);
        card.appendChild(statusLabel);
        grid.appendChild(card);
    }

    // Update timestamp
    const now = new Date();
    document.getElementById('last-updated').textContent = now.toLocaleTimeString();
}