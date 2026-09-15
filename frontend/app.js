const map = L.map("map").setView([28.6139, 77.2090], 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const markers = {}; // camera_id -> L.marker
const cameraFeed = document.getElementById("camera-feed");
const cameraTitle = document.getElementById("camera-view-title");
let activeCamera = null;
let feedTimer = null;

const COLORS = { LOW: "#4dff88", MEDIUM: "#ffb84d", HIGH: "#ff4d4d" };

function bandFor(score) {
  if (score > 50) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

function selectCamera(camId) {
  activeCamera = camId;
  cameraTitle.textContent = `Camera: ${camId}`;
  if (feedTimer) clearTimeout(feedTimer);

  let isFetching = false;
  const refresh = () => {
    if (activeCamera !== camId) return;
    if (isFetching) return;
    isFetching = true;

    const img = new Image();
    img.onload = () => {
      if (activeCamera === camId) {
        cameraFeed.src = img.src;
      }
      isFetching = false;
      feedTimer = setTimeout(refresh, 66); // ~15 FPS smooth playback without request backlog
    };
    img.onerror = () => {
      isFetching = false;
      feedTimer = setTimeout(refresh, 150);
    };
    img.src = `live/${camId}.jpg?t=${Date.now()}`;
  };

  refresh();
}

async function loadCameras() {
  const cams = await fetch("/cameras").then(r => r.json());
  cams.forEach(cam => {
    const marker = L.circleMarker([cam.lat, cam.lon], {
      radius: 10, color: COLORS.LOW, fillColor: COLORS.LOW, fillOpacity: 0.8,
    }).addTo(map).bindTooltip(cam.name);
    marker.on("click", () => selectCamera(cam.id));
    markers[cam.id] = marker;
    if (!activeCamera) selectCamera(cam.id);
  });
}

async function loadHistory() {
  const events = await fetch("/events").then(r => r.json());
  const tbody = document.querySelector("#event-table tbody");
  tbody.innerHTML = "";
  events.slice(0, 50).forEach(ev => addHistoryRow(ev));
}

function addHistoryRow(ev) {
  const tbody = document.querySelector("#event-table tbody");
  const row = document.createElement("tr");
  const evidenceCell = ev.evidence_path
    ? `<a href="/evidence/${ev.id}.mp4" target="_blank">clip</a>`
    : "-";
  row.innerHTML = `<td>${new Date(ev.started_at).toLocaleTimeString()}</td>
    <td>${ev.camera_id}</td><td>${ev.object_class}</td>
    <td>${ev.score} (${ev.breakdown.join(", ")})</td>
    <td>${evidenceCell}</td>`;
  tbody.prepend(row);
}

function addAlert(ev) {
  const band = bandFor(ev.score);
  const li = document.createElement("li");
  li.className = band;
  li.textContent = `[${band}] ${ev.camera_id} track#${ev.track_id} (${ev.object_class}) score ${ev.score}: ${ev.breakdown.join(", ")}`;
  document.getElementById("alert-list").prepend(li);

  const marker = markers[ev.camera_id];
  if (marker) marker.setStyle({ color: COLORS[band], fillColor: COLORS[band] });
}

function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/live`);
  ws.onopen = () => { document.getElementById("status").textContent = "live"; };
  ws.onclose = () => {
    document.getElementById("status").textContent = "disconnected, retrying...";
    setTimeout(connectWS, 2000);
  };
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === "event") {
      addAlert(data);
      addHistoryRow({
        id: data.event_id, camera_id: data.camera_id, object_class: data.object_class,
        score: data.score, breakdown: data.breakdown, started_at: new Date().toISOString(),
        evidence_path: true,
      });
    }
  };
}

loadCameras();
loadHistory();
connectWS();
