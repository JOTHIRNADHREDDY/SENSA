const status = document.getElementById("status");
const search = document.getElementById("search");
const list = document.getElementById("episodes");
const player = document.getElementById("player");
const sources = new Map();
let episodes = [];
const frameSelect = document.getElementById("frame-select");
const overlayToggle = document.getElementById("overlay-toggle");
const trackingToggle = document.getElementById("tracking-toggle");
const playerOverlay = document.getElementById("player-overlay");
const playerEvidence = document.getElementById("player-evidence");
const svgNamespace = "http://www.w3.org/2000/svg";
const trackingSamples = new Map();
let activeAssetId = null;

function positionPlayerOverlay() {
  if (!player.videoWidth || !player.videoHeight) return;
  const scale = Math.min(player.clientWidth / player.videoWidth, player.clientHeight / player.videoHeight);
  const width = player.videoWidth * scale;
  const height = player.videoHeight * scale;
  playerOverlay.style.left = (player.clientWidth - width) / 2 + "px";
  playerOverlay.style.top = (player.clientHeight - height) / 2 + "px";
  playerOverlay.style.width = width + "px";
  playerOverlay.style.height = height + "px";
  playerOverlay.setAttribute("viewBox", `0 0 ${player.videoWidth} ${player.videoHeight}`);
}

function renderPlayerTracking() {
  playerOverlay.replaceChildren();
  if (!activeAssetId || !player.videoWidth || trackingToggle.getAttribute("aria-pressed") !== "true") {
    playerEvidence.textContent = "Tracking labels hidden or no source selected.";
    return;
  }
  positionPlayerOverlay();
  const samples = trackingSamples.get(activeAssetId) || [];
  const nearest = samples.reduce((best, sample) =>
    !best || Math.abs(sample.timestamp - player.currentTime) < Math.abs(best.timestamp - player.currentTime)
      ? sample : best, null);
  // These are sampled model outputs. Never imply a continuous track through unsampled footage.
  if (!nearest || Math.abs(nearest.timestamp - player.currentTime) > 0.13) {
    playerEvidence.textContent = "No saved tracking sample at " + player.currentTime.toFixed(3) + " s.";
    return;
  }
  for (const track of nearest.tracks) {
    const [left, top, right, bottom] = track.box;
    const x = left * player.videoWidth;
    const y = top * player.videoHeight;
    const width = (right - left) * player.videoWidth;
    const height = (bottom - top) * player.videoHeight;
    const kind = track.category === "person" ? "person" : "object";
    const group = document.createElementNS(svgNamespace, "g");
    group.setAttribute("class", kind);
    const title = document.createElementNS(svgNamespace, "title");
    title.textContent = track.category + " · anonymous track " + track.id;
    const box = document.createElementNS(svgNamespace, "rect");
    box.setAttribute("class", "track-box");
    for (const [key, value] of Object.entries({ x, y, width, height })) box.setAttribute(key, value);
    const shortId = track.id.split(":").at(-1).slice(1, 5);
    const category = track.category === "person" ? "Person" :
      track.category === "shelf" ? "Shelf" : "Box";
    const caption = category + " " + shortId;
    const tagWidth = Math.min(player.videoWidth, caption.length * 7 + 10);
    const tagX = Math.max(0, Math.min(x, player.videoWidth - tagWidth));
    const tagY = y >= 19 ? y - 18 : y + 2;
    const tag = document.createElementNS(svgNamespace, "rect");
    tag.setAttribute("class", "track-tag");
    for (const [key, value] of Object.entries({ x: tagX, y: tagY, width: tagWidth, height: 17 })) tag.setAttribute(key, value);
    const label = document.createElementNS(svgNamespace, "text");
    label.setAttribute("class", "track-label");
    label.setAttribute("x", tagX + 5);
    label.setAttribute("y", tagY + 12);
    label.textContent = caption;
    group.append(title, box, tag, label);
    playerOverlay.append(group);
  }
  playerEvidence.textContent = "Saved sample " + nearest.timestamp.toFixed(3) + " s · " +
    nearest.tracks.length + " anonymous tracks · labels are sampled observations.";
}

function indexTrackingSamples(content) {
  const observations = new Map(content.observations.map((row) => [row.id, row]));
  const byAsset = new Map();
  for (const node of [...content.anonymous_tracks, ...content.object_tracks]) {
    const track = node.data;
    for (const id of track.observations) {
      const observation = observations.get(id);
      if (!observation || observation.evidence_status !== "available" || !Array.isArray(observation.box)) continue;
      if (!byAsset.has(observation.asset_id)) byAsset.set(observation.asset_id, new Map());
      const frames = byAsset.get(observation.asset_id);
      if (!frames.has(observation.frame_id)) frames.set(observation.frame_id, {
        timestamp: observation.timestamp, tracks: [], seen: new Set(),
      });
      const sample = frames.get(observation.frame_id);
      if (sample.seen.has(track.id)) continue;
      sample.seen.add(track.id);
      sample.tracks.push({ id: track.id, category: track.category, box: observation.box });
    }
  }
  for (const [assetId, frames] of byAsset) {
    trackingSamples.set(assetId, [...frames.values()].sort((a, b) => a.timestamp - b.timestamp));
  }
}

player.addEventListener("loadedmetadata", renderPlayerTracking);
player.addEventListener("timeupdate", renderPlayerTracking);
player.addEventListener("seeked", renderPlayerTracking);
window.addEventListener("resize", positionPlayerOverlay);
trackingToggle.addEventListener("click", () => {
  trackingToggle.setAttribute("aria-pressed", String(trackingToggle.getAttribute("aria-pressed") !== "true"));
  renderPlayerTracking();
});

function seekSource(assetId, time, description) {
  const source = sources.get(assetId);
  activeAssetId = assetId;
  const next = new URL(source.video, location.href).href;
  if (player.src !== next) {
    player.src = source.video;
    player.load();
  }
  player.onloadedmetadata = () => { player.currentTime = time; };
  if (player.readyState >= 1) player.currentTime = time;
  document.getElementById("selected").textContent = source.name + " · " + description;
  renderPlayerTracking();
}

function selectEpisode(episode, button) {
  const row = episode.data;
  seekSource(row.asset_id, row.start, row.start.toFixed(3) + "–" + row.end.toFixed(3) +
    " s source-relative · " + episode.id);
  for (const item of list.children) item.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-pressed", "true");
}

function render() {
  const term = search.value.toLowerCase().trim();
  const matches = episodes.filter((episode) =>
    (sources.get(episode.data.asset_id).name + " " + JSON.stringify(episode)).toLowerCase().includes(term)
  );
  list.replaceChildren();
  document.getElementById("matches").textContent = matches.length + " of " + episodes.length + " candidate episodes";
  for (const episode of matches) {
    const row = episode.data;
    const button = document.createElement("button");
    button.className = "episode";
    button.setAttribute("aria-pressed", "false");
    button.textContent = row.kind.replaceAll("_", " ") + " · " + row.start.toFixed(3) + "–" + row.end.toFixed(3) + " s";
    const detail = document.createElement("small");
    detail.textContent = sources.get(row.asset_id).name + " · " + row.state +
      " · " + row.frame_ids.length + " samples · " + episode.id;
    button.append(detail);
    button.addEventListener("click", () => selectEpisode(episode, button));
    list.append(button);
  }
}

function loadTrackTimelines(content) {
  const observations = new Map(content.observations.map((row) => [row.id, row]));
  for (const node of [...content.anonymous_tracks, ...content.object_tracks]) {
    const row = node.data;
    const samples = new Map();
    for (const id of row.observations) {
      const observation = observations.get(id);
      if (observation?.evidence_status === "available") samples.set(observation.frame_id, observation);
    }
    const details = document.createElement("details");
    details.className = "episode";
    const heading = document.createElement("summary");
    heading.textContent = row.category + " · " + row.first.toFixed(3) + "–" + row.last.toFixed(3) + " s";
    const id = document.createElement("small");
    id.textContent = row.id + " · segment " + row.segment + " · " + row.state;
    const timeline = document.createElement("div");
    timeline.className = "track-times";
    for (const sample of [...samples.values()].sort((a, b) => a.timestamp - b.timestamp)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = sample.timestamp.toFixed(3) + " s";
      button.title = "Frame " + sample.frame_id;
      button.addEventListener("click", () => {
        for (const item of list.children) item.setAttribute("aria-pressed", "false");
        seekSource(sample.asset_id, sample.timestamp, button.textContent + " · track " + row.id);
        player.scrollIntoView({ block: "nearest" });
      });
      timeline.append(button);
    }
    details.append(heading, id, timeline);
    document.getElementById("tracks").append(details);
  }
}

function inspectFrame(images, observations) {
  const index = Number(frameSelect.value);
  const frame = images[index];
  const detections = observations.filter((row) => row.frame_id === frame.frame_id && row.evidence_status === "available");
  const container = document.createElement("div");
  container.className = "inspection-image";
  const image = document.createElement("img");
  image.src = "/demo/evidence/frame-" + (index + 1) + ".png";
  image.alt = frame.caption + " at " + frame.timestamp.toFixed(3) + " seconds";
  const overlay = document.createElementNS(svgNamespace, "svg");
  overlay.setAttribute("viewBox", "0 0 1 1");
  overlay.setAttribute("preserveAspectRatio", "none");
  overlay.setAttribute("aria-hidden", "true");
  for (const detection of detections) {
    const [left, top, right, bottom] = detection.box;
    const rect = document.createElementNS(svgNamespace, "rect");
    for (const [key, value] of Object.entries({ x: left, y: top, width: right - left, height: bottom - top })) {
      rect.setAttribute(key, value);
    }
    overlay.append(rect);
  }
  container.append(image);
  if (overlayToggle.getAttribute("aria-pressed") === "true") container.append(overlay);
  const provenance = document.createElement("p");
  provenance.textContent = "Source " + frame.source_id + " · asset " + frame.asset_id + " · artifact " +
    frame.artifact_id + " · source SHA-256 " + frame.source_sha256;
  const table = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = detections.length + " saved detection records · multiple outputs can refer to the same region";
  const items = document.createElement("ul");
  for (const detection of detections) {
    const item = document.createElement("li");
    item.textContent = detection.label + " · " + detection.provenance + " · observation " + detection.id +
      " · " + detection.model_provenance.model + " run " + detection.run_id;
    items.append(item);
  }
  table.append(summary, items);
  document.getElementById("frame-inspection").replaceChildren(container, provenance, table);
}

async function load() {
  try {
    const response = await fetch("/reports/SENSA_Hackathon_Report_FINAL.json");
    if (!response.ok) throw new Error("Evidence download failed");
    const report = await response.json();
    if (report.version !== 8 || report.id !== "45c9e337-8fef-4e49-9588-ccb8561c07c0") {
      throw new Error("Unexpected report identity");
    }
    report.evidence_manifest.sources.forEach((source, index) => sources.set(source.asset_id, {
      name: "Camera " + (index + 1) + " · SYNTHETIC",
      video: "/demo/sources/synthetic-camera-" + (index + 1) + ".mp4",
    }));
    episodes = report.content.event_episodes;
    indexTrackingSamples(report.content);
    trackingToggle.disabled = false;
    status.textContent = "Snapshot v8 · " + episodes.length + " episodes · " +
      report.content.observations.length + " detection records · " + report.id;
    const { images, comparison } = report.evidence_manifest;
    for (const [index, frame] of images.entries()) {
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      image.src = "/demo/evidence/frame-" + (index + 1) + ".png";
      image.alt = frame.caption + " at " + frame.timestamp.toFixed(3) + " seconds";
      const caption = document.createElement("figcaption");
      caption.textContent = image.alt + " · " + frame.frame_id + " · PNG SHA-256 " + frame.frame_sha256;
      figure.append(image, caption);
      document.getElementById("frames").append(figure);
      frameSelect.add(new Option(image.alt, index));
    }
    document.getElementById("comparison").textContent =
      comparison.before.timestamp.toFixed(3) + " s to " + comparison.after.timestamp.toFixed(3) +
      " s · Visible detections " + comparison.before.count + " → " + comparison.after.count +
      " · Synthetic inventory reference delta " + comparison.inventory_delta + " · " + comparison.state +
      " · Shelf region [" + comparison.roi.join(", ") + "]. " + comparison.inventory_reference;
    loadTrackTimelines(report.content);
    function updateFrame() { inspectFrame(images, report.content.observations); }
    frameSelect.disabled = false;
    overlayToggle.disabled = false;
    frameSelect.addEventListener("change", updateFrame);
    overlayToggle.addEventListener("click", () => {
      overlayToggle.setAttribute("aria-pressed", String(overlayToggle.getAttribute("aria-pressed") !== "true"));
      updateFrame();
    });
    updateFrame();
    search.disabled = false;
    search.addEventListener("input", render);
    render();
  } catch {
    status.textContent = "Saved evidence could not be loaded. Check the report download and reload this page.";
  }
}

load();
