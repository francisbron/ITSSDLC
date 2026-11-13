// Get the authenticated user's immutable database identity from the session.
const user = { id: null, email: null };

fetch('/api/me')
    .then(res => {
        if (!res.ok) throw new Error('Unable to load account identity');
        return res.json();
    })
    .then(data => {
        user.id = data.id;
        user.email = data.email;
    })
    .catch(err => console.error(err));

// Profile Pic — main page
const profileImage = document.getElementById("profilepic");
const uploadInput = document.getElementById("uploadPic");

uploadInput.addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        profileImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

// Manage Account Modal — populate all tabs when opened
const manageModal = document.getElementById('manageAccountModal');

manageModal.addEventListener('shown.bs.modal', () => {
    // Edit Info tab — pre-fill with current displayed values
    document.getElementById('courseInput').value = document.getElementById('course').textContent.trim();
    document.getElementById('yearlevelInput').value = document.getElementById('yearlevel').textContent.trim();
    document.getElementById('bioInput').value = document.getElementById('bio').textContent.trim();

    // Profile pic tab — show current pic as preview
    document.getElementById('previewPic').src = profileImage.src;

    // Delete tab — reset
    document.getElementById('deleteConfirmInput').value = '';
    document.getElementById('confirmDeleteBtn').disabled = true;
    document.getElementById('deleteInputError').style.display = 'none';
});

// Save profile fields through the server-side owner-checked route.
document.getElementById('savechanges').addEventListener('click', async () => {
    if (!user.id) {
        alert('Could not verify your account. Please reload and try again.');
        return;
    }

    const profile = {
        course: document.getElementById('courseInput').value,
        yearLevel: document.getElementById('yearlevelInput').value,
        bio: document.getElementById('bioInput').value
    };

    try {
        const res = await fetch(`/users/${encodeURIComponent(user.id)}/profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Failed to save profile');
        }

        document.getElementById('course').textContent = profile.course;
        document.getElementById('yearlevel').textContent = profile.yearLevel;
        document.getElementById('bio').textContent = profile.bio;
        bootstrap.Modal.getInstance(manageModal).hide();
    } catch (err) {
        console.error(err);
        alert(err.message || 'Failed to save profile. Please try again.');
    }
});

// Profile Pic Modal — preview before saving
const uploadPicModal = document.getElementById('uploadPicModal');
const previewPic = document.getElementById('previewPic');
let selectedPicFile = null;

uploadPicModal.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) return;
    selectedPicFile = file;
    const reader = new FileReader();
    reader.onload = function (e) {
        previewPic.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

// Save Picture — applies preview to main profile image
document.getElementById('savePic').addEventListener('click', () => {
    if (selectedPicFile) {
        profileImage.src = previewPic.src;
        selectedPicFile = null;
    }
    const instance = bootstrap.Modal.getInstance(manageModal);
    instance.hide();
});

// Delete — enable button only when DELETE is typed exactly
document.getElementById('deleteConfirmInput').addEventListener('input', function () {
    document.getElementById('confirmDeleteBtn').disabled = this.value.trim() !== 'DELETE';
    document.getElementById('deleteInputError').style.display = 'none';
});

// Delete — confirm and call API
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    const val = document.getElementById('deleteConfirmInput').value.trim();
    if (val !== 'DELETE') {
        document.getElementById('deleteInputError').style.display = 'block';
        return;
    }

    try {
        if (!user.id) throw new Error('Could not verify your account. Please reload and try again.');
        const res = await fetch('/users/' + encodeURIComponent(user.id), { method: 'DELETE' });

        if (res.status === 401) {
            window.location.href = '/';
            return;
        }

        const data = await res.json();

        if (data.success) {
            window.location.href = '/';
        } else {
            alert(data.message || 'Failed to delete account. Please try again.');
        }
    } catch (err) {
        console.error(err);
        alert('Something went wrong. Please try again.');
    }
});
