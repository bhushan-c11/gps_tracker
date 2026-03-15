# GPS Trail Tracker — Setup Guide

## Project Structure
```
gps-tracker/
├── server.js          ← Main server (Express + Socket.IO)
├── gps-listener.js    ← TCP/UDP GPS receiver (reads GPSFeed+)
├── analyzer.js        ← Movement analysis (stationary/speed/geofence)
├── db.js              ← PostGIS database layer
├── gps-simulator.js   ← GPS simulator (use when GPSFeed+ unavailable)
├── schema.sql         ← Database schema (run once)
├── .env               ← Configuration
├── package.json
└── public/
    └── index.html     ← Frontend map application
```

---

## STEP 1 — Install Prerequisites

### Install Node.js (v18+)
- Download from: https://nodejs.org/
- Verify: `node --version`

### Install PostgreSQL + PostGIS
- Windows: https://postgresapp.com/ (includes PostGIS)
- Or install PostgreSQL, then enable PostGIS extension

### Create the database
```bash
psql -U postgres
CREATE DATABASE gps_tracker;
\c gps_tracker
CREATE EXTENSION postgis;
\q
```

---

## STEP 2 — Install the Project

```bash
# Clone or copy the project folder, then:
cd gps-tracker
npm install
```

---

## STEP 3 — Configure Environment

Edit `.env` file:
```env
PORT=3000
GPS_PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gps_tracker
DB_USER=postgres
DB_PASSWORD=yourpassword  ← change this!
```

If you don't have PostGIS ready yet, the app still works — 
it just won't persist data across restarts.

---

## STEP 4 — Start the Server

```bash
node server.js
```

You should see:
```
[DB] Tables ready (PostGIS enabled)
[Analyzer] Using fallback demo geofences
[GPS-TCP] Listening on port 4000
[GPS-UDP] Listening on UDP port 4001
[Server] Web app running at: http://localhost:3000
```

Open: http://localhost:3000

---

## STEP 5 — Run the Simulator (for testing)

Open a second terminal:
```bash
node gps-simulator.js
```

This simulates 3 devices moving around Chennai (or whatever city
you configured in gps-simulator.js). You'll see:
- Live markers on the map
- Trail lines growing
- Speed/status badges updating
- Alerts when a device goes fast or stays stationary

---

## STEP 6 — Connect GPSFeed+ (Hackathon day)

1. Download GPSFeed+ from: https://sourceforge.net/projects/gpsfeed/
2. Install and launch it
3. Set the output type to: **TCP Client**
4. Set the host to: **your computer's IP address** (or 127.0.0.1)
5. Set the port to: **4000**
6. Select a route/simulation and start it

The server will detect the new device and show it on the map.

To find your IP address:
- Windows: `ipconfig` → look for IPv4 Address
- Mac/Linux: `ifconfig` → look for inet

---

## STEP 7 — Connect GeoServer (Hackathon day)

When GeoServer is provided, update `.env`:
```env
GEOSERVER_URL=http://<geoserver-host>:8080/geoserver
GEOSERVER_WFS_URL=http://<geoserver-host>:8080/geoserver/wfs
```

Restart the server — it will automatically:
1. Load geofence zones from GeoServer WFS
2. Draw them on the map
3. Check all device positions against those zones
4. Alert when a device enters a restricted zone

---

## How Each File Works

### server.js
- Creates a web server on PORT 3000
- Opens a GPS listener on TCP port 4000 (and UDP 4001)
- When a GPS point arrives:
  1. Updates in-memory state for that device
  2. Saves to PostGIS database
  3. Runs movement analysis
  4. Broadcasts update to all browser clients via Socket.IO

### gps-listener.js
- Listens for connections on port 4000
- Parses NMEA sentences (standard GPS format) like:
  `$GPRMC,123519,A,1305.000,N,08016.000,E,022.4,084.4,230394,,*6A`
- Also accepts simple JSON: `{"deviceId":"truck1","lat":13.08,"lon":80.27,"speed":45}`

### analyzer.js
- Tracks each device's state in memory
- Stationary: device hasn't moved >5m in 30+ seconds
- Fast: speed > 80 km/h
- Slow: speed < 10 km/h
- Geofence: point is inside a restricted circle or polygon

### db.js
- Uses PostgreSQL + PostGIS for spatial storage
- Stores every GPS point as a geometry
- Enables PostGIS spatial queries (distance, containment, etc.)

### public/index.html
- Leaflet.js map with dark CartoDB tiles
- Connects to server via Socket.IO WebSocket
- Receives real-time position updates → moves markers
- Receives alerts → shows toast notifications + logs panel
- Sidebar with Devices / Alerts / Insights tabs

---

## Alert Types

| Alert | Trigger | Severity |
|-------|---------|---------|
| Stationary | Device stopped > 30s | Warning |
| Fast moving | Speed > 80 km/h | Danger |
| Geofence entry | Inside restricted zone | Danger |

Modify thresholds in `.env`:
```
STATIONARY_TIMEOUT_SECONDS=30
FAST_SPEED_KMH=80
```

---

## Troubleshooting

**Map shows "Waiting for GPS devices..."**
→ Run `node gps-simulator.js` in another terminal

**DB connection error**
→ The app still works! Trails are stored in memory.
→ Check your DB_PASSWORD in .env

**Port 4000 already in use**
→ Change GPS_PORT=4005 in .env and restart both server + simulator

**GPSFeed+ not connecting**
→ Check Windows Firewall — allow Node.js on port 4000
→ Check the IP address is correct

---

## Quick Commands Reference

```bash
# Start server
node server.js

# Start GPS simulator (separate terminal)
node gps-simulator.js

# Run both in development mode (auto-restart)
npm run dev   # starts server with nodemon

# Check DB
psql -U postgres -d gps_tracker -c "SELECT COUNT(*) FROM gps_points;"
```
