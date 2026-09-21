const map = L.map("map").setView([28.6145, 77.2098], 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const markers = {}; // camera_id -> L.marker
let activeCameraList = [];
const cameraTimers = {}; // camera_id -> timer
const COLORS = { LOW: "#10b981", MEDIUM: "#f59e0b", HIGH: "#ef4444" };
let totalIncidentsCount = 0;

function bandFor(score) {
  if (score > 50) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

// Build 4 simultaneous camera streams in the surveillance grid
function renderCameraGrid(cameras) {
  const grid = document.getElementById("camera-grid");
  grid.innerHTML = "";
  activeCameraList = cameras;

  cameras.forEach((cam, idx) => {
    const card = document.createElement("div");
    card.className = "camera-card";
    card.id = `card-${cam.id}`;

    card.innerHTML = `
      <div class="camera-card-header">
        <div class="cam-title-wrap">
          <span class="cam-live-indicator"></span>
          <span class="cam-name">${cam.name}</span>
        </div>
        <span class="cam-meta">${cam.id.toUpperCase()}</span>
      </div>
      <div class="feed-container">
        <img id="feed-${cam.id}" class="cam-stream-img" alt="${cam.name}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%230b0f19'/%3E%3C/svg%3E" />
        <div class="feed-overlay-hud">
          <span class="hud-id">CH-0${idx + 1}</span>
          <span class="hud-fps" id="fps-${cam.id}">LIVE</span>
        </div>
        <div class="feed-status-banner" id="banner-${cam.id}">Monitoring active zone</div>
      </div>
    `;

    grid.appendChild(card);
    startStreamLoop(cam.id);
  });

  const camStat = document.getElementById("stat-cameras");
  if (camStat) camStat.textContent = `${cameras.length} / 4`;
}

// WebSocket-based binary frame streaming for each camera
function startStreamLoop(camId) {
  if (cameraTimers[camId]) {
    clearTimeout(cameraTimers[camId]);
    cameraTimers[camId] = null;
  }

  let frameCount = 0;
  let lastFrameTime = Date.now();
  let prevObjectUrl = null;

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/stream/${camId}`);
  ws.binaryType = "blob";

  ws.onmessage = (evt) => {
    if (!(evt.data instanceof Blob)) return;

    const url = URL.createObjectURL(evt.data);
    const feedEl = document.getElementById(`feed-${camId}`);
    if (feedEl) {
      feedEl.src = url;
    }

    // Revoke previous object URL to prevent memory leaks
    if (prevObjectUrl) URL.revokeObjectURL(prevObjectUrl);
    prevObjectUrl = url;

    // FPS counter
    frameCount++;
    const now = Date.now();
    if (now - lastFrameTime >= 1000) {
      const fpsEl = document.getElementById(`fps-${camId}`);
      if (fpsEl) fpsEl.textContent = `${frameCount} FPS`;
      frameCount = 0;
      lastFrameTime = now;
    }
  };

  ws.onclose = () => {
    // Fallback: reconnect after a short delay
    cameraTimers[camId] = setTimeout(() => startStreamLoop(camId), 1000);
  };

  ws.onerror = () => {
    ws.close();
  };

  // Store WS reference for cleanup
  cameraTimers[camId] = ws;
}

async function loadCameras() {
  try {
    const cams = await fetch("/cameras").then(r => r.json());
    if (Array.isArray(cams) && cams.length > 0) {
      renderCameraGrid(cams);

      cams.forEach(cam => {
        if (!markers[cam.id]) {
          const marker = L.circleMarker([cam.lat, cam.lon], {
            radius: 9,
            color: COLORS.LOW,
            fillColor: COLORS.LOW,
            fillOpacity: 0.85,
            weight: 2,
          }).addTo(map).bindTooltip(`<strong>${cam.name}</strong><br>Status: ONLINE`, { className: 'map-tooltip' });
          markers[cam.id] = marker;
        }
      });
    }
  } catch (err) {
    console.error("Failed loading cameras:", err);
  }
}

async function loadHistory() {
  try {
    const [eventsRes, incidentsRes] = await Promise.all([
      fetch("/events").then(r => r.json()).catch(() => []),
      fetch("/incidents").then(r => r.json()).catch(() => [])
    ]);

    const tbody = document.querySelector("#event-table tbody");
    tbody.innerHTML = "";

    const combined = [];
    if (Array.isArray(eventsRes)) {
      eventsRes.forEach(ev => combined.push({
        id: ev.id,
        camera_id: ev.camera_id,
        object_class: ev.object_class,
        score: ev.score,
        breakdown: ev.breakdown,
        started_at: ev.started_at,
        evidence_path: ev.evidence_path
      }));
    }
    if (Array.isArray(incidentsRes)) {
      incidentsRes.forEach(inc => combined.push({
        id: inc.id || inc.incident_id,
        camera_id: inc.camera_id,
        object_class: inc.object_class,
        score: inc.risk_score,
        severity: inc.severity,
        breakdown: inc.reasons,
        started_at: inc.created_at,
        evidence_path: inc.evidence_path
      }));
    }

    combined.sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

    if (combined.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 1.25rem;">No incidents recorded yet. 4 cameras active...</td></tr>`;
    } else {
      totalIncidentsCount = combined.length;
      updateIncidentStats();
      combined.slice(-50).forEach(ev => addHistoryRow(ev));
    }
  } catch (err) {
    console.error("Failed loading event history:", err);
  }
}

function updateIncidentStats() {
  const statEl = document.getElementById("stat-incidents");
  if (statEl) statEl.textContent = `${totalIncidentsCount}`;
  const counterEl = document.getElementById("alert-counter");
  if (counterEl) counterEl.textContent = `${totalIncidentsCount} Alerts`;
}

function addHistoryRow(ev) {
  const tbody = document.querySelector("#event-table tbody");
  if (!tbody) return;

  const emptyRow = tbody.querySelector("td[colspan]");
  if (emptyRow) tbody.innerHTML = "";

  const row = document.createElement("tr");
  const evidenceCell = ev.evidence_path
    ? `<a href="/evidence/${ev.id}.mp4" target="_blank">▶ Clip</a>`
    : "-";

  const breakdownText = Array.isArray(ev.breakdown) ? ev.breakdown.join(", ") : (ev.reasons ? ev.reasons.join(", ") : "");
  const scoreVal = ev.score !== undefined ? ev.score : ev.risk_score;
  const band = ev.severity || bandFor(scoreVal);

  row.innerHTML = `
    <td>${new Date(ev.started_at || ev.created_at).toLocaleTimeString()}</td>
    <td><strong>${ev.camera_id}</strong></td>
    <td><span class="badge badge-${band.toLowerCase()}">${ev.object_class || "person"}</span></td>
    <td><strong>${scoreVal}</strong> <span class="reasons">(${breakdownText})</span></td>
    <td>${evidenceCell}</td>
  `;
  tbody.prepend(row);
}

function addAlert(ev) {
  const scoreVal = ev.score !== undefined ? ev.score : ev.risk_score;
  const band = ev.severity || bandFor(scoreVal);
  const breakdownText = Array.isArray(ev.breakdown) ? ev.breakdown.join(", ") : (ev.reasons ? ev.reasons.join(", ") : "");
  const alertList = document.getElementById("alert-list");

  totalIncidentsCount++;
  updateIncidentStats();

  const emptyState = alertList.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const li = document.createElement("li");
  li.className = band;
  li.innerHTML = `
    <strong>[${band}]</strong> <span>${ev.camera_id}</span> • <span>${ev.track_id}</span> (${ev.object_class}) — <span class="score-pill">${scoreVal} pts</span>
    <div class="alert-desc">${breakdownText}</div>
  `;
  alertList.prepend(li);

  while (alertList.children.length > 50) {
    alertList.removeChild(alertList.lastChild);
  }

  // Flash highlight on the corresponding camera card in the 4-camera grid
  const card = document.getElementById(`card-${ev.camera_id}`);
  if (card && band === "HIGH") {
    card.classList.add("alert-high");
    setTimeout(() => card.classList.remove("alert-high"), 3500);
  }

  const marker = markers[ev.camera_id];
  if (marker) {
    marker.setStyle({ color: COLORS[band], fillColor: COLORS[band] });
  }
}

function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/live`);

  ws.onopen = () => {
    const st = document.getElementById("status");
    if (st) {
      st.textContent = "● SURVEILLANCE LIVE";
      st.style.color = "#10b981";
      st.style.borderColor = "rgba(16, 185, 129, 0.4)";
    }
  };

  ws.onclose = () => {
    const st = document.getElementById("status");
    if (st) {
      st.textContent = "○ RECONNECTING...";
      st.style.color = "#f59e0b";
      st.style.borderColor = "rgba(245, 158, 11, 0.4)";
    }
    setTimeout(connectWS, 2000);
  };

  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === "event") {
        addAlert(data);
        addHistoryRow({
          id: data.event_id,
          camera_id: data.camera_id,
          object_class: data.object_class,
          score: data.score,
          breakdown: data.breakdown,
          started_at: new Date().toISOString(),
          evidence_path: true,
        });
      } else if (data.type === "incident_created") {
        const inc = data.data;
        addAlert(inc);
        addHistoryRow({
          id: inc.incident_id,
          camera_id: inc.camera_id,
          object_class: inc.object_class,
          score: inc.risk_score,
          severity: inc.severity,
          breakdown: inc.reasons,
          started_at: inc.created_at,
          evidence_path: true,
        });
      } else if (data.type === "anpr_detection") {
        addANPRRow(data.data);
      }
    } catch (e) {
      console.error("WS message parse error:", e);
    }
  };
}

// --- ANPR Functions ---

let anprCount = 0;

function addANPRRow(det) {
  const tbody = document.querySelector("#anpr-table tbody");
  if (!tbody) return;

  const emptyRow = tbody.querySelector("td[colspan]");
  if (emptyRow) tbody.innerHTML = "";

  anprCount++;
  const counterEl = document.getElementById("anpr-counter");
  if (counterEl) counterEl.textContent = `${anprCount} Plates`;

  const row = document.createElement("tr");
  const time = det.timestamp ? new Date(det.timestamp).toLocaleTimeString() : "-";
  const confPct = det.ocr_confidence !== undefined ? `${(det.ocr_confidence * 100).toFixed(0)}%` : "-";
  const statusClass = det.validation_status === "VALID" ? "badge-low"
    : det.validation_status === "PARTIAL" ? "badge-medium" : "badge-high";

  row.innerHTML = `
    <td>${time}</td>
    <td><strong>${det.camera_id || "-"}</strong></td>
    <td class="mono">${det.track_id || "-"}</td>
    <td>${det.vehicle_type || "vehicle"}</td>
    <td><span class="plate-badge">${det.plate_number || "-"}</span></td>
    <td>${confPct}</td>
    <td><span class="badge ${statusClass}">${det.validation_status || "-"}</span></td>
  `;
  tbody.prepend(row);

  while (tbody.children.length > 50) {
    tbody.removeChild(tbody.lastChild);
  }
}

async function loadANPR() {
  try {
    const detections = await fetch("/anpr").then(r => r.json()).catch(() => []);
    if (Array.isArray(detections) && detections.length > 0) {
      anprCount = detections.length;
      const counterEl = document.getElementById("anpr-counter");
      if (counterEl) counterEl.textContent = `${anprCount} Plates`;
      detections.slice(0, 50).forEach(det => addANPRRow(det));
    }
  } catch (err) {
    console.error("Failed loading ANPR detections:", err);
  }
}

async function searchPlate() {
  const input = document.getElementById("anpr-search-input");
  if (!input || !input.value.trim()) return;
  const query = input.value.trim();
  try {
    const results = await fetch(`/anpr/search?plate=${encodeURIComponent(query)}`).then(r => r.json());
    const tbody = document.querySelector("#anpr-table tbody");
    if (tbody) {
      tbody.innerHTML = "";
      if (Array.isArray(results) && results.length > 0) {
        results.forEach(det => addANPRRow(det));
      } else {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#6b7280; padding:1rem;">No results for "${query}"</td></tr>`;
      }
    }
  } catch (err) {
    console.error("Plate search failed:", err);
  }
}

// Initial bootstrap
loadCameras();
loadHistory();
loadANPR();
connectWS();
