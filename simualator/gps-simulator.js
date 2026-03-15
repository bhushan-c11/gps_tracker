// gps-simulator.js - Standalone GPS data simulator
// Run with: node gps-simulator.js
// Simulates multiple devices moving on realistic paths
const net = require('net');
require('dotenv').config();

const GPS_PORT = parseInt(process.env.GPS_PORT) || 4000;
const SERVER_HOST = process.env.SERVER_HOST || '127.0.0.1';

// Define device routes (lat/lon waypoints)
// Change these to coordinates in your city
const DEVICES = [
  {
    id: 'device_001',
    name: 'Truck Alpha',
    color: '#3498db',
    speed: 40,       // base speed km/h
    // Chennai route: Marina Beach → T.Nagar → Velachery
    waypoints: [
      [13.0500, 80.2824],
      [13.0600, 80.2700],
      [13.0700, 80.2600],
      [13.0620, 80.2200],
      [13.0050, 80.2208],
      [13.0827, 80.2707], // back to start
    ],
  },
  {
    id: 'device_002',
    name: 'Bike Beta',
    color: '#e74c3c',
    speed: 25,
    waypoints: [
      [13.0827, 80.2707],
      [13.0900, 80.2800],
      [13.0980, 80.2750],
      [13.0950, 80.2600],
      [13.0827, 80.2707],
    ],
  },
  {
    id: 'device_003',
    name: 'Van Gamma',
    color: '#2ecc71',
    speed: 60,   // will trigger fast-speed alert
    waypoints: [
      [13.0700, 80.2300],
      [13.0800, 80.2400],
      [13.0900, 80.2500],
      [13.0700, 80.2300],
    ],
  },
];

// Interpolate points between two waypoints
function interpolate(p1, p2, steps) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push([
      p1[0] + (p2[0] - p1[0]) * t,
      p1[1] + (p2[1] - p1[1]) * t,
    ]);
  }
  return points;
}

// Convert decimal lat to NMEA format (DDMM.MMMM)
function toNMEALat(lat) {
  const absLat = Math.abs(lat);
  const deg = Math.floor(absLat);
  const min = (absLat - deg) * 60;
  return `${String(deg).padStart(2, '0')}${min.toFixed(4)},${lat >= 0 ? 'N' : 'S'}`;
}

// Convert decimal lon to NMEA format (DDDMM.MMMM)
function toNMEALon(lon) {
  const absLon = Math.abs(lon);
  const deg = Math.floor(absLon);
  const min = (absLon - deg) * 60;
  return `${String(deg).padStart(3, '0')}${min.toFixed(4)},${lon >= 0 ? 'E' : 'W'}`;
}

// Build GPRMC NMEA sentence
function buildGPRMC(lat, lon, speedKmh, heading) {
  const now = new Date();
  const time = `${String(now.getUTCHours()).padStart(2,'0')}${String(now.getUTCMinutes()).padStart(2,'0')}${String(now.getUTCSeconds()).padStart(2,'0')}.00`;
  const date = `${String(now.getUTCDate()).padStart(2,'0')}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCFullYear()).slice(2)}`;
  const speedKnots = (speedKmh / 1.852).toFixed(1);
  const hdg = heading.toFixed(1);
  const body = `GPRMC,${time},A,${toNMEALat(lat)},${toNMEALon(lon)},${speedKnots},${hdg},${date},,`;
  // Checksum
  let cs = 0;
  for (const c of body) cs ^= c.charCodeAt(0);
  return `$${body}*${cs.toString(16).toUpperCase().padStart(2,'0')}\r\n`;
}

// Calculate heading between two points
function calcHeading(p1, p2) {
  const dLon = p2[1] - p1[1];
  const dLat = p2[0] - p1[0];
  const angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
  return (angle + 360) % 360;
}

// Start simulation for all devices, connecting to the main server
class DeviceSimulator {
  constructor(device) {
    this.device = device;
    this.waypointIdx = 0;
    this.pointIdx = 0;
    this.currentPath = [];
    this.socket = null;
    this.connected = false;
    this.generateNextSegment();
  }

  generateNextSegment() {
    const { waypoints } = this.device;
    const from = waypoints[this.waypointIdx];
    const to = waypoints[(this.waypointIdx + 1) % waypoints.length];
    this.waypointIdx = (this.waypointIdx + 1) % waypoints.length;
    // Steps based on distance (more steps = smoother movement)
    const dist = Math.sqrt((to[0]-from[0])**2 + (to[1]-from[1])**2);
    const steps = Math.max(20, Math.round(dist * 5000));
    this.currentPath = interpolate(from, to, steps);
    this.heading = calcHeading(from, to);
    this.pointIdx = 0;
  }

  connect() {
    this.socket = new net.Socket();
    this.socket.connect(GPS_PORT, SERVER_HOST, () => {
      this.connected = true;
      console.log(`[SIM] ${this.device.name} connected to server`);
    });
    this.socket.on('error', () => {
      this.connected = false;
      setTimeout(() => this.connect(), 3000);
    });
    this.socket.on('close', () => {
      this.connected = false;
      setTimeout(() => this.connect(), 3000);
    });
  }

  sendPoint() {
    if (!this.connected || !this.socket) return;

    if (this.pointIdx >= this.currentPath.length) {
      this.generateNextSegment();
    }

    const [lat, lon] = this.currentPath[this.pointIdx++];
    // Add some noise to simulate real GPS jitter
    const noiseLat = lat + (Math.random() - 0.5) * 0.00005;
    const noiseLon = lon + (Math.random() - 0.5) * 0.00005;

    // Vary speed slightly
    const speedVariation = this.device.speed * (0.85 + Math.random() * 0.3);

    // Send JSON format (simpler to parse, also works with our listener)
    const payload = JSON.stringify({
      deviceId: this.device.id,
      name: this.device.name,
      lat: noiseLat,
      lon: noiseLon,
      speed: speedVariation,
      heading: this.heading,
      altitude: 10 + Math.random() * 5,
    }) + '\n';

    try {
      this.socket.write(payload);
    } catch (e) {
      this.connected = false;
    }
  }
}

// Main
console.log('╔══════════════════════════════════════════╗');
console.log('║       GPS Simulator - Starting up        ║');
console.log(`║  Targeting: ${SERVER_HOST}:${GPS_PORT}             ║`);
console.log('╚══════════════════════════════════════════╝');

const simulators = DEVICES.map(d => {
  const sim = new DeviceSimulator(d);
  sim.connect();
  return sim;
});

// Send GPS points every 1 second for each device
setInterval(() => {
  simulators.forEach(sim => sim.sendPoint());
}, 1000);

// Occasionally pause device_001 to trigger stationary alert
let pauseCount = 0;
setInterval(() => {
  pauseCount++;
  if (pauseCount % 3 === 0) {
    console.log('[SIM] Pausing device_001 to simulate stationary...');
    const sim001 = simulators[0];
    const wasConnected = sim001.connected;
    // Stop advancing the point index for 40 seconds
    const origSend = sim001.sendPoint.bind(sim001);
    sim001.sendPoint = () => {
      if (wasConnected && sim001.socket) {
        const [lat, lon] = sim001.currentPath[Math.max(0, sim001.pointIdx - 1)];
        const payload = JSON.stringify({ deviceId: sim001.device.id, lat, lon, speed: 0, heading: 0 }) + '\n';
        try { sim001.socket.write(payload); } catch (e) {}
      }
    };
    setTimeout(() => { sim001.sendPoint = origSend; }, 40000);
  }
}, 60000);

console.log('[SIM] Sending GPS data every 1 second. Press Ctrl+C to stop.');
