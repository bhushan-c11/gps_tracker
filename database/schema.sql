-- schema.sql — Run this manually in psql to set up PostGIS
-- Usage: psql -U postgres -d gps_tracker -f schema.sql

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Devices
CREATE TABLE IF NOT EXISTS devices (
  id        VARCHAR(50) PRIMARY KEY,
  name      VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen  TIMESTAMP
);

-- GPS trail points
CREATE TABLE IF NOT EXISTS gps_points (
  id         SERIAL PRIMARY KEY,
  device_id  VARCHAR(50) REFERENCES devices(id),
  latitude   DOUBLE PRECISION NOT NULL,
  longitude  DOUBLE PRECISION NOT NULL,
  speed      DOUBLE PRECISION DEFAULT 0,
  heading    DOUBLE PRECISION DEFAULT 0,
  altitude   DOUBLE PRECISION DEFAULT 0,
  timestamp  TIMESTAMP DEFAULT NOW(),
  geom       GEOMETRY(POINT, 4326)
);

CREATE INDEX IF NOT EXISTS gps_points_geom_idx        ON gps_points USING GIST (geom);
CREATE INDEX IF NOT EXISTS gps_points_device_time_idx ON gps_points (device_id, timestamp DESC);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id         SERIAL PRIMARY KEY,
  device_id  VARCHAR(50),
  alert_type VARCHAR(50),
  message    TEXT,
  latitude   DOUBLE PRECISION,
  longitude  DOUBLE PRECISION,
  timestamp  TIMESTAMP DEFAULT NOW()
);

-- Useful queries for PostGIS analysis:

-- Distance traveled by a device (meters)
-- SELECT ST_Length(ST_MakeLine(geom ORDER BY timestamp)::geography)
-- FROM gps_points WHERE device_id = 'device_001';

-- Latest position of all devices
-- SELECT DISTINCT ON (device_id) device_id, latitude, longitude, speed, timestamp
-- FROM gps_points ORDER BY device_id, timestamp DESC;

-- Points inside a radius (e.g. 500m from a location)
-- SELECT * FROM gps_points
-- WHERE ST_DWithin(geom::geography, ST_MakePoint(80.2707,13.0827)::geography, 500);
