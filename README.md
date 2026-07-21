# CamCall

A FaceTime-like web application for peer-to-peer video calls with in-call messaging.

## Features

- P2P video calls via WebRTC (up to 8 participants)
- In-call text chat via data channels (no server relay)
- Screen sharing
- Flip camera
- Raise hand
- Device selection (camera, microphone)
- Resolution and audio settings
- Password-protected rooms
- Owner moderation: warn, kick, ban, IP ban, lower hand, transfer ownership
- Community rules page

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Desktop Installers

Cross-platform shell installers that auto-install Node.js if needed (download from [Releases](https://github.com/heyjudewalter/cam-call/releases)):

| Platform | Script |
|----------|--------|
| macOS / Linux | `bash install.sh` |
| Windows | Double-click `install.bat` |
| Windows (PowerShell) | Right-click `install.ps1` > Run with PowerShell |

## Electron Desktop App

Native desktop app — no terminal, no browser needed. Runs the server in the background.

```bash
npm install
npm run electron        # Run in dev mode
npm run build:mac       # Build .dmg (macOS)
npm run build:win       # Build .exe installer (Windows)
npm run build:linux     # Build .AppImage (Linux)
```

Output will be in the `dist/` folder.

## Deploy to JustRunMy.App

1. Push this repo to GitHub
2. Connect your GitHub repo on [JustRunMy.App](https://justrunmy.app)
3. Set the start command to `npm start`
4. Done

## Project Structure

```
camcall/
  server.js          # Express + Socket.IO signaling server
  electron/
    main.js          # Electron main process
  public/
    index.html       # Landing page (create/join room)
    room.html        # Video call room
    rules.html       # Community rules
    css/styles.css   # All styles
    js/
      app.js         # Landing page logic
      room.js        # WebRTC, controls, moderation
      chat.js        # In-call messaging
```

## Tech Stack

- Node.js + Express
- Socket.IO (signaling only)
- WebRTC (P2P media + data channels)
- Vanilla JS (no frameworks)

## License

MIT
