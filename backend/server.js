// server.js - Main GPS Tracking Server
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initDB, insertPoint, getTrail, getDevices, saveAlert, getAlerts } = require('./db');
const { startTCPListener, startUDPListener } = require('./gps-listener');
const { loadGeofences, analyzePoint, getMovementCategory, getGeofences } = require('./analyzer');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── In-memory live state ──────────────────────────────────────────────────
const liveDevices = {};

// ─── Core GPS point handler ────────────────────────────────────────────────
// ALL routes that call handleGPSPoint must be defined AFTER this function
async function handleGPSPoint(point) {
  const { deviceId, lat, lon, speed, heading, altitude, name } = point;

  if (!liveDevices[deviceId]) {
    liveDevices[deviceId] = { trail: [] };
    console.log(`[Server] New device connected: ${deviceId}`);
  }

  const device = liveDevices[deviceId];
  device.lat = lat;
  device.lon = lon;
  device.speed = speed;
  device.heading = heading;
  device.altitude = altitude;
  device.name = name || deviceId;
  device.lastSeen = new Date().toISOString();
  device.movement = getMovementCategory(speed);

  device.trail.push({ lat, lon, speed, heading, ts: device.lastSeen });
  if (device.trail.length > 500) device.trail.shift();

  insertPoint(deviceId, lat, lon, speed, heading, altitude || 0);

  const alerts = analyzePoint(deviceId, lat, lon, speed, device.lastSeen);
  for (const alert of alerts) {
    console.log(`[ALERT] ${alert.type.toUpperCase()}: ${alert.message}`);
    saveAlert(deviceId, alert.type, alert.message, alert.lat, alert.lon);
    io.emit('alert', { deviceId, ...alert, timestamp: new Date().toISOString() });
  }

  io.emit('position', {
    deviceId,
    lat, lon, speed, heading,
    name: device.name,
    movement: device.movement,
    timestamp: device.lastSeen,
  });
}

// ─── REST API Endpoints ────────────────────────────────────────────────────

app.get('/api/devices', async (req, res) => {
  const devices = Object.entries(liveDevices).map(([id, d]) => ({
    id, ...d, trail: undefined,
  }));
  res.json(devices);
});

app.get('/api/trail/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const dbTrail = await getTrail(deviceId, 500);
  if (dbTrail.length > 0) {
    res.json(dbTrail);
  } else {
    res.json(liveDevices[deviceId]?.trail || []);
  }
});

app.get('/api/alerts', async (req, res) => {
  const alerts = await getAlerts(50);
  res.json(alerts);
});

app.get('/api/geofences', (req, res) => {
  res.json(getGeofences());
});

app.get('/api/stats', (req, res) => {
  const devices = Object.values(liveDevices);
  res.json({
    totalDevices: devices.length,
    activeDevices: devices.filter(d => Date.now() - new Date(d.lastSeen).getTime() < 10000).length,
    avgSpeed: devices.reduce((s, d) => s + (d.speed || 0), 0) / Math.max(devices.length, 1),
  });
});

// ─── Manual input endpoint ─────────────────────────────────────────────────
app.post('/api/manual', (req, res) => {
  const { deviceId, lat, lon, speed, heading } = req.body;
  handleGPSPoint({
    deviceId: deviceId || 'demo_device',
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    speed: parseFloat(speed) || 0,
    heading: parseFloat(heading) || 0,
    altitude: 0,
    name: deviceId || 'Demo Device',
  });
  res.json({ ok: true });
});

// ─── Random movement engine ────────────────────────────────────────────────
const randomMovers = {};

app.post('/api/start-random', (req, res) => {
  const { deviceId, lat, lon, speed } = req.body;

  // Stop existing mover if already running for this device
  if (randomMovers[deviceId]) {
    clearInterval(randomMovers[deviceId]);
  }

  let curLat = parseFloat(lat);
  let curLon = parseFloat(lon);
  let curHeading = Math.random() * 360;

  randomMovers[deviceId] = setInterval(() => {
    // Turn gradually — max 30 degrees per second
    curHeading += (Math.random() - 0.5) * 30;
    curHeading = (curHeading + 360) % 360;

    const speedKmh = parseFloat(speed) || 40;
    const distanceKm = speedKmh / 3600;

    // Move in current heading direction
    curLat += distanceKm / 111 * Math.cos(curHeading * Math.PI / 180);
    curLon += distanceKm / (111 * Math.cos(curLat * Math.PI / 180)) * Math.sin(curHeading * Math.PI / 180);

    handleGPSPoint({
      deviceId,
      lat: curLat,
      lon: curLon,
      speed: speedKmh + (Math.random() - 0.5) * 8,
      heading: curHeading,
      altitude: 0,
      name: deviceId,
    });
  }, 1000);

  console.log(`[Server] Random movement started for: ${deviceId}`);
  res.json({ ok: true, message: deviceId + ' is now moving randomly' });
});

app.post('/api/stop-random', (req, res) => {
  const { deviceId } = req.body;
  if (randomMovers[deviceId]) {
    clearInterval(randomMovers[deviceId]);
    delete randomMovers[deviceId];
    console.log(`[Server] Random movement stopped for: ${deviceId}`);
  }
  res.json({ ok: true });
});

// ─── Socket.IO ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  const snapshot = Object.entries(liveDevices).map(([id, d]) => ({
    deviceId: id,
    lat: d.lat, lon: d.lon,
    speed: d.speed, heading: d.heading,
    name: d.name, movement: d.movement,
    lastSeen: d.lastSeen,
    trail: d.trail,
  }));
  socket.emit('snapshot', snapshot);

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ─── Startup ───────────────────────────────────────────────────────────────
async function start() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║    Real-time GPS Tracker - Starting      ║');
  console.log('╚══════════════════════════════════════════╝');

  await initDB();
  await loadGeofences(process.env.GEOSERVER_WFS_URL);

  startTCPListener(handleGPSPoint);
  startUDPListener(handleGPSPoint);

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`\n[Server] Web app running at: http://localhost:${PORT}`);
    console.log(`[Server] GPS TCP port: ${process.env.GPS_PORT || 4000}`);
    console.log(`[Server] GPS UDP port: ${(parseInt(process.env.GPS_PORT) || 4000) + 1}`);
    console.log('\n[Server] Ready! Open the web app and run the simulator.\n');
  });
}

start();