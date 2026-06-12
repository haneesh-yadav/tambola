# 🎯 Tambola Game

A real-time, multiplayer Tambola (Housie/Bingo) web application built for tambola lovers. Supports up to 200+ simultaneous players with live number calling, ticket management, and win verification.

---

## ✨ Features

- **Multi-room hosting** — create separate parallel rooms (4-digit unique code) so anyone can host and play at the same time
- **Session Recovery & Reconnection protection** — players can refresh or disconnect and resume with their ticket intact
- **Real-time multiplayer** via WebSockets (Socket.IO) — 200+ players simultaneously per room
- **Auto-generated tickets** — valid Tambola tickets (3×9 grid, 15 numbers per ticket)
- **6 win categories** — Top Line, Middle Line, Bottom Line, Corners, Early Five, Full House
- **Instant win verification** — server-side validation of all claims
- **Auto-call mode** — host can set intervals from 3–30 seconds
- **Live number board** — all 90 numbers tracked in real time
- **Mobile-first design** — fully responsive, optimized for phones
- **Minimal, aesthetic UI** — dark theme, Outfit + Poppins fonts, Material Icons

---

## 🚀 Quick Start

### Prerequisites
- Node.js v16+ and npm

### 1. Install dependencies

```bash
# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

### 2. Start the server

```bash
cd server
npm start
# Server runs on http://localhost:3001
```

### 3. Start the client (development)

```bash
cd client
npm start
# Opens http://localhost:3000
```

---

## 🏗️ Project Structure

```
tambola/
├── server/
│   ├── index.js          ← Express + Socket.IO server, all game logic
│   └── package.json
└── client/
    ├── public/
    │   └── index.html
    └── src/
        ├── App.js / App.css
        ├── context/
        │   └── SocketContext.js   ← Socket.IO React context
        ├── pages/
        │   ├── Landing.js/.css    ← Home screen
        │   ├── Host.js/.css       ← Host control panel
        │   └── Play.js/.css       ← Player game screen
        └── components/
            ├── Ticket.js/.css     ← Tambola ticket + claim buttons
            ├── NumberBoard.js/.css← 1–90 number grid
            ├── WinnerBanner.js/.css← Winner announcement overlay
            └── Toast.js           ← Notification system
```

---

## 🎮 How to Play

### For the Host
1. Open the landing page and click **Host Game**
2. A new room will be created with a unique 4-digit code (e.g. `/host/4831`)
3. Click the **Room ID Badge** to copy the shareable direct invite link
4. Wait for players to join (player status and count updated live in header)
5. Click **Start Game** when ready
6. Click **Call Number** to manually call numbers, OR toggle **Auto-Call** and set an interval (3–30 seconds)
7. Monitor winners on the Winners Board
8. Use **Pause** to pause mid-game if needed or **Reset** to restart

### For Players
1. Open the shared direct invite link on your phone (e.g. `http://.../play/4831`), OR open the landing page, click **Join Game**, and enter the 4-digit Room ID manually
2. Enter your name and click **Get My Ticket**
3. Watch numbers being called live
4. Tap **Claim** buttons when you have a winning pattern
5. The server verifies claims automatically — only valid claims are accepted

---

## 🎲 Game Rules

| Category | How to win |
|---|---|
| **Top Line** | All 5 numbers on the top row |
| **Middle Line** | All 5 numbers on the middle row |
| **Bottom Line** | All 5 numbers on the bottom row |
| **Four Corners** | First & last number of top and bottom rows |
| **Early Five** | Any 5 numbers on your ticket |
| **Full House** | All 15 numbers on your ticket |

Each category can only be won **once**. Claims are verified server-side — no cheating!

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router v6 |
| Backend | Node.js, Express, dotenv |
| Real-time | Socket.IO (WebSockets) |
| Styling | CSS Variables, glassmorphism, modern gradients, hover animations |
| Fonts | Google Fonts (Outfit, Poppins) |

---

## 📱 Mobile Optimization

- Viewport meta tag with `user-scalable=no` for consistent experience
- Touch-friendly tap targets (minimum 44px)
- Responsive grid layout for ticket display
- Bottom-sheet modals on mobile
- Optimized font sizes with `clamp()`

---

Built with ❤️ by Haneesh · Season 2026
