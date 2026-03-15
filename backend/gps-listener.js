// gps-listener.js - TCP/UDP GPS data receiver
// Listens on GPS_PORT for NMEA sentences from GPSFeed+ or real GPS devices
const net = require('net');
const dgram = require('dgram');
require('dotenv').config();

const GPS_PORT = parseInt(process.env.GPS_PORT) || 4000;

// NMEA sentence parser (handles the most common sentences)
function parseNMEA(sentence) {
  try {
    sentence = sentence.trim();
    if (!sentence.startsWith('$')) return null;

    const parts = sentence.split(',');
    const type = parts[0].substring(1); // e.g. 'GPGGA', 'GPRMC'

    // $GPRMC - Recommended Minimum (has speed, heading)
    // $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
    if (type === 'GPRMC' || type === 'GNRMC') {
      if (parts[2] !== 'A') return null; // 'A' = valid fix
      const lat = nmeaLatToDecimal(parts[3], parts[4]);
      const lon = nmeaLonToDecimal(parts[5], parts[6]);
      const speedKnots = parseFloat(parts[7]) || 0;
      const speedKmh = speedKnots * 1.852;
      const heading = parseFloat(parts[8]) || 0;
      if (isNaN(lat) || isNaN(lon)) return null;
      return { type: 'GPRMC', lat, lon, speed: speedKmh, heading, altitude: 0, raw: sentence };
    }

    // $GPGGA - Fix data (has altitude)
    // $GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
    if (type === 'GPGGA' || type === 'GNGGA') {
      if (parseInt(parts[6]) === 0) return null; // 0 = no fix
      const lat = nmeaLatToDecimal(parts[2], parts[3]);
      const lon = nmeaLonToDecimal(parts[4], parts[5]);
      const altitude = parseFloat(parts[9]) || 0;
      if (isNaN(lat) || isNaN(lon)) return null;
      return { type: 'GPGGA', lat, lon, speed: 0, heading: 0, altitude, raw: sentence };
    }

    return null;
  } catch (e) {
    return null;
  }
}

// Convert NMEA lat (DDDMM.MMMM) to decimal degrees
function nmeaLatToDecimal(val, dir) {
  if (!val) return NaN;
  const deg = parseFloat(val.substring(0, 2));
  const min = parseFloat(val.substring(2));
  let result = deg + min / 60;
  if (dir === 'S') result = -result;
  return result;
}

// Convert NMEA lon (DDDMM.MMMM) to decimal degrees
function nmeaLonToDecimal(val, dir) {
  if (!val) return NaN;
  const deg = parseFloat(val.substring(0, 3));
  const min = parseFloat(val.substring(3));
  let result = deg + min / 60;
  if (dir === 'W') result = -result;
  return result;
}

// Also handle plain JSON GPS format (fallback for custom simulators)
// Format: { deviceId, lat, lon, speed, heading, altitude }
function parseJSON(data) {
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

// Start TCP listener (GPSFeed+ uses TCP by default)
function startTCPListener(onPoint) {
  const server = net.createServer((socket) => {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[GPS-TCP] Device connected: ${remoteAddr}`);

    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        // Try NMEA first, then JSON
        let point = parseNMEA(line);
        if (!point) {
          const json = parseJSON(line);
          if (json?.lat !== undefined) point = json;
        }

        if (point) {
          // Use remote address as device ID if not in payload
          point.deviceId = point.deviceId || remoteAddr.replace(/[:.]/g, '_');
          onPoint(point);
        }
      }
    });

    socket.on('end', () => console.log(`[GPS-TCP] Device disconnected: ${remoteAddr}`));
    socket.on('error', (err) => console.log(`[GPS-TCP] Socket error: ${err.message}`));
  });

  server.listen(GPS_PORT, () => {
    console.log(`[GPS-TCP] Listening on port ${GPS_PORT}`);
    console.log(`[GPS-TCP] Point GPSFeed+ to this machine:${GPS_PORT}`);
  });

  server.on('error', (err) => {
    console.error(`[GPS-TCP] Server error: ${err.message}`);
  });

  return server;
}

// Start UDP listener (some devices prefer UDP)
function startUDPListener(onPoint) {
  const udpPort = GPS_PORT + 1; // UDP on GPS_PORT+1 (default 4001)
  const server = dgram.createSocket('udp4');

  server.on('message', (msg, rinfo) => {
    const data = msg.toString().trim();
    let point = parseNMEA(data);
    if (!point) {
      const json = parseJSON(data);
      if (json?.lat !== undefined) point = json;
    }
    if (point) {
      point.deviceId = point.deviceId || `udp_${rinfo.address.replace(/\./g, '_')}`;
      onPoint(point);
    }
  });

  server.bind(udpPort, () => {
    console.log(`[GPS-UDP] Listening on UDP port ${udpPort}`);
  });

  return server;
}

module.exports = { startTCPListener, startUDPListener, parseNMEA };
