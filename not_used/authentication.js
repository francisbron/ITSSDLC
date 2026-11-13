// Register new user
// Email- User email, must have DLSU email syntax at the end
// Password- User password, must have at least 1 of all the ff: Capital letter, number, and special char
// Role- Does account belong to student or admin
function register(email, password, role){
    let errors = []; // List of errors in password creation
    // Email checking syntax
    if (!email.endsWith("@dlsu.edu.ph")){
        errors.push("Kindly use your DLSU email.");
        return;
    }

    // Check if password satisfies all the requirements
    // At least 1 Capital Letter, Number, Special character, minimum length is 10
    // Let the password verification begin...

    if (!/[A-Z]/.test(password)){
        errors.push("Password must have at least one capital letter."); // Make this error message an element in the errors array
    }
    
    if (!/[0-9]/.test(password)){
        errors.push("Password must have at least one number.");
    }

    if (!/[!@#$%^&*]/.test(password)){
        errors.push("Password should have at least one special character.");
    }

    if (password.length < 10){
        errors.push("Password must be at least 10 characters long.");
    }

    // Check for dupes
    if (users.some(u => u.email === email)){
        errors.push("Email already registered.");
        return;
    }

    // Stop if errors exist
    if (errors.length > 0){
        return {
            success: false,
            message: errors.join("\n")
        };
    }

    let newUser = {
        email,
        password,
        role, // Student or Admin
        pfp: "",
        description: ""
    };

    users.push(newUser);
    saveUsers();

    return {
        success: true,
        message: "Registered successfully!"
    };
}

function login(email, password){
    const user = users.find(u => u.email === email);
    if (!user){
        return {
            success: false, message: "Specified email not registered."
        };
    }

    if (user.password !== password){
        return {
            success: false, message: "Incorrect password."
        };
    }

    return {
        success: true, message: "Login Successful!"
    };
}