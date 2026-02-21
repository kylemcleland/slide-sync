const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Load slides from the slides/ directory on startup
const slidesDir = path.join(__dirname, 'slides');
const slides = fs.readdirSync(slidesDir)
  .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map(f => `/slides/${f}`);

console.log(`Loaded ${slides.length} slides`);

let current = 0;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/slides', express.static(slidesDir));

// Presenter page
app.get('/present', (req, res) => res.sendFile(path.join(__dirname, 'public', 'presenter.html')));

// Audience page (default)
app.get('/view', (req, res) => res.sendFile(path.join(__dirname, 'public', 'viewer.html')));

// API to get slide list
app.get('/api/slides', (req, res) => res.json({ slides, current }));

io.on('connection', (socket) => {
  socket.emit('slide-change', { slide: slides[current], index: current, total: slides.length });

  socket.on('navigate', (direction) => {
    if (direction === 'next' && current < slides.length - 1) current++;
    else if (direction === 'prev' && current > 0) current--;
    else if (typeof direction === 'number') current = Math.max(0, Math.min(direction, slides.length - 1));
    io.emit('slide-change', { slide: slides[current], index: current, total: slides.length });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Slide Sync running on port ${PORT}`));
