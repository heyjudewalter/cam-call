class ChatManager {
  constructor(socket, roomId) {
    this.socket = socket;
    this.roomId = roomId;
    this.dataChannels = new Map();
    this.messages = [];
    this.unreadCount = 0;

    this.messagesEl = document.getElementById("chatMessages");
    this.inputEl = document.getElementById("chatInput");
    this.formEl = document.getElementById("chatForm");
    this.panelEl = document.getElementById("chatPanel");
    this.badgeEl = document.getElementById("chatBadge");
    this.toggleBtn = document.getElementById("toggleChatBtn");
    this.closeBtn = document.getElementById("closeChatBtn");

    this.setupUI();
    this.setupSocket();
  }

  setupUI() {
    this.toggleBtn.addEventListener("click", () => this.togglePanel());
    this.closeBtn.addEventListener("click", () => this.togglePanel());
    this.formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      this.sendMessage();
    });
  }

  setupSocket() {}

  addDataChannel(peerId, channel) {
    channel.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "chat") {
        this.addMessage(data.text, false, data.timestamp);
      }
    };
    this.dataChannels.set(peerId, channel);
  }

  removeDataChannel(peerId) {
    this.dataChannels.delete(peerId);
  }

  sendMessage() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.addMessage(text, true, Date.now());

    const payload = JSON.stringify({
      type: "chat",
      text,
      timestamp: Date.now(),
    });

    for (const [, channel] of this.dataChannels) {
      if (channel.readyState === "open") {
        channel.send(payload);
      }
    }

    this.inputEl.value = "";
  }

  addMessage(text, isSelf, timestamp) {
    this.messages.push({ text, isSelf, timestamp });
    this.renderMessage(text, isSelf, timestamp);

    if (!isSelf && this.panelEl.classList.contains("hidden")) {
      this.unreadCount++;
      this.badgeEl.textContent = this.unreadCount;
      this.badgeEl.classList.remove("hidden");
    }
  }

  renderMessage(text, isSelf, timestamp) {
    const div = document.createElement("div");
    div.className = `chat-message ${isSelf ? "self" : "other"}`;

    const time = new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    div.innerHTML = `
      ${!isSelf ? '<span class="sender">Participant</span>' : ""}
      <div class="bubble">${this.escapeHtml(text)}</div>
      <span class="time">${time}</span>
    `;

    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  togglePanel() {
    this.panelEl.classList.toggle("hidden");
    this.toggleBtn.classList.toggle("active");
    if (!this.panelEl.classList.contains("hidden")) {
      this.unreadCount = 0;
      this.badgeEl.classList.add("hidden");
      this.inputEl.focus();
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
