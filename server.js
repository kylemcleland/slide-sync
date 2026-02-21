const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 50e6 }); // 50MB max for image uploads

// In-memory rooms: { roomId: { slides: [base64...], current: 0, presenterSocket: null } }
const rooms = {};

app.use(express.static(path.join(__dirname, 'public')));

// Presenter page
app.get('/present', (req, res) => {
  const roomId = crypto.randomBytes(4).toString('hex');
  rooms[roomId] = { slides: [], current: 0, presenterSocket: null };
  res.redirect(`/present/${roomId}`);
});

app.get('/present/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'presenter.html'));
});

// Audience page
app.get('/view/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

io.on('connection', (socket) => {
  // Presenter joins
  socket.on('presenter-join', (roomId) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Room not found');
    room.presenterSocket = socket.id;
    socket.join(roomId);
    socket.emit('room-state', { slides: room.slides, current: room.current });
  });

  // Audience joins
  socket.on('viewer-join', (roomId) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Room not found');
    socket.join(roomId);
    if (room.slides.length > 0) {
      socket.emit('slide-change', { slide: room.slides[room.current], index: room.current, total: room.slides.length });
    } else {
      socket.emit('waiting', 'Waiting for presenter to upload slides...');
    }
  });

  // Upload slides (array of base64 images)
  socket.on('upload-slides', ({ roomId, slides }) => {
    const room = rooms[roomId];
    if (!room || room.presenterSocket !== socket.id) return;
    room.slides = slides;
    room.current = 0;
    socket.emit('room-state', { slides: room.slides, current: room.current });
    io.to(roomId).emit('slide-change', { slide: room.slides[0], index: 0, total: slides.length });
  });

  // Navigate
  socket.on('navigate', ({ roomId, direction }) => {
    const room = rooms[roomId];
    if (!room || room.presenterSocket !== socket.id) return;
    if (direction === 'next' && room.current < room.slides.length - 1) room.current++;
    else if (direction === 'prev' && room.current > 0) room.current--;
    else if (typeof direction === 'number') room.current = Math.max(0, Math.min(direction, room.slides.length - 1));
    const data = { slide: room.slides[room.current], index: room.current, total: room.slides.length };
    io.to(roomId).emit('slide-change', data);
  });
});

// Cleanup stale rooms every 30 min
setInterval(() => {
  // Simple cleanup — remove rooms with no connections
  for (const [roomId, room] of Object.entries(rooms)) {
    const sockets = io.sockets.adapter.rooms.get(roomId);
    if (!sockets || sockets.size === 0) delete rooms[roomId];
  }
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Slide Sync running on port ${PORT}`));
