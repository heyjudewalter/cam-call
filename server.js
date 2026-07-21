const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
    if (i === 2) id += "-";
  }
  return id;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-room", (callback) => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms.has(roomId));

    rooms.set(roomId, new Set());
    callback({ roomId });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on("join-room", (roomId, callback) => {
    roomId = roomId.toUpperCase();
    const room = rooms.get(roomId);

    if (!room) {
      callback({ error: "Room not found" });
      return;
    }

    if (room.size >= 4) {
      callback({ error: "Room is full (max 4 participants)" });
      return;
    }

    const existingUsers = [...room];
    room.add(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;

    callback({ roomId, users: existingUsers });
    socket.to(roomId).emit("user-connected", socket.id);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on("signal", ({ target, signal }) => {
    io.to(target).emit("signal", { from: socket.id, signal });
  });

  socket.on("chat-message", ({ roomId, message }) => {
    socket.to(roomId).emit("chat-message", {
      from: socket.id,
      message,
      timestamp: Date.now(),
    });
  });

  socket.on("leave-room", () => {
    handleLeave(socket);
  });

  socket.on("disconnecting", () => {
    handleLeave(socket);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });

  function handleLeave(sock) {
    const roomId = sock.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      room.delete(sock.id);
      sock.to(roomId).emit("user-disconnected", sock.id);

      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} destroyed (empty)`);
      }
    }

    sock.leave(roomId);
    sock.data.roomId = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CamCall server running on http://localhost:${PORT}`);
});
