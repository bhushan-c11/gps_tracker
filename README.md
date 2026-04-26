# GPS trail tracker real time geospatial intelligence engine

> A production-grade, real-time GPS tracking and geospatial analytics system built to simulate logistics, fleet monitoring, and smart-city intelligence use cases.

---

## 🧠 Overview

GPS Trail Tracker is not just a map visualizer — it is a **real-time geospatial processing system** that ingests live GPS streams, performs movement analysis, detects anomalies, and visualizes insights instantly.

It is designed to reflect **real-world backend + systems engineering skills**:
- Streaming data ingestion
- Spatial databases (PostGIS)
- Event-driven architecture
- Real-time WebSocket communication
- Geofence intelligence

---

## 🎯 Key Capabilities

- 📡 Real-time GPS ingestion (TCP/UDP)
- 🗺️ Live tracking with dynamic trails
- ⚡ Movement intelligence (speed, stationary detection)
- 🚨 Geofence breach detection
- 🔁 Event-driven updates via WebSockets
- 🧠 Spatial analytics using PostGIS
- 🧪 Built-in GPS simulator for testing

---

## 🏗️ Architecture

    GPS Devices / Simulator
             ↓
     gps-listener.js
  (TCP/UDP ingestion layer)
             ↓
       analyzer.js
 (movement intelligence engine)
             ↓
         db.js

(PostgreSQL + PostGIS storage)
↓
server.js
(Express + Socket.IO server)
↓
Frontend (Leaflet)
(Real-time visualization UI)


---

## 📁 Project Structure


gps-tracker/
├── server.js
├── gps-listener.js
├── analyzer.js
├── db.js
├── gps-simulator.js
├── schema.sql
├── .env
├── package.json
└── public/
└── index.html


---

## ⚙️ Prerequisites

### 1. Install Node.js (v18+)
https://nodejs.org/

```bash
node --version
2. Install PostgreSQL + PostGIS
psql -U postgres
CREATE DATABASE gps_tracker;
\c gps_tracker
CREATE EXTENSION postgis;
\q
📦 Installation
git clone <your-repo-url>
cd gps-tracker
npm install
🔐 Environment Configuration

Create .env:

PORT=3000
GPS_PORT=4000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=gps_tracker
DB_USER=postgres
DB_PASSWORD=yourpassword

STATIONARY_TIMEOUT_SECONDS=30
FAST_SPEED_KMH=80
▶️ Running the System
Start Server
node server.js

Expected output:

[DB] Tables ready (PostGIS enabled)
[GPS-TCP] Listening on port 4000
[GPS-UDP] Listening on port 4001
[Server] Running at http://localhost:3000
Run GPS Simulator (for testing)
node gps-simulator.js
🌐 Open Application
http://localhost:3000
📡 GPS Input Support
NMEA Format
$GPRMC,123519,A,1305.000,N,08016.000,E,022.4,084.4,230394,,*6A
JSON Format
{
  "deviceId": "truck1",
  "lat": 13.08,
  "lon": 80.27,
  "speed": 45
}
🧠 Movement Intelligence Engine
Condition	Logic
Stationary	No movement > 5m for 30 sec
Fast	Speed > 80 km/h
Slow	Speed < 10 km/h
Geofence	Inside restricted region
🚨 Alert System
Alert Type	Trigger Condition
Stationary Alert	Idle > threshold
Speed Alert	Exceeds speed limit
Geofence Alert	Enters restricted zone
🗺️ Frontend Features
Real-time marker updates
Trail path rendering
Alert notifications
Device monitoring panel
Insight dashboard
🧩 Module Breakdown
server.js
Express server + WebSocket layer
Broadcasts live GPS updates
gps-listener.js
TCP/UDP ingestion
Parses GPS/NMEA data
analyzer.js
Core intelligence engine
Detects movement patterns & anomalies
db.js
Handles PostGIS queries
Stores spatial data
gps-simulator.js
Simulates moving GPS devices
public/index.html
Leaflet-based UI
Real-time visualization
🧪 Development Commands
# Start server
node server.js

# Start simulator
node gps-simulator.js

# Dev mode (auto restart)
npm run dev

# Check DB records
psql -U postgres -d gps_tracker -c "SELECT COUNT(*) FROM gps_points;"
🔧 Troubleshooting
No devices visible

→ Run simulator

DB connection fails

→ App still works (in-memory mode)

Port conflict

→ Change GPS_PORT in .env

GPSFeed not connecting

→ Check firewall / IP address

🌍 Real-World Applications
Fleet management systems
Logistics optimization
Smart city monitoring
Emergency response tracking
Ride-sharing analytics
🚀 Future Enhancements
Kafka-based streaming pipeline
AI-based route prediction
Heatmaps & traffic analytics
Mobile app integration
Cloud deployment (AWS/GCP)
