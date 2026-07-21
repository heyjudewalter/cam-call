const socket = io();
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

if (!roomId) {
  window.location.href = "/";
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

let localStream = null;
let micEnabled = true;
let camEnabled = true;
let facingMode = "user";
let selectedCamera = null;
let selectedMic = null;
let isOwner = false;
let isScreenSharing = false;
let screenStream = null;
let contextTargetId = null;
let handRaised = false;
let roomOwner = null;
const raisedHands = new Set();
const peers = new Map();
const remoteUsers = new Map();

const localVideo = document.getElementById("localVideo");
const videoGrid = document.getElementById("videoGrid");
const roomIdDisplay = document.getElementById("roomIdDisplay");
const participantCount = document.getElementById("participantCount");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const copyToast = document.getElementById("copyToast");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const flipCamBtn = document.getElementById("flipCamBtn");
const screenShareBtn = document.getElementById("screenShareBtn");
const raiseHandBtn = document.getElementById("raiseHandBtn");
const settingsBtn = document.getElementById("settingsBtn");
const leaveBtn = document.getElementById("leaveBtn");
const waitingOverlay = document.getElementById("waitingOverlay");
const settingsPanel = document.getElementById("settingsPanel");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const cameraSelect = document.getElementById("cameraSelect");
const micSelect = document.getElementById("micSelect");
const resolutionSelect = document.getElementById("resolutionSelect");
const noiseSuppressionToggle = document.getElementById("noiseSuppressionToggle");
const echoCancellationToggle = document.getElementById("echoCancellationToggle");
const autoGainToggle = document.getElementById("autoGainToggle");
const ownerBadge = document.getElementById("ownerBadge");
const participantsPanel = document.getElementById("participantsPanel");
const participantsList = document.getElementById("participantsList");
const participantBtn = document.getElementById("participantBtn");
const closeParticipantsBtn = document.getElementById("closeParticipantsBtn");
const warnModal = document.getElementById("warnModal");
const kickedModal = document.getElementById("kickedModal");
const warningBanner = document.getElementById("warningBanner");
const warningText = document.getElementById("warningText");
const dismissWarning = document.getElementById("dismissWarning");
const localHandIndicator = document.getElementById("localHandIndicator");

roomIdDisplay.textContent = roomId;

const chat = new ChatManager(socket, roomId);

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    localVideo.srcObject = localStream;

    await enumerateDevices();

    localStream.getTracks().forEach((track) => {
      track.onended = () => {
        if (track.kind === "video") {
          camEnabled = false;
          updateCamButton();
        } else {
          micEnabled = false;
          updateMicButton();
        }
      };
    });

    socket.emit("join-room", { roomId }, (response) => {
      if (response.error) {
        alert(response.error);
        window.location.href = "/";
        return;
      }

      isOwner = response.isOwner || false;
      roomOwner = response.owner || null;
      if (isOwner) {
        ownerBadge.classList.remove("hidden");
      }
      waitingOverlay.classList.remove("hidden");

      if (response.warnings && response.warnings.length > 0) {
        const latestWarning = response.warnings[response.warnings.length - 1];
        showWarning(latestWarning.message);
      }

      if (response.users && response.users.length > 0) {
        response.users.forEach((userId) => {
          createPeer(userId, false);
        });
      }
    });
  } catch (err) {
    console.error("Failed to get media:", err);
    if (err.name === "NotAllowedError") {
      alert("Camera/microphone access was denied. Please allow access and refresh.");
    } else if (err.name === "NotFoundError") {
      alert("No camera or microphone found. Please connect a device and refresh.");
    } else {
      alert("Failed to access camera/microphone: " + err.message);
    }
  }
}

function createPeer(peerId, isInitiator) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peers.set(peerId, { pc, stream: null });

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  const chatChannel = isInitiator
    ? pc.createDataChannel("chat", { ordered: true })
    : null;

  if (isInitiator && chatChannel) {
    chat.addDataChannel(peerId, chatChannel);
  }

  pc.ondatachannel = (event) => {
    chat.addDataChannel(peerId, event.channel);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", {
        target: peerId,
        signal: { type: "ice-candidate", candidate: event.candidate },
      });
    }
  };

  pc.ontrack = (event) => {
    const peer = peers.get(peerId);
    if (peer) {
      peer.stream = event.streams[0];
      addRemoteVideo(peerId, event.streams[0]);
      waitingOverlay.classList.add("hidden");
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed") {
      console.warn(`Connection to ${peerId} failed, attempting ICE restart`);
      pc.restartIce();
    }
  };

  if (isInitiator) {
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit("signal", {
          target: peerId,
          signal: { type: "offer", sdp: pc.localDescription },
        });
      })
      .catch(console.error);
  }

  return pc;
}

function addRemoteVideo(peerId, stream) {
  let container = document.getElementById(`remote-${peerId}`);
  if (!container) {
    container = document.createElement("div");
    container.id = `remote-${peerId}`;
    container.className = "video-container remote";
    container.innerHTML = `
      <video autoplay playsinline></video>
      <div class="video-label">${remoteUsers.get(peerId) || "Participant"}</div>
      <div class="hand-raised-indicator hidden" id="hand-${peerId}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M18 8a2 2 0 012 2v2a2 2 0 01-2 2h-1l-1 5H8l-2-5H5a2 2 0 01-2-2v-6a2 2 0 014 0v4h2V6a2 2 0 014 0v4h2V8z" fill="#FFD60A"/>
        </svg>
      </div>
    `;
    videoGrid.appendChild(container);
  }

  const video = container.querySelector("video");
  video.srcObject = stream;
  updateGridLayout();
}

function removeRemoteVideo(peerId) {
  const container = document.getElementById(`remote-${peerId}`);
  if (container) {
    container.remove();
    updateGridLayout();
  }
}

function updateGridLayout() {
  const count = videoGrid.children.length;
  videoGrid.className = "video-grid";
  videoGrid.classList.add(`participants-${Math.min(count, 4)}`);

  if (count === 1) {
    waitingOverlay.classList.remove("hidden");
  }

  participantCount.textContent = count;
}

socket.on("signal", async ({ from, signal }) => {
  let peerData = peers.get(from);
  let pc;

  if (!peerData) {
    pc = createPeer(from, false);
    peerData = peers.get(from);
  } else {
    pc = peerData.pc;
  }

  try {
    if (signal.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", {
        target: from,
        signal: { type: "answer", sdp: pc.localDescription },
      });
    } else if (signal.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    } else if (signal.type === "ice-candidate") {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  } catch (err) {
    console.error("Signal handling error:", err);
  }
});

socket.on("user-connected", (userId) => {
  console.log("User connected:", userId);
  remoteUsers.set(userId, userId.slice(0, 8));
  createPeer(userId, true);
  participantCount.textContent = peers.size + 1;
  if (participantsPanel && !participantsPanel.classList.contains("hidden")) {
    renderParticipants();
  }
});

socket.on("user-disconnected", (userId) => {
  console.log("User disconnected:", userId);
  const peer = peers.get(userId);
  if (peer) {
    peer.pc.close();
    peers.delete(userId);
  }
  remoteUsers.delete(userId);
  raisedHands.delete(userId);
  chat.removeDataChannel(userId);
  removeRemoteVideo(userId);
  participantCount.textContent = peers.size + 1;
  if (participantsPanel && !participantsPanel.classList.contains("hidden")) {
    renderParticipants();
  }
});

// Ownership transferred
socket.on("ownership-transferred", () => {
  isOwner = true;
  roomOwner = socket.id;
  ownerBadge.classList.remove("hidden");
  renderParticipants();
});

// Raise hand
socket.on("raise-hand", ({ userId, raised }) => {
  const indicator = document.getElementById(`hand-${userId}`);
  if (indicator) {
    indicator.classList.toggle("hidden", !raised);
  }
  if (raised) {
    raisedHands.add(userId);
  } else {
    raisedHands.delete(userId);
  }
  if (participantsPanel && !participantsPanel.classList.contains("hidden")) {
    renderParticipants();
  }
});

// Ownership changed
socket.on("ownership-changed", ({ newOwner }) => {
  roomOwner = newOwner;
  isOwner = newOwner === socket.id;
  ownerBadge.classList.toggle("hidden", !isOwner);
  renderParticipants();
});

// Lower hand (moderator action)
socket.on("lower-hand", ({ targetId }) => {
  if (targetId === socket.id) {
    handRaised = false;
    raiseHandBtn.classList.remove("active");
    localHandIndicator.classList.add("hidden");
  }
  raisedHands.delete(targetId);
  const indicator = document.getElementById(`hand-${targetId}`);
  if (indicator) indicator.classList.add("hidden");
  if (participantsPanel && !participantsPanel.classList.contains("hidden")) {
    renderParticipants();
  }
});

// Kicked/Banned
socket.on("kicked", ({ type }) => {
  const titles = {
    kick: "You have been kicked",
    ban: "You have been banned",
    ipban: "You have been IP banned",
  };
  const messages = {
    kick: "You were removed from this call by the owner. You may rejoin.",
    ban: "You have been banned from this call and cannot rejoin.",
    ipban: "You have been IP banned from this call.",
  };
  document.getElementById("kickedTitle").textContent = titles[type] || "Removed";
  document.getElementById("kickedMessage").textContent = messages[type] || "";
  document.getElementById("kickedIcon").innerHTML =
    type === "kick" ? "&#x1F6AB;" : "&#x26D4;";
  kickedModal.classList.remove("hidden");
});

// Warning received
socket.on("warning-received", ({ message }) => {
  showWarning(message);
});

// Moderation events (owner sees)
socket.on("moderation-event", ({ type, target, by, message }) => {
  console.log(`Moderation: ${type} on ${target} by ${by}${message ? `: ${message}` : ""}`);
});

function showWarning(message) {
  warningText.textContent = `Warning: ${message}`;
  warningBanner.classList.remove("hidden");
}

dismissWarning.addEventListener("click", () => {
  warningBanner.classList.add("hidden");
});

document.getElementById("kickedOk").addEventListener("click", () => {
  window.location.href = "/";
});

// Controls
toggleMicBtn.addEventListener("click", () => {
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });
  updateMicButton();
});

toggleCamBtn.addEventListener("click", () => {
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = camEnabled;
  });
  updateCamButton();
});

function updateMicButton() {
  toggleMicBtn.querySelector(".icon-mic-on").classList.toggle("hidden", !micEnabled);
  toggleMicBtn.querySelector(".icon-mic-off").classList.toggle("hidden", micEnabled);
  toggleMicBtn.classList.toggle("active", !micEnabled);
}

function updateCamButton() {
  toggleCamBtn.querySelector(".icon-cam-on").classList.toggle("hidden", !camEnabled);
  toggleCamBtn.querySelector(".icon-cam-off").classList.toggle("hidden", camEnabled);
  toggleCamBtn.classList.toggle("active", !camEnabled);
  const localContainer = document.getElementById("localVideoContainer");
  localContainer.classList.toggle("cam-off", !camEnabled);
}

copyLinkBtn.addEventListener("click", () => {
  const link = `${window.location.origin}/room.html?room=${roomId}`;
  navigator.clipboard.writeText(link).then(() => {
    copyToast.classList.add("show");
    setTimeout(() => copyToast.classList.remove("show"), 2000);
  });
});

// Flip Camera
flipCamBtn.addEventListener("click", async () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  await replaceVideoTrack();
});

async function replaceVideoTrack() {
  const constraints = {
    video: {
      width: { ideal: parseInt(resolutionSelect.value.split("x")[0]) },
      height: { ideal: parseInt(resolutionSelect.value.split("x")[1]) },
      facingMode,
    },
  };

  if (selectedCamera) {
    constraints.video = { deviceId: { exact: selectedCamera } };
  }

  try {
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newVideoTrack = newStream.getVideoTracks()[0];

    for (const [, { pc }] of peers) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(newVideoTrack);
      }
    }

    const oldTrack = localStream.getVideoTracks()[0];
    if (oldTrack) {
      oldTrack.stop();
      localStream.removeTrack(oldTrack);
    }

    localStream.addTrack(newVideoTrack);
    localVideo.srcObject = localStream;

    newVideoTrack.onended = () => {
      camEnabled = false;
      updateCamButton();
    };
  } catch (err) {
    console.error("Failed to switch camera:", err);
  }
}

async function replaceAudioTrack() {
  const constraints = {
    audio: {
      echoCancellation: echoCancellationToggle.checked,
      noiseSuppression: noiseSuppressionToggle.checked,
      autoGainControl: autoGainToggle.checked,
    },
  };

  if (selectedMic) {
    constraints.audio = { deviceId: { exact: selectedMic } };
  }

  try {
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newAudioTrack = newStream.getAudioTracks()[0];

    for (const [, { pc }] of peers) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) {
        sender.replaceTrack(newAudioTrack);
      }
    }

    const oldTrack = localStream.getAudioTracks()[0];
    if (oldTrack) {
      oldTrack.stop();
      localStream.removeTrack(oldTrack);
    }

    localStream.addTrack(newAudioTrack);
    localVideo.srcObject = localStream;

    newAudioTrack.onended = () => {
      micEnabled = false;
      updateMicButton();
    };
  } catch (err) {
    console.error("Failed to switch microphone:", err);
  }
}

// Screen Share
screenShareBtn.addEventListener("click", async () => {
  if (isScreenSharing) {
    stopScreenShare();
  } else {
    startScreenShare();
  }
});

async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false,
    });

    const screenTrack = screenStream.getVideoTracks()[0];

    for (const [, { pc }] of peers) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(screenTrack);
      }
    }

    localVideo.srcObject = screenStream;
    isScreenSharing = true;
    screenShareBtn.classList.add("active");

    screenTrack.onended = () => {
      stopScreenShare();
    };
  } catch (err) {
    console.error("Screen share failed:", err);
  }
}

async function stopScreenShare() {
  if (!screenStream) return;

  screenStream.getTracks().forEach((track) => track.stop());

  const camTrack = localStream.getVideoTracks()[0];
  if (camTrack) {
    for (const [, { pc }] of peers) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(camTrack);
      }
    }
    localVideo.srcObject = localStream;
  }

  isScreenSharing = false;
  screenShareBtn.classList.remove("active");
  screenStream = null;
}

// Raise Hand
raiseHandBtn.addEventListener("click", () => {
  handRaised = !handRaised;
  raiseHandBtn.classList.toggle("active", handRaised);
  localHandIndicator.classList.toggle("hidden", !handRaised);
  socket.emit("raise-hand", handRaised);
});

// Settings Panel
settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
  settingsBtn.classList.toggle("active");
});

closeSettingsBtn.addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
  settingsBtn.classList.remove("active");
});

async function enumerateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameraSelect.innerHTML = "";
    micSelect.innerHTML = "";

    devices
      .filter((d) => d.kind === "videoinput")
      .forEach((device) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Camera ${cameraSelect.length + 1}`;
        if (device.deviceId === selectedCamera) option.selected = true;
        cameraSelect.appendChild(option);
      });

    devices
      .filter((d) => d.kind === "audioinput")
      .forEach((device) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Microphone ${micSelect.length + 1}`;
        if (device.deviceId === selectedMic) option.selected = true;
        micSelect.appendChild(option);
      });
  } catch (err) {
    console.error("Failed to enumerate devices:", err);
  }
}

cameraSelect.addEventListener("change", (e) => {
  selectedCamera = e.target.value;
  replaceVideoTrack();
});

micSelect.addEventListener("change", (e) => {
  selectedMic = e.target.value;
  replaceAudioTrack();
});

resolutionSelect.addEventListener("change", () => replaceVideoTrack());
noiseSuppressionToggle.addEventListener("change", () => replaceAudioTrack());
echoCancellationToggle.addEventListener("change", () => replaceAudioTrack());
autoGainToggle.addEventListener("change", () => replaceAudioTrack());

// Participant panel
participantBtn.addEventListener("click", () => {
  participantsPanel.classList.toggle("hidden");
  renderParticipants();
});

closeParticipantsBtn.addEventListener("click", () => {
  participantsPanel.classList.add("hidden");
});

document.addEventListener("click", (e) => {
  if (
    participantsPanel &&
    !participantsPanel.contains(e.target) &&
    !participantBtn.contains(e.target)
  ) {
    participantsPanel.classList.add("hidden");
  }
});

function renderParticipants() {
  participantsList.innerHTML = "";

  // Owner first
  if (roomOwner) {
    participantsList.appendChild(createParticipantRow(roomOwner, true));
  }

  // Other users
  for (const [userId] of peers) {
    if (userId !== roomOwner) {
      participantsList.appendChild(createParticipantRow(userId, false));
    }
  }
}

function createParticipantRow(userId, isOwnerUser) {
  const div = document.createElement("div");
  div.className = "participant-row";

  const handUp = raisedHands.has(userId);
  const label = userId === socket.id ? "You" : userId.slice(0, 8);

  let actionsHtml = "";
  if (isOwner && userId !== socket.id) {
    actionsHtml = `
      <div class="participant-actions">
        <button class="p-action" data-action="warn" data-id="${userId}" title="Warn">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1L1 14h14L8 1z" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button class="p-action" data-action="lower-hand" data-id="${userId}" title="Lower hand" ${!handUp ? "disabled" : ""}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 8a2 2 0 012 2v2a2 2 0 01-2 2h-1l-1 5H8l-2-5H5a2 2 0 01-2-2v-6a2 2 0 014 0v4h2V6a2 2 0 014 0v4h2V8z" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="p-action" data-action="transfer" data-id="${userId}" title="Transfer ownership">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 4 4M6 8v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="p-action p-danger" data-action="kick" data-id="${userId}" title="Kick">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M2 14c0-3 2.5-5 6-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button class="p-action p-danger" data-action="ban" data-id="${userId}" title="Ban">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button class="p-action p-danger" data-action="ipban" data-id="${userId}" title="IP Ban">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M5 5l6 6M11 5L5 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    `;
  }

  div.innerHTML = `
    <div class="participant-info">
      <span class="participant-name">${label}</span>
      ${isOwnerUser ? '<span class="participant-owner-tag">Owner</span>' : ""}
      ${handUp ? '<span class="participant-hand">&#9995;</span>' : ""}
    </div>
    ${actionsHtml}
  `;

  if (isOwner && userId !== socket.id) {
    div.querySelectorAll(".p-action").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        handleParticipantAction(action, id);
      });
    });
  }

  return div;
}

function handleParticipantAction(action, targetId) {
  switch (action) {
    case "warn":
      document.getElementById("warnModalTarget").textContent = `Warn participant`;
      warnModal.classList.remove("hidden");
      document.getElementById("warnMessage").value = "";
      document.getElementById("warnMessage").focus();
      contextTargetId = targetId;
      break;
    case "lower-hand":
      socket.emit("lower-hand", targetId);
      raisedHands.delete(targetId);
      renderParticipants();
      break;
    case "transfer":
      if (confirm("Transfer ownership to this participant?")) {
        socket.emit("transfer-ownership", targetId);
      }
      break;
    case "kick":
      socket.emit("kick-user", targetId);
      break;
    case "ban":
      socket.emit("ban-user", targetId);
      break;
    case "ipban":
      socket.emit("ip-ban-user", targetId);
      break;
  }
}

document.getElementById("warnCancel").addEventListener("click", () => {
  warnModal.classList.add("hidden");
});

document.getElementById("warnConfirm").addEventListener("click", () => {
  const message = document.getElementById("warnMessage").value.trim();
  if (message && contextTargetId) {
    socket.emit("warn-user", { targetId: contextTargetId, message });
  }
  warnModal.classList.add("hidden");
});

// Leave
leaveBtn.addEventListener("click", () => {
  socket.emit("leave-room");
  localStream.getTracks().forEach((track) => track.stop());
  if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
  for (const [, { pc }] of peers) {
    pc.close();
  }
  window.location.href = "/";
});

window.addEventListener("beforeunload", () => {
  socket.emit("leave-room");
});

init();
