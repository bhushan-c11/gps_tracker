// analyzer.js - Smart Movement Analysis Engine
require('dotenv').config();

const STATIONARY_TIMEOUT = (process.env.STATIONARY_TIMEOUT_SECONDS || 30) * 1000; // ms
const FAST_SPEED = parseFloat(process.env.FAST_SPEED_KMH) || 80;   // km/h
const SLOW_SPEED = parseFloat(process.env.SLOW_SPEED_KMH) || 10;   // km/h

// In-memory state per device
// deviceState[deviceId] = { lastLat, lastLon, lastMoveTime, lastSpeed, stationaryAlerted }
const deviceState = {};

// Geofences loaded from GeoServer or defined locally as fallback
// Format: { id, name, type: 'circle'|'polygon', ...coords, color }
let geofences = [];

// Load geofences from GeoServer WFS on startup
async function loadGeofences(geoserverWfsUrl) {
  try {
    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
    const url = `${geoserverWfsUrl}?service=WFS&version=1.1.0&request=GetFeature&typeName=restricted_zones&outputFormat=application/json`;
    const res = await fetch(url, { timeout: 5000 });
    const data = await res.json();
    geofences = data.features.map((f, i) => ({
      id: f.id || `zone_${i}`,
      name: f.properties?.name || `Zone ${i + 1}`,
      type: 'geojson',
      geometry: f.geometry,
      color: '#e74c3c',
    }));
    console.log(`[Analyzer] Loaded ${geofences.length} geofences from GeoServer`);
  } catch (err) {
    // GeoServer not available — use demo geofences
    console.log('[Analyzer] Using fallback demo geofences');
    geofences = getDemoGeofences();
  }
  return geofences;
}

// Demo geofences for testing without GeoServer
function getDemoGeofences() {
  return [
    {
      id: 'zone_1',
      name: 'Restricted Zone A',
      type: 'circle',
      lat: 13.0827,
      lon: 80.2707,
      radiusKm: 0.5,
      color: '#e74c3c',
    },
    {
      id: 'zone_2',
      name: 'Safe Zone',
      type: 'polygon',
      coords: [
        [13.0750, 80.2600],
        [13.0750, 80.2800],
        [13.0900, 80.2800],
        [13.0900, 80.2600],
      ],
      color: '#3498db',
    },
    {
      id: 'zone_3',
      name: 'Industrial Zone',
      type: 'circle',
      lat: 13.0650,
      lon: 80.2900,
      radiusKm: 0.8,
      color: '#f39c12',
    },
    {
      id: 'zone_4',
      name: 'Military Zone',
      type: 'polygon',
      coords: [
        [13.1000, 80.2500],
        [13.1000, 80.2700],
        [13.1150, 80.2700],
        [13.1150, 80.2500],
      ],
      color: '#9b59b6',
    },
  ];
}
// Haversine distance between two lat/lon points (returns km)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg) { return deg * Math.PI / 180; }

// Point-in-polygon test (ray casting algorithm)
function pointInPolygon(lat, lon, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [yi, xi] = coords[i];
    const [yj, xj] = coords[j];
    const intersect = ((xi > lon) !== (xj > lon)) &&
      (lat < (yj - yi) * (lon - xi) / (xj - xi) + yi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Check if a point violates any geofence
function checkGeofences(lat, lon) {
  const violations = [];
  for (const zone of geofences) {
    let inside = false;
    if (zone.type === 'circle') {
      inside = haversineKm(lat, lon, zone.lat, zone.lon) <= zone.radiusKm;
    } else if (zone.type === 'polygon') {
      inside = pointInPolygon(lat, lon, zone.coords);
    } else if (zone.type === 'geojson') {
      // For GeoJSON polygon from GeoServer
      if (zone.geometry?.type === 'Polygon') {
        inside = pointInPolygon(lat, lon, zone.geometry.coordinates[0].map(c => [c[1], c[0]]));
      }
    }
    if (inside) violations.push(zone);
  }
  return violations;
}

// Main analysis function — called for every incoming GPS point
// Returns an array of alert objects (may be empty)
function analyzePoint(deviceId, lat, lon, speed, timestamp) {
  const alerts = [];
  const now = Date.now();

  if (!deviceState[deviceId]) {
    deviceState[deviceId] = {
      lastLat: lat, lastLon: lon,
      lastMoveTime: now,
      lastSpeed: speed,
      stationaryAlerted: false,
      inZones: new Set(),
    };
    return alerts; // Not enough history yet
  }

  const state = deviceState[deviceId];
  const distKm = haversineKm(state.lastLat, state.lastLon, lat, lon);
  const movedSignificantly = distKm > 0.005; // 5 meters threshold

  // ── Stationary detection ──────────────────────────────────────────────────
  if (movedSignificantly) {
    state.lastMoveTime = now;
    state.stationaryAlerted = false;
  } else {
    const stoppedMs = now - state.lastMoveTime;
    if (stoppedMs >= STATIONARY_TIMEOUT && !state.stationaryAlerted) {
      state.stationaryAlerted = true;
      alerts.push({
        type: 'stationary',
        severity: 'warning',
        message: `Device ${deviceId} has been stationary for ${Math.round(stoppedMs / 1000)}s`,
        lat, lon,
      });
    }
  }

  // ── Speed analysis ────────────────────────────────────────────────────────
  const speedKmh = speed; // already in km/h from NMEA parser
  if (speedKmh > FAST_SPEED) {
    alerts.push({
      type: 'fast',
      severity: 'danger',
      message: `Device ${deviceId} is moving fast: ${speedKmh.toFixed(1)} km/h`,
      lat, lon,
    });
  }

  // ── Geofence violation ────────────────────────────────────────────────────
  const violations = checkGeofences(lat, lon);
  for (const zone of violations) {
    if (!state.inZones.has(zone.id)) {
      state.inZones.add(zone.id);
      alerts.push({
        type: 'geofence',
        severity: 'danger',
        message: `Device ${deviceId} entered restricted zone: ${zone.name}`,
        zoneName: zone.name,
        lat, lon,
      });
    }
  }
  // Clear zones device has left
  for (const zoneId of state.inZones) {
    if (!violations.find(z => z.id === zoneId)) {
      state.inZones.delete(zoneId);
    }
  }

  // ── Update state ─────────────────────────────────────────────────────────
  if (movedSignificantly) {
    state.lastLat = lat;
    state.lastLon = lon;
  }
  state.lastSpeed = speedKmh;

  return alerts;
}

// Return movement category string for UI display
function getMovementCategory(speed) {
  if (speed < 1)        return { label: 'Stationary', color: '#e74c3c', icon: '⬤' };
  if (speed < SLOW_SPEED) return { label: 'Slow',       color: '#f39c12', icon: '▶' };
  if (speed < FAST_SPEED) return { label: 'Normal',     color: '#27ae60', icon: '▶▶' };
  return                       { label: 'Fast',         color: '#8e44ad', icon: '▶▶▶' };
}

function getGeofences() { return geofences; }
function getDeviceState(deviceId) { return deviceState[deviceId] || null; }

module.exports = {
  loadGeofences,
  getDemoGeofences,
  analyzePoint,
  getMovementCategory,
  getGeofences,
  getDeviceState,
};
