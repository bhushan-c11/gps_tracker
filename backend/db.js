// db.js - PostGIS database connection and queries
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'gps_tracker',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'yourpassword',
});

// Initialize database tables (run once on startup)
async function initDB() {
  try {
    const client = await pool.connect();
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS devices (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100),
          created_at TIMESTAMP DEFAULT NOW(),
          last_seen TIMESTAMP
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gps_points (
          id SERIAL PRIMARY KEY,
          device_id VARCHAR(50) REFERENCES devices(id),
          latitude DOUBLE PRECISION NOT NULL,
          longitude DOUBLE PRECISION NOT NULL,
          speed DOUBLE PRECISION DEFAULT 0,
          heading DOUBLE PRECISION DEFAULT 0,
          altitude DOUBLE PRECISION DEFAULT 0,
          timestamp TIMESTAMP DEFAULT NOW(),
          geom GEOMETRY(POINT, 4326)
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS gps_points_geom_idx ON gps_points USING GIST (geom);`);
      await client.query(`CREATE INDEX IF NOT EXISTS gps_points_device_time_idx ON gps_points (device_id, timestamp DESC);`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          device_id VARCHAR(50),
          alert_type VARCHAR(50),
          message TEXT,
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          timestamp TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log('[DB] Tables ready (PostGIS enabled)');
    } finally {
      client.release();
    }
  } catch (err) {
    console.log('[DB] Running without database - data will not persist');
    console.log('[DB] Reason:', err.message);
  }
}
// Insert a single GPS point into PostGIS
async function insertPoint(deviceId, lat, lon, speed, heading, altitude) {
  try {
    // Upsert device (insert if not exists, update last_seen)
    await pool.query(`
      INSERT INTO devices (id, name, last_seen)
      VALUES ($1, $1, NOW())
      ON CONFLICT (id) DO UPDATE SET last_seen = NOW();
    `, [deviceId]);

    // Insert the GPS point with PostGIS geometry
    const result = await pool.query(`
      INSERT INTO gps_points (device_id, latitude, longitude, speed, heading, altitude, geom)
      VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($3, $2), 4326))
      RETURNING id, timestamp;
    `, [deviceId, lat, lon, speed || 0, heading || 0, altitude || 0]);

    return result.rows[0];
  } catch (err) {
    // DB not available — silently skip (app still works in memory)
    return null;
  }
}

// Get the full trail for a device (last N points)
async function getTrail(deviceId, limit = 500) {
  try {
    const result = await pool.query(`
      SELECT latitude, longitude, speed, heading, timestamp
      FROM gps_points
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT $2;
    `, [deviceId, limit]);
    return result.rows.reverse(); // oldest first for polyline drawing
  } catch (err) {
    return [];
  }
}

// Get all devices with their latest position
async function getDevices() {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (d.id)
        d.id, d.name, d.last_seen,
        p.latitude, p.longitude, p.speed, p.heading, p.timestamp
      FROM devices d
      LEFT JOIN gps_points p ON p.device_id = d.id
      ORDER BY d.id, p.timestamp DESC;
    `);
    return result.rows;
  } catch (err) {
    return [];
  }
}

// Save an alert to the database
async function saveAlert(deviceId, alertType, message, lat, lon) {
  try {
    await pool.query(`
      INSERT INTO alerts (device_id, alert_type, message, latitude, longitude)
      VALUES ($1, $2, $3, $4, $5);
    `, [deviceId, alertType, message, lat, lon]);
  } catch (err) {
    // Silent fail - alerts still emitted via Socket.IO
  }
}

// Get recent alerts
async function getAlerts(limit = 50) {
  try {
    const result = await pool.query(`
      SELECT * FROM alerts ORDER BY timestamp DESC LIMIT $1;
    `, [limit]);
    return result.rows;
  } catch (err) {
    return [];
  }
}

module.exports = { initDB, insertPoint, getTrail, getDevices, saveAlert, getAlerts, pool };
