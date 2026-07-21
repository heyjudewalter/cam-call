const socket = io();

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");
const passwordToggle = document.getElementById("passwordToggle");
const passwordField = document.getElementById("passwordField");
const createPassword = document.getElementById("createPassword");
const joinPasswordField = document.getElementById("joinPasswordField");
const joinPassword = document.getElementById("joinPassword");

passwordToggle.addEventListener("change", () => {
  passwordField.classList.toggle("hidden", !passwordToggle.checked);
});

createBtn.addEventListener("click", () => {
  createBtn.disabled = true;
  createBtn.textContent = "Creating...";

  const password = passwordToggle.checked ? createPassword.value.trim() : null;

  socket.emit("create-room", { password }, (response) => {
    if (response.roomId) {
      window.location.href = `/room.html?room=${response.roomId}`;
    }
  });
});

joinBtn.addEventListener("click", joinRoom);
roomInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinRoom();
});

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase();
  joinPasswordField.classList.toggle("hidden", roomInput.value.trim().length < 6);
});

function joinRoom() {
  const roomId = roomInput.value.trim().toUpperCase();
  if (roomId.length < 6) return;

  const password = joinPassword.value.trim() || undefined;

  joinBtn.disabled = true;
  joinBtn.textContent = "Joining...";

  socket.emit("join-room", { roomId, password }, (response) => {
    if (response.error) {
      alert(response.error);
      joinBtn.disabled = false;
      joinBtn.textContent = "Join";
      return;
    }
    window.location.href = `/room.html?room=${response.roomId}`;
  });
}
