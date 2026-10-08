// Get logged-in user email from session
const user = { email: null };

fetch('/api/me')
    .then(res => res.json())
    .then(data => { user.email = data.email; });

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

// Save Info Changes — updates displayed values on page
document.getElementById('savechanges').addEventListener('click', () => {
    document.getElementById('course').textContent = document.getElementById('courseInput').value;
    document.getElementById('yearlevel').textContent = document.getElementById('yearlevelInput').value;
    document.getElementById('bio').textContent = document.getElementById('bioInput').value;

    const instance = bootstrap.Modal.getInstance(manageModal);
    instance.hide();
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
        const res = await fetch('/users/' + user.email, { method: 'DELETE' });

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
