// Load users if saved, start with empty array if none are loaded
let users = JSON.parse(localStorage.getItem("users")) || [];
let currentUser = JSON.parse(localStorage.getItem("currentUser")) || null;

// Permanently Save Users
function saveUsers(){
    localStorage.setItem("users", JSON.stringify(users));
}

function setCurrentUser(user){
    currentUser = user;
    localStorage.setItem("currentUser", JSON.stringify(user));
}

function logoutUser(){
    currentUser = null;
    localStorage.removeItem("currentUser");
}