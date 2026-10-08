// Generates time slots for a given date. (CHECK WHAT OUR LAB HOURS SHOULD BE, CURRENTLY SET TO 8AM-8PM)
function generateTimeSlots(date, startHour = 8, endHour = 20) {
    const slots = [];
    
    for (let hour = startHour; hour < endHour; hour++) {
        let hourStr = hour;
        if (hour < 10) hourStr = '0'+hour;
        
        slots.push({
            datetime: date + 'T' + hourStr + ':00:00',
            display: formatTime(hour, 0)
        });
        
        slots.push({
            datetime: date +'T' + hourStr +':30:00',
            display: formatTime(hour, 30)
        });
    }

    return slots;
}


// Helper function for formatting time in 12-hour format with complete AM/PM.
function formatTime(hour, minute) {
    let period ='AM';
    let displayHour = hour;
    
    if (hour >= 12) {
        period ='PM';
    }
    
    if (hour > 12) {
        displayHour = hour - 12;

    } else if (hour === 0) {
        displayHour = 12;
    }
    
    let minuteStr = minute;
    if (minute < 10) minuteStr ='0'+minute;

    return displayHour +':'+ minuteStr +' '+ period;
}


// Gets the next 7 days in YYYY-MM-DD format for reservation date selection.
function getNext7Days() {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(today.getDate() + i);
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        dates.push({
            dateString: year + '-' + month + '-' + day,
            display: month + '/' + day + '/' + year
        });
    }
    
    return dates;
}


// Checks if slot available for reservation. Returns true if available, false if already reserved.
function isSlotAvailable(labId, seatNumber, datetime, existingReservations) {

    for (let i = 0; i < existingReservations.length; i++) {

        if (existingReservations[i].labId === labId &&
            existingReservations[i].seats.includes(seatNumber) &&
            existingReservations[i].slots.includes(datetime) &&
            existingReservations[i].status === "active") {
            return false;
        }
    }

    return true;
}


// check multiple slots for a reservation. Returns an object with availability status and any conflicts.
function checkMultipleSlots(labId, seatNumbers, datetimes, existingReservations) {
    const conflicts = [];
    
    for (let seat of seatNumbers) {
        for (let datetime of datetimes) {
            if (!isSlotAvailable(labId, seat, datetime, existingReservations)) {
                conflicts.push({ seat, datetime });
            }
        }
    }
    
    return {
        available: conflicts.length === 0,
        conflicts: conflicts
    };
}


// Gets reservation detail for a specific lab slot. Returns user info if reserved, otherwise null.
function getSlotReservation(labId, seatNumber, datetime, existingReservations) {

    for (let i = 0; i < existingReservations.length; i++) {

        const res = existingReservations[i];

        if (res.labId === labId &&
            res.seats.includes(seatNumber) &&
            res.slots.includes(datetime) &&
            res.status === "active") {
            
            if (res.isAnonymous) {
                return { userName: "Anonymous", isAnonymous: true};
            }

            return {userName: res.userName, userId: res.userId, isAnonymous: false};
        }
    }

    return null;
}

// Creates new reservation with the given data and checks for slot availability before saving.
function createReservation(reservationData) {
    const { userId, userName, labId, labName, seats, slots, isAnonymous } = reservationData;
    
    const existingReservations = JSON.parse(localStorage.getItem("reservations")) || [];
    
    const availability = checkMultipleSlots(labId, seats, slots, existingReservations);
    
    if (!availability.available) {
        return {success: false, error: "Some slots are already reserved"};
    }
    
    let resNumber = existingReservations.length + 1;
    let resNumberStr = resNumber.toString();
    

    if (resNumber < 10) {
        resNumberStr = '00' + resNumberStr;
    } else if (resNumber < 100) {
        resNumberStr = '0' + resNumberStr;
    }
    
    const reservationId = "RES" + resNumberStr;
    
    const newReservation = {
        id: reservationId,
        userId: userId,
        userName: userName,
        labId: labId,
        labName: labName,
        seats: seats,
        slots: slots,
        isAnonymous: isAnonymous,
        createdAt: new Date().toISOString(),
        status: "active"
    };
    
    existingReservations.push(newReservation);
    localStorage.setItem("reservations", JSON.stringify(existingReservations));
    
    return {success: true, reservation: newReservation};
}

// Lets a user edit out their reservation details(seats, slots, anonymity) but not the lab or user info.
function editReservation(reservationId, updates, currentUserId, isTechnician = false) {
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    
    let resIndex = -1;

    for (let i = 0; i < reservations.length; i++) {
        if (reservations[i].id === reservationId) {
            resIndex = i;
            break;
        }
    }
    
    if (resIndex === -1) {
        return {success: false, error: "Reservation not found"};
    }
    
    const reservation = reservations[resIndex];
    
    if (reservation.userId !== currentUserId && !isTechnician) {
        return {success: false, error: "You don't have permission to edit this reservation"};
    }
    
    if (updates.seats || updates.slots) {
        const seatsToCheck = updates.seats || reservation.seats;
        const slotsToCheck = updates.slots || reservation.slots;
        
        const otherReservations = [];
        for (let i = 0; i < reservations.length; i++) {
            if (reservations[i].id !== reservationId) {
                otherReservations.push(reservations[i]);
            }
        }
        
        const availability = checkMultipleSlots(reservation.labId, seatsToCheck, slotsToCheck, otherReservations);
        
        if (!availability.available) {
            return {success: false, error: "Updated slots are not available"};
        }
    }
    
    
    if (updates.seats) reservations[resIndex].seats = updates.seats;
    if (updates.slots) reservations[resIndex].slots = updates.slots;
    if (updates.isAnonymous !== undefined) reservations[resIndex].isAnonymous = updates.isAnonymous;
    
    localStorage.setItem("reservations", JSON.stringify(reservations));
    
    return {success: true, reservation: reservations[resIndex]};
}

// Cancels a reservation made by a user not a technician.
function cancelReservation(reservationId, currentUserId, isTechnician = false) {
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    
    let resIndex = -1;
    for (let i = 0; i < reservations.length; i++) {
        if (reservations[i].id === reservationId) {
            resIndex = i;
            break;
        }
    }
    
    if (resIndex === -1) {
        return {success: false, error: "Reservation not found"};
    }
    
    const reservation = reservations[resIndex];
    
    if (reservation.userId !== currentUserId && !isTechnician) {
        return {success: false, error: "You don't have permission to cancel this reservation"};
    }
    
    reservations[resIndex].status = "cancelled";
    localStorage.setItem("reservations", JSON.stringify(reservations));
    
    return {success: true, message: "Reservation cancelled successfully"};
}


// Checks if a technician can remove a reservation due to a no show by the reservee.
function canTechnicianRemove(reservationId) {
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    
    let reservation = null;
    for (let i = 0; i < reservations.length; i++) {
        if (reservations[i].id === reservationId) {
            reservation = reservations[i];
            break;
        }
    }
    
    if (!reservation) {
        return {canRemove: false, reason: "Reservation not found"};
    }
    
    if (reservation.status !== "active") {
        return {canRemove: false, reason: "Reservation is not active"};
    }
    
    const firstSlotTime = new Date(reservation.slots[0]);
    const currentTime = new Date();
    

    const timeDiff = currentTime.getTime() - firstSlotTime.getTime();
    const minutesPassed = timeDiff / 1000 / 60;
    
    if (minutesPassed >= 10) {
        return {canRemove: true, minutesPassed: minutesPassed};
    }
    
    const minutesLeft = 10 - minutesPassed;
    return {canRemove: false, minutesPassed: minutesPassed, reason: "Must wait " + minutesLeft + " more minute(s)"};
}


// Removes a reservation if a user is a no show, which then the technician can cancel the reservation.
function removeNoShowReservation(reservationId, technicianId) {
    const canRemove = canTechnicianRemove(reservationId);
    
    if (!canRemove.canRemove) {
        return {success: false, error: canRemove.reason};
    }
    
    const result = cancelReservation(reservationId, technicianId, true);
    
    if (result.success) {
        return {success: true, message: "Reservation removed due to no-show"};
    }
    
    return result;
}


// Gets a user's active reservations. Returns an array of reservation objects for the specified user ID.
function getUserReservations(userId) {
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    const userRes = [];
    for (let i = 0; i < reservations.length; i++) {
        if (reservations[i].userId === userId && reservations[i].status === "active") {
            userRes.push(reservations[i]);
        }
    }
    return userRes;
}


// Gets all active reservations for a specifc lab and date.
function getLabReservations(labId, date) {
    const reservations = JSON.parse(localStorage.getItem("reservations")) || [];
    const labRes = [];
    for (let i = 0; i < reservations.length; i++) {
        if (reservations[i].labId === labId && reservations[i].status === "active") {
            for (let j = 0; j < reservations[i].slots.length; j++) {
                if (reservations[i].slots[j].startsWith(date)) {
                    labRes.push(reservations[i]);
                    break;
                }
            }
        }
    }
    return labRes;
}

