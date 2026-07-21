const socket = io();

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");

createBtn.addEventListener("click", () => {
  createBtn.disabled = true;
  createBtn.textContent = "Creating...";

  socket.emit("create-room", (response) => {
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
});

function joinRoom() {
  const roomId = roomInput.value.trim().replace("-", "");
  if (roomId.length < 6) return;

  joinBtn.disabled = true;
  joinBtn.textContent = "Joining...";

  socket.emit("join-room", roomId, (response) => {
    if (response.error) {
      alert(response.error);
      joinBtn.disabled = false;
      joinBtn.textContent = "Join";
      return;
    }
    window.location.href = `/room.html?room=${response.roomId}`;
  });
}
