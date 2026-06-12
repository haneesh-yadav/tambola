require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// ─── Max Winners Per Prize ────────────────────────────────────────────────────
const MAX_WINNERS = {
  topLine: 4,
  middleLine: 4,
  bottomLine: 4,
  corners: 4,
  earlyFive: 5,
  fullHouse: 3,
};

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

// ─── Game State ──────────────────────────────────────────────────────────────

const rooms = new Map();

// Helper to generate a unique 4-digit roomId
function generateRoomId() {
  let roomId;
  do {
    roomId = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(roomId));
  return roomId;
}

// Helper to initialize a room
function createRoom(roomId, hostSocketId) {
  const room = {
    roomId,
    hostSocketId,
    status: 'waiting',
    calledNumbers: [],
    currentNumber: null,
    players: {},
    gameId: uuidv4(),
    winners: {
      topLine: [],
      middleLine: [],
      bottomLine: [],
      corners: [],
      earlyFive: [],
      fullHouse: [],
    },
    autoCallInterval: null,
    autoCallDelay: 5000,
    numberBag: generateNumberBag(),
    cleanupTimeout: null
  };
  rooms.set(roomId, room);
  return room;
}

// Helper to get public state of a room
function getPublicState(room) {
  if (!room) return null;
  return {
    roomId: room.roomId,
    status: room.status,
    calledNumbers: room.calledNumbers,
    currentNumber: room.currentNumber,
    playerCount: Object.keys(room.players).length,
    winners: room.winners,
    autoCallDelay: room.autoCallDelay,
    gameId: room.gameId,
  };
}

// ─── Tambola Ticket Generator (Guaranteed 5 per row) ─────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateTicket() {
  const colRanges = [
    [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
    [50, 59], [60, 69], [70, 79], [80, 90],
  ];

  // Step 1: Build a pool of numbers for each column (shuffled)
  const colPools = colRanges.map(([min, max]) => {
    const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return shuffle(nums);
  });

  // Step 2: Initialize 3x9 grid with nulls
  const grid = Array.from({ length: 3 }, () => Array(9).fill(null));

  // Step 3: For each row, pick exactly 5 columns to fill
  for (let row = 0; row < 3; row++) {
    // Shuffle column indices and pick 5
    const colIndices = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 5).sort((a, b) => a - b);
    for (const col of colIndices) {
      // Pick a number from this column's pool
      grid[row][col] = colPools[col].pop();
    }
  }

  // Step 4: Sort numbers within each column in ascending order
  for (let col = 0; col < 9; col++) {
    const filled = [];
    const filledRows = [];
    for (let row = 0; row < 3; row++) {
      if (grid[row][col] !== null) {
        filled.push(grid[row][col]);
        filledRows.push(row);
      }
    }
    filled.sort((a, b) => a - b);
    filledRows.forEach((row, i) => {
      grid[row][col] = filled[i];
    });
  }

  return grid;
}

function generateNumberBag() {
  const nums = Array.from({ length: 90 }, (_, i) => i + 1);
  return shuffle(nums);
}

// ─── Win Condition Checkers ───────────────────────────────────────────────────

function checkWinConditions(ticket, calledNumbers) {
  const called = new Set(calledNumbers);
  const results = {};

  for (let row = 0; row < 3; row++) {
    const rowNums = ticket[row].filter(n => n !== null);
    results[`row${row}`] = rowNums.every(n => called.has(n));
  }

  // Corners: first and last number of first and last row
  const topRow = ticket[0].filter(n => n !== null);
  const botRow = ticket[2].filter(n => n !== null);
  results.corners =
    topRow.length >= 2 && botRow.length >= 2 &&
    called.has(topRow[0]) && called.has(topRow[topRow.length - 1]) &&
    called.has(botRow[0]) && called.has(botRow[botRow.length - 1]);

  // Early Five: any 5 numbers from ticket called
  const allNums = ticket.flat().filter(n => n !== null);
  const calledFromTicket = allNums.filter(n => called.has(n));
  results.earlyFive = calledFromTicket.length >= 5;

  // Full house
  results.fullHouse = allNums.every(n => called.has(n));

  return results;
}

// ─── Socket.IO ───────────────────────────────────────────────────────────────

// Helper to reset a room's game
function resetRoomGame(room) {
  if (room.autoCallInterval) {
    clearInterval(room.autoCallInterval);
  }
  room.numberBag = generateNumberBag();
  room.status = 'waiting';
  room.calledNumbers = [];
  room.currentNumber = null;
  // Reset player claims
  Object.keys(room.players).forEach(pid => {
    room.players[pid].claims = [];
  });
  room.gameId = uuidv4();
  room.winners = {
    topLine: [],
    middleLine: [],
    bottomLine: [],
    corners: [],
    earlyFive: [],
    fullHouse: [],
  };
  room.autoCallInterval = null;
}

// Helper to call next number for a room
function callNextRoomNumber(room, io) {
  if (room.numberBag.length === 0) {
    room.status = 'ended';
    io.to(room.roomId).emit('game:ended', { message: 'All 90 numbers called!' });
    if (room.autoCallInterval) clearInterval(room.autoCallInterval);
    room.autoCallInterval = null;
    return null;
  }
  const num = room.numberBag.shift();
  room.calledNumbers.push(num);
  room.currentNumber = num;
  io.to(room.roomId).emit('number:called', {
    number: num,
    calledNumbers: room.calledNumbers,
    remaining: room.numberBag.length,
  });
  return num;
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Create a new room (called by host)
  socket.on('room:create', () => {
    const roomId = generateRoomId();
    createRoom(roomId, socket.id);
    socket.roomId = roomId;
    socket.isHost = true;
    socket.join(roomId);
    socket.join(`host-room-${roomId}`);
    socket.emit('room:created', { roomId });
    console.log(`[ROOM CREATED] ${roomId} by host: ${socket.id}`);
  });

  // Host joins/reconnects to a room
  socket.on('host:join', ({ roomId }) => {
    if (!roomId) {
      socket.emit('error', { message: 'Room ID is required.' });
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found.' });
      return;
    }

    // Cancel cleanup timeout if host reconnected
    if (room.cleanupTimeout) {
      clearTimeout(room.cleanupTimeout);
      room.cleanupTimeout = null;
      console.log(`[HOST RECONNECTED] Room: ${roomId}`);
    }

    // Update host socket id
    room.hostSocketId = socket.id;
    socket.roomId = roomId;
    socket.isHost = true;
    socket.join(roomId);
    socket.join(`host-room-${roomId}`);
    socket.emit('host:joined', { gameId: room.gameId, state: getPublicState(room) });

    // Send players list to host
    socket.emit('host:playerUpdate', {
      playerCount: Object.keys(room.players).length,
      players: Object.values(room.players).map(p => ({ id: p.id, name: p.name })),
    });

    console.log(`[HOST JOINED] Room: ${roomId}, socket: ${socket.id}`);
  });

  // Player joins a room
  socket.on('player:join', ({ roomId, name, playerToken }) => {
    if (!roomId) {
      socket.emit('error', { message: 'Room ID is required.' });
      return;
    }
    const room = rooms.get(roomId.toString().trim());
    if (!room) {
      socket.emit('error', { message: 'Room not found. Please check Room ID.' });
      return;
    }
    if (room.status !== 'waiting' && room.status !== 'running') {
      socket.emit('error', { message: 'Game is not accepting players right now.' });
      return;
    }
    if (!name || name.trim().length < 2) {
      socket.emit('error', { message: 'Name must be at least 2 characters.' });
      return;
    }
    if (!playerToken) {
      socket.emit('error', { message: 'Player token is required.' });
      return;
    }

    socket.roomId = room.roomId;
    socket.playerToken = playerToken;
    socket.isPlayer = true;
    socket.join(room.roomId);

    let player = Object.values(room.players).find(p => p.token === playerToken);

    if (player) {
      console.log(`[PLAYER RECONNECTED] Room: ${room.roomId}, Token: ${playerToken}, Old Socket: ${player.id}, New Socket: ${socket.id}`);
      
      delete room.players[player.id];
      
      if (player.disconnectTimeout) {
        clearTimeout(player.disconnectTimeout);
        player.disconnectTimeout = null;
      }

      player.id = socket.id;
      player.name = name.trim();
      player.status = 'active';
      room.players[socket.id] = player;
    } else {
      const ticket = generateTicket();
      player = {
        id: socket.id,
        token: playerToken,
        name: name.trim(),
        ticket,
        claims: [],
        status: 'active',
        joinedAt: Date.now(),
        disconnectTimeout: null,
      };
      room.players[socket.id] = player;
      console.log(`[PLAYER JOINED] Room: ${room.roomId}, Name: ${name} (${socket.id})`);
    }

    socket.emit('player:joined', {
      player,
      state: getPublicState(room),
    });

    io.to(`host-room-${room.roomId}`).emit('host:playerUpdate', {
      playerCount: Object.keys(room.players).length,
      players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, status: p.status })),
    });
  });

  // Host actions
  socket.on('host:startGame', () => {
    const room = rooms.get(socket.roomId);
    if (!room || socket.id !== room.hostSocketId) return;
    if (room.status === 'running') return;

    room.numberBag = generateNumberBag();
    room.status = 'running';
    room.calledNumbers = [];
    room.currentNumber = null;
    room.winners = {
      topLine: [], middleLine: [], bottomLine: [],
      corners: [], earlyFive: [], fullHouse: [],
    };

    io.to(room.roomId).emit('game:started', getPublicState(room));
    console.log(`[GAME STARTED] Room: ${room.roomId}`);
  });

  socket.on('host:callNumber', () => {
    const room = rooms.get(socket.roomId);
    if (!room || socket.id !== room.hostSocketId) return;
    if (room.status !== 'running') return;
    callNextRoomNumber(room, io);
  });

  socket.on('host:toggleAutoCall', ({ enabled, delay }) => {
    const room = rooms.get(socket.roomId);
    if (!room || socket.id !== room.hostSocketId) return;
    if (delay) room.autoCallDelay = delay;

    if (enabled) {
      if (room.autoCallInterval) clearInterval(room.autoCallInterval);
      room.autoCallInterval = setInterval(() => {
        if (room.status === 'running') callNextRoomNumber(room, io);
        else clearInterval(room.autoCallInterval);
      }, room.autoCallDelay);
      socket.emit('host:autoCallStatus', { enabled: true, delay: room.autoCallDelay });
    } else {
      if (room.autoCallInterval) clearInterval(room.autoCallInterval);
      room.autoCallInterval = null;
      socket.emit('host:autoCallStatus', { enabled: false });
    }
  });

  socket.on('host:pauseGame', () => {
    const room = rooms.get(socket.roomId);
    if (!room || socket.id !== room.hostSocketId) return;
    if (room.status === 'running') {
      room.status = 'paused';
      if (room.autoCallInterval) clearInterval(room.autoCallInterval);
      io.to(room.roomId).emit('game:paused');
    } else if (room.status === 'paused') {
      room.status = 'running';
      io.to(room.roomId).emit('game:resumed', getPublicState(room));
    }
  });

  socket.on('host:resetGame', () => {
    const room = rooms.get(socket.roomId);
    if (!room || socket.id !== room.hostSocketId) return;
    resetRoomGame(room);
    io.to(room.roomId).emit('game:reset', getPublicState(room));
    console.log(`[GAME RESET] Room: ${room.roomId}`);
  });

  // Player action: claim win
  socket.on('player:claim', ({ type }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player) return;
    if (room.status !== 'running') {
      socket.emit('claim:rejected', { type, reason: 'Game is not running' });
      return;
    }

    const validTypes = ['topLine', 'middleLine', 'bottomLine', 'corners', 'earlyFive', 'fullHouse'];
    if (!validTypes.includes(type)) return;

    if (player.claims.includes(type)) {
      socket.emit('claim:rejected', { type, reason: 'You already claimed this prize' });
      return;
    }

    if (room.winners[type].length >= MAX_WINNERS[type]) {
      socket.emit('claim:rejected', { type, reason: `All ${MAX_WINNERS[type]} winners for ${type} already found!` });
      return;
    }

    const wins = checkWinConditions(player.ticket, room.calledNumbers);
    const typeToCheck = {
      topLine: 'row0',
      middleLine: 'row1',
      bottomLine: 'row2',
      corners: 'corners',
      earlyFive: 'earlyFive',
      fullHouse: 'fullHouse',
    };
    const key = typeToCheck[type];

    if (wins[key]) {
      room.winners[type].push({ id: socket.id, name: player.name });
      player.claims.push(type);

      const isFull = room.winners[type].length >= MAX_WINNERS[type];
      const winData = {
        type,
        player: { id: socket.id, name: player.name },
        winners: room.winners[type],
        isFull,
      };
      io.to(room.roomId).emit('game:winner', winData);
      socket.emit('claim:accepted', { type });

      console.log(`[WIN] Room: ${room.roomId}, ${player.name} -> ${type} (${room.winners[type].length}/${MAX_WINNERS[type]})`);
    } else {
      socket.emit('claim:rejected', { type, reason: 'Numbers not matching. Keep playing!' });
    }
  });

  // Get current state
  socket.on('state:get', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const player = room.players[socket.id];
    socket.emit('state:current', {
      ...getPublicState(room),
      player: player || null,
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.isHost) {
      console.log(`[-] Host disconnected from room: ${roomId}. Waiting 2 mins for reconnect...`);
      // Notify players
      io.to(roomId).emit('game:hostDisconnected');
      // Set cleanup timeout
      room.cleanupTimeout = setTimeout(() => {
        if (room.autoCallInterval) clearInterval(room.autoCallInterval);
        io.to(roomId).emit('game:roomClosed', { message: 'Host disconnected and room closed.' });
        rooms.delete(roomId);
        console.log(`[ROOM CLOSED] Room: ${roomId} due to host disconnect timeout`);
      }, 1000 * 60 * 2); // 2 minutes
    } else if (socket.isPlayer) {
      const player = room.players[socket.id];
      if (player) {
        console.log(`[-] Player disconnected: ${player.name} from room: ${roomId}. Waiting 2 mins for reconnect...`);
        player.status = 'inactive';
        
        io.to(`host-room-${roomId}`).emit('host:playerUpdate', {
          playerCount: Object.keys(room.players).length,
          players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, status: p.status })),
        });

        player.disconnectTimeout = setTimeout(() => {
          if (room.players[player.id]) {
            const name = room.players[player.id].name;
            delete room.players[player.id];
            io.to(`host-room-${roomId}`).emit('host:playerUpdate', {
              playerCount: Object.keys(room.players).length,
              players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, status: p.status })),
            });
            console.log(`[PLAYER REMOVED] Room: ${roomId}, Player: ${name} due to disconnect timeout`);
          }
        }, 1000 * 60 * 2); // 2 minutes
      }
    }
  });
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ ok: true, activeRooms: rooms.size }));

// ─── Init ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🎯 Tambola server running on port ${PORT}`));

// Keep-alive ping
setInterval(() => {
  console.log('keepalive');
}, 1000 * 60 * 4);
