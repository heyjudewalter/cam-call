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

// Room structure:
// {
//   owner: socketId,
//   password: string | null,
//   users: Set<socketId>,
//   bans: Set<socketId>,       // kicked users can rejoin, banned cannot
//   ipBans: Set<string>,       // banned IPs
//   warnings: Map<socketId, [{message, timestamp}]>,
//   raisedHands: Set<socketId>,
//   maxParticipants: number,
// }

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
    if (i === 2) id += "-";
  }
  return id;
}

function getRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return {
    owner: room.owner,
    hasPassword: !!room.password,
    users: [...room.users],
    raisedHands: [...room.raisedHands],
  };
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  const ip =
    socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    socket.handshake.address;

  socket.on("create-room", ({ password } = {}, callback) => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms.has(roomId));

    rooms.set(roomId, {
      owner: socket.id,
      password: password || null,
      users: new Set([socket.id]),
      bans: new Set(),
      ipBans: new Set(),
      warnings: new Map(),
      raisedHands: new Set(),
      maxParticipants: 8,
    });

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.isOwner = true;
    callback({ roomId });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on("join-room", ({ roomId, password }, callback) => {
    if (typeof roomId === "function") {
      callback = roomId;
      roomId = undefined;
      password = undefined;
    }
    roomId = (roomId || "").toUpperCase();
    const room = rooms.get(roomId);

    if (!room) {
      callback({ error: "Room not found" });
      return;
    }

    if (room.bans.has(socket.id)) {
      callback({ error: "You have been kicked from this call." });
      return;
    }

    if (room.ipBans.has(ip)) {
      callback({ error: "You have been banned from this call." });
      return;
    }

    if (room.password && password !== room.password) {
      callback({ error: "Incorrect password" });
      return;
    }

    if (room.users.size >= room.maxParticipants) {
      callback({ error: "Room is full" });
      return;
    }

    const existingUsers = [...room.users];
    const existingWarnings = room.warnings.has(socket.id)
      ? room.warnings.get(socket.id)
      : [];
    room.users.add(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.isOwner = false;
    socket.data.ip = ip;

    callback({
      roomId,
      users: existingUsers,
      owner: room.owner,
      warnings: existingWarnings,
    });
    socket.to(roomId).emit("user-connected", socket.id);
    console.log(`User ${socket.id} joined room ${roomId} (IP: ${ip})`);
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

  // Raise hand
  socket.on("raise-hand", (raised) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (raised) {
      room.raisedHands.add(socket.id);
    } else {
      room.raisedHands.delete(socket.id);
    }
    io.to(roomId).emit("raise-hand", { userId: socket.id, raised });
  });

  // Owner actions
  socket.on("kick-user", (targetId) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.owner !== socket.id) return;

    if (room.users.has(targetId)) {
      room.bans.add(targetId);
      room.users.delete(targetId);
      io.to(targetId).emit("kicked", { type: "kick" });
      io.to(roomId).emit("user-disconnected", targetId);
      io.to(roomId).emit("moderation-event", {
        type: "kick",
        target: targetId,
        by: socket.id,
      });
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) {
        targetSocket.leave(roomId);
        targetSocket.data.roomId = null;
      }
      console.log(`User ${targetId} kicked from room ${roomId}`);
    }
  });

  socket.on("ban-user", (targetId) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.owner !== socket.id) return;

    if (room.users.has(targetId)) {
      room.bans.add(targetId);
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket && targetSocket.data.ip) {
        room.ipBans.add(targetSocket.data.ip);
      }
      room.users.delete(targetId);
      io.to(targetId).emit("kicked", { type: "ban" });
      io.to(roomId).emit("user-disconnected", targetId);
      io.to(roomId).emit("moderation-event", {
        type: "ban",
        target: targetId,
        by: socket.id,
      });
      if (targetSocket) {
        targetSocket.leave(roomId);
        targetSocket.data.roomId = null;
      }
      console.log(`User ${targetId} banned from room ${roomId}`);
    }
  });

  socket.on("warn-user", ({ targetId, message }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.owner !== socket.id) return;

    if (!room.warnings.has(targetId)) {
      room.warnings.set(targetId, []);
    }
    const warning = { message, timestamp: Date.now() };
    room.warnings.get(targetId).push(warning);

    io.to(targetId).emit("warning-received", warning);
    io.to(roomId).emit("moderation-event", {
      type: "warn",
      target: targetId,
      by: socket.id,
      message,
    });
    console.log(`User ${targetId} warned in room ${roomId}: ${message}`);
  });

  socket.on("ip-ban-user", (targetId) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.owner !== socket.id) return;

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket && targetSocket.data.ip) {
      room.ipBans.add(targetSocket.data.ip);
      if (room.users.has(targetId)) {
        room.users.delete(targetId);
        io.to(targetId).emit("kicked", { type: "ipban" });
        io.to(roomId).emit("user-disconnected", targetId);
        io.to(roomId).emit("moderation-event", {
          type: "ipban",
          target: targetId,
          by: socket.id,
        });
        targetSocket.leave(roomId);
        targetSocket.data.roomId = null;
      }
      console.log(`IP ${targetSocket.data.ip} banned in room ${roomId}`);
    }
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
      room.users.delete(sock.id);
      room.raisedHands.delete(sock.id);

      if (sock.data.isOwner || room.owner === sock.id) {
        // Transfer ownership to next user or destroy
        if (room.users.size > 0) {
          room.owner = [...room.users][0];
          io.to(room.owner).emit("ownership-transferred");
        }
      }

      sock.to(roomId).emit("user-disconnected", sock.id);

      if (room.users.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} destroyed (empty)`);
      }
    }

    sock.leave(roomId);
    sock.data.roomId = null;
    sock.data.isOwner = false;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`CamCall server running on http://0.0.0.0:${PORT}`);
});
