const status = document.getElementById("status");
const search = document.getElementById("search");
const list = document.getElementById("episodes");
const player = document.getElementById("player");
const sources = new Map();
let episodes = [];

function selectEpisode(episode, button) {
  const row = episode.data;
  const source = sources.get(row.asset_id);
  const next = new URL(source.video, location.href).href;
  function seek() {
    player.currentTime = row.start;
  }
  if (player.src !== next) {
    player.addEventListener("loadedmetadata", seek, { once: true });
    player.src = source.video;
    player.load();
  } else {
    seek();
  }
  for (const item of list.children) item.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-pressed", "true");
  document.getElementById("selected").textContent =
    source.name + " · " + row.start.toFixed(3) + "–" + row.end.toFixed(3) +
    " s source-relative · " + episode.id;
}

function render() {
  const term = search.value.toLowerCase().trim();
  const matches = episodes.filter((episode) => JSON.stringify(episode).toLowerCase().includes(term));
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
    status.textContent = "Snapshot v8 · " + episodes.length + " episodes · " +
      report.content.observations.length + " detection records · " + report.id;
    for (const [index, frame] of report.evidence_manifest.images.entries()) {
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      image.src = "/demo/evidence/frame-" + (index + 1) + ".png";
      image.alt = frame.caption + " at " + frame.timestamp.toFixed(3) + " seconds";
      const caption = document.createElement("figcaption");
      caption.textContent = image.alt + " · " + frame.frame_id + " · PNG SHA-256 " + frame.frame_sha256;
      figure.append(image, caption);
      document.getElementById("frames").append(figure);
    }
    search.disabled = false;
    search.addEventListener("input", render);
    render();
  } catch {
    status.textContent = "Saved evidence could not be loaded. Check the report download and reload this page.";
  }
}

load();
