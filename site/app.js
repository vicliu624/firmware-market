const state = {
  packages: [],
  filtered: [],
  latestById: {},
  devices: [],
  options: {
    brands: [],
    features: [],
    regions: [],
    scenes: []
  },
  filters: {
    search: "",
    brand: "",
    device: "",
    features: [],
    featureMode: "and",
    region: "",
    scene: "",
    channel: "",
    showDeprecated: false,
    trust: ["official", "verified"]
  }
};

const trustLabels = {
  official: "Official",
  verified: "Verified",
  community: "Community"
};

const brandLabels = {
  lilygo: "LilyGO",
  m5stack: "M5Stack"
};

const ui = {
  search: document.getElementById("search"),
  clearSearch: document.getElementById("clear-search"),
  trustSwitch: document.getElementById("trust-switch"),
  summaryChips: document.getElementById("summary-chips"),
  clearAll: document.getElementById("clear-all"),
  brandChips: document.getElementById("brand-chips"),
  deviceChips: document.getElementById("device-chips"),
  deviceSearch: document.getElementById("device-search"),
  deviceList: document.getElementById("device-list"),
  featureChips: document.getElementById("feature-chips"),
  featureMode: document.getElementById("feature-mode"),
  regionChips: document.getElementById("region-chips"),
  sceneBlock: document.getElementById("scene-block"),
  sceneChips: document.getElementById("scene-chips"),
  showDeprecated: document.getElementById("show-deprecated"),
  resultsGrid: document.getElementById("results-grid"),
  featuredStrip: document.getElementById("featured-strip"),
  resultsMeta: document.getElementById("results-meta"),
  empty: document.getElementById("results-empty"),
  drawer: document.getElementById("drawer"),
  drawerBody: document.getElementById("drawer-body"),
  drawerClose: document.getElementById("drawer-close")
};

function normalize(value) {
  return String(value || "").toLowerCase();
}

function titleCase(value) {
  return String(value || "")
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDeviceLabel(board) {
  if (!board) return "";
  if (board.label) return board.label;
  const brand = brandLabels[board.brand] || titleCase(board.brand);
  const model = titleCase(board.model);
  return `${brand} ${model}`.trim();
}

function deviceKey(board) {
  return `${board.brand}::${board.model}`;
}

function buildLatestIndex(packages) {
  const latest = {};
  packages.forEach((item) => {
    const date = item.release?.date || "";
    if (!latest[item.id] || date > latest[item.id]) {
      latest[item.id] = date;
    }
  });
  return latest;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function collectOptions(packages) {
  const deviceMap = new Map();
  const brands = [];
  const features = [];
  const regions = [];
  const scenes = [];

  packages.forEach((item) => {
    (item.boards || []).forEach((board) => {
      if (!board?.brand || !board?.model) return;
      brands.push(board.brand);
      const key = deviceKey(board);
      if (!deviceMap.has(key)) {
        deviceMap.set(key, {
          key,
          label: formatDeviceLabel(board),
          brand: board.brand,
          model: board.model
        });
      }
    });
    (item.features || []).forEach((feature) => features.push(feature));
    (item.regions || []).forEach((region) => regions.push(region));
    (item.scenes || []).forEach((scene) => scenes.push(scene));
  });

  state.devices = Array.from(deviceMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  return {
    brands: uniqueSorted(brands),
    features: uniqueSorted(features),
    regions: uniqueSorted(regions),
    scenes: uniqueSorted(scenes)
  };
}

function renderDeviceFilters() {
  ui.deviceChips.innerHTML = "";
  ui.deviceList.innerHTML = "";

  const scopedDevices = state.filters.brand
    ? state.devices.filter((device) => device.brand === state.filters.brand)
    : state.devices;

  let featured = scopedDevices.slice(0, 5);
  if (state.filters.device) {
    const selected = state.devices.find((device) => device.key === state.filters.device);
    if (selected && !featured.some((device) => device.key === selected.key)) {
      featured = [selected, ...featured.slice(0, 4)];
    }
  }
  featured.forEach((device) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = device.label;
    chip.dataset.device = device.key;
    if (state.filters.device === device.key) chip.classList.add("is-active");
    chip.addEventListener("click", () => selectDevice(device.key, device.label));
    ui.deviceChips.appendChild(chip);
  });

  scopedDevices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.label;
    ui.deviceList.appendChild(option);
  });
}

function renderChips(container, values, activeValue, onSelect) {
  container.innerHTML = "";
  values.forEach((value) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = value;
    if (value === activeValue) chip.classList.add("is-active");
    chip.addEventListener("click", () => onSelect(value));
    container.appendChild(chip);
  });
}

function renderFeatureChips(values) {
  ui.featureChips.innerHTML = "";
  values.forEach((value) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = value;
    if (state.filters.features.includes(value)) chip.classList.add("is-active");
    chip.addEventListener("click", () => toggleFeature(value));
    ui.featureChips.appendChild(chip);
  });
}

function selectDevice(key, label) {
  state.filters.device = key;
  ui.deviceSearch.value = label || "";
  applyFilters();
}

function selectBrand(value) {
  state.filters.brand = state.filters.brand === value ? "" : value;
  if (state.filters.device) {
    const selected = state.devices.find((device) => device.key === state.filters.device);
    if (selected && state.filters.brand && selected.brand !== state.filters.brand) {
      state.filters.device = "";
      ui.deviceSearch.value = "";
    }
  }
  applyFilters();
}

function toggleFeature(feature) {
  const idx = state.filters.features.indexOf(feature);
  if (idx >= 0) {
    state.filters.features.splice(idx, 1);
  } else {
    state.filters.features.push(feature);
  }
  applyFilters();
}

function matchesDevice(item) {
  if (!state.filters.device) return true;
  return (item.boards || []).some((board) => deviceKey(board) === state.filters.device);
}

function matchesBrand(item) {
  if (!state.filters.brand) return true;
  return (item.boards || []).some((board) => board.brand === state.filters.brand);
}

function matchesFeatures(item) {
  const selected = state.filters.features;
  if (!selected.length) return true;
  const itemFeatures = new Set(item.features || []);
  if (state.filters.featureMode === "and") {
    return selected.every((feature) => itemFeatures.has(feature));
  }
  return selected.some((feature) => itemFeatures.has(feature));
}

function matchesTrust(item) {
  if (!state.filters.trust.length) return false;
  return state.filters.trust.includes(item.trust);
}

function matchesChannel(item) {
  if (!state.filters.channel) return true;
  if (state.filters.channel === "latest") {
    return (item.release?.date || "") === (state.latestById[item.id] || "");
  }
  const channel = item.release_channel || "stable";
  return channel === state.filters.channel;
}

function matchesSupport(item) {
  const support = item.support || "supported";
  if (support === "deprecated" && !state.filters.showDeprecated) return false;
  return true;
}

function matchesScene(item) {
  if (!state.filters.scene) return true;
  return (item.scenes || []).includes(state.filters.scene);
}

function matchesRegion(item) {
  if (!state.filters.region) return true;
  return (item.regions || []).includes(state.filters.region);
}

function inferFlashMethod(item, artifact) {
  const mcus = (item.mcu || []).map((mcu) => normalize(mcu));
  if (mcus.includes("esp32") || mcus.includes("esp32-s3")) return "esp32";
  if (mcus.includes("rp2040")) return "rp2040";
  if (mcus.includes("stm32")) return "stm32";
  if (artifact?.type === "uf2" || (artifact?.file || "").toLowerCase().endsWith(".uf2")) return "rp2040";
  return "";
}

function applyFilters() {
  const search = normalize(state.filters.search);

  state.filtered = state.packages.filter((item) => {
    if (!matchesTrust(item)) return false;
    if (!matchesBrand(item)) return false;
    if (!matchesDevice(item)) return false;
    if (!matchesRegion(item)) return false;
    if (!matchesScene(item)) return false;
    if (!matchesFeatures(item)) return false;
    if (!matchesChannel(item)) return false;
    if (!matchesSupport(item)) return false;

    if (search) {
      const haystack = [
        item.name,
        item.tagline,
        item.description,
        item.publisher?.name,
        (item.boards || []).map(formatDeviceLabel).join(" "),
        (item.features || []).join(" ")
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  state.filtered.sort((a, b) => {
    const trustOrder = ["official", "verified", "community"];
    const trustDiff = trustOrder.indexOf(a.trust) - trustOrder.indexOf(b.trust);
    if (trustDiff !== 0) return trustDiff;
    return (b.release?.date || "").localeCompare(a.release?.date || "");
  });

  renderSummary();
  renderCards();
  renderFeatured();
  renderMeta();
  renderEmpty();
  renderFilters();
}

function renderSummary() {
  const chips = [];
  if (state.filters.device) {
    const device = state.devices.find((d) => d.key === state.filters.device);
    if (device) chips.push({ label: device.label, key: "device" });
  }
  if (state.filters.brand) {
    const label = brandLabels[state.filters.brand] || titleCase(state.filters.brand);
    chips.push({ label: `Brand: ${label}`, key: "brand" });
  }
  if (state.filters.features.length) {
    const label = `${state.filters.featureMode.toUpperCase()}: ${state.filters.features.join(", ")}`;
    chips.push({ label, key: "features" });
  }
  if (state.filters.region) chips.push({ label: `Region: ${state.filters.region}`, key: "region" });
  if (state.filters.scene) chips.push({ label: `Scene: ${state.filters.scene}`, key: "scene" });
  if (state.filters.channel) chips.push({ label: `Channel: ${state.filters.channel}`, key: "channel" });
  if (state.filters.showDeprecated) chips.push({ label: "Including deprecated", key: "deprecated" });
  if (state.filters.trust.length && state.filters.trust.length < 3) {
    const label = `Trust: ${state.filters.trust.map((t) => trustLabels[t]).join("/")}`;
    chips.push({ label, key: "trust" });
  }

  ui.summaryChips.innerHTML = "";
  if (!chips.length) {
    ui.summaryChips.innerHTML = '<span class="muted">No filters selected</span>';
    return;
  }
  chips.forEach((chip) => {
    const el = document.createElement("button");
    el.className = "chip is-active";
    el.textContent = chip.label;
    el.addEventListener("click", () => clearFilter(chip.key));
    ui.summaryChips.appendChild(el);
  });
}

function clearFilter(key) {
  switch (key) {
    case "device":
      state.filters.device = "";
      ui.deviceSearch.value = "";
      state.filters.brand = "";
      break;
    case "brand":
      state.filters.brand = "";
      break;
    case "features":
      state.filters.features = [];
      break;
    case "region":
      state.filters.region = "";
      break;
    case "scene":
      state.filters.scene = "";
      break;
    case "channel":
      state.filters.channel = "";
      document.querySelector('input[name="channel"][value=""]').checked = true;
      break;
    case "deprecated":
      state.filters.showDeprecated = false;
      ui.showDeprecated.checked = false;
      break;
    case "trust":
      state.filters.trust = ["official", "verified"];
      break;
    default:
      break;
  }
  applyFilters();
}

function renderFilters() {
  renderDeviceFilters();
  renderChips(ui.brandChips, state.options.brands, state.filters.brand, selectBrand);
  renderFeatureChips(state.options.features);
  renderChips(ui.regionChips, state.options.regions, state.filters.region, (value) => {
    state.filters.region = value === state.filters.region ? "" : value;
    applyFilters();
  });

  if (state.options.scenes.length) {
    ui.sceneBlock.style.display = "block";
    renderChips(ui.sceneChips, state.options.scenes, state.filters.scene, (value) => {
      state.filters.scene = value === state.filters.scene ? "" : value;
      applyFilters();
    });
  } else {
    ui.sceneBlock.style.display = "none";
  }

  Array.from(ui.featureMode.querySelectorAll(".mode-pill")).forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.filters.featureMode);
  });

  Array.from(ui.trustSwitch.querySelectorAll(".trust-pill")).forEach((button) => {
    button.classList.toggle("is-active", state.filters.trust.includes(button.dataset.trust));
  });
}

function renderCards() {
  ui.resultsGrid.innerHTML = "";
  const canFlash = "serial" in navigator;

  state.filtered.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.animationDelay = `${index * 40}ms`;

    const poster = item.poster?.hero || "";
    const posterClass = poster ? "card-poster has-image" : "card-poster";
    const posterImage = poster ? `<img class="poster-img" src="${poster}" alt="${item.name} poster">` : "";

    const support = item.support || "supported";
    const releaseChannel = item.release_channel || "stable";
    const statusLabel = support === "deprecated" ? "Deprecated" : titleCase(releaseChannel);

    const boards = (item.boards || []).map(formatDeviceLabel).slice(0, 3);
    const moreBoards = (item.boards || []).length - boards.length;
    const boardChips = boards.map((b) => `<span class="chip">${b}</span>`).join("") +
      (moreBoards > 0 ? `<span class="chip">+${moreBoards}</span>` : "");

    const features = (item.features || []).slice(0, 4);
    const moreFeatures = (item.features || []).length - features.length;
    const featureChips = features.map((f) => `<span class="chip">${f}</span>`).join("") +
      (moreFeatures > 0 ? `<span class="chip">+${moreFeatures}</span>` : "");

    const artifact = (item.artifacts || [])[0] || {};
    const method = inferFlashMethod(item, artifact);
    const mcuParam = (item.mcu || []).join(",");
    const flashHref = artifact.url
      ? `flash.html?url=${encodeURIComponent(artifact.url)}&sha=${artifact.sha256 || ""}&name=${encodeURIComponent(item.name)}&method=${encodeURIComponent(method)}&mcu=${encodeURIComponent(mcuParam)}`
      : "#";
    const flashLink = artifact.url
      ? `<a class="btn ghost" href="${flashHref}">Flash</a>`
      : `<span class="btn ghost disabled">Flash</span>`;

    const avatar = item.publisher?.avatar
      ? `<img class="avatar" src="${item.publisher.avatar}" alt="${item.publisher.name}">`
      : `<div class="avatar">${(item.publisher?.name || "?").charAt(0)}</div>`;

    card.innerHTML = `
      <div class="${posterClass}">
        ${posterImage}
        <div class="poster-meta">
          <span class="trust-badge ${item.trust}">${trustLabels[item.trust]}</span>
          <span class="status-badge ${support === "deprecated" ? "deprecated" : ""}">${statusLabel}</span>
        </div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${item.name}</h3>
        <div class="card-tagline">${item.tagline || item.description || ""}</div>
        <div class="chip-row">${boardChips}</div>
        <div class="chip-row">${featureChips}</div>
        <div class="card-meta">
          <div class="publisher">${avatar}<span>${item.publisher?.name || ""}</span></div>
          <div>v${item.version} ? ${item.release?.date || ""}</div>
        </div>
        <div class="card-actions">
          <button class="btn primary" data-action="details">Details</button>
          ${flashLink}
        </div>
      </div>
    `;

    card.querySelector("[data-action='details']").addEventListener("click", () => openDrawer(item));
    ui.resultsGrid.appendChild(card);
  });
}

function renderFeatured() {
  const featured = state.filtered.filter((item) => item.featured);
  if (!featured.length) {
    ui.featuredStrip.style.display = "none";
    ui.featuredStrip.innerHTML = "";
    return;
  }
  ui.featuredStrip.style.display = "flex";
  ui.featuredStrip.innerHTML = "";
  featured.slice(0, 6).forEach((item) => {
    const card = document.createElement("div");
    card.className = "featured-card";
    card.innerHTML = `
      <div class="muted">Featured</div>
      <h3 class="card-title">${item.name}</h3>
      <div class="card-tagline">${item.tagline || ""}</div>
      <button class="btn primary" data-featured="${item.id}">View</button>
    `;
    card.querySelector("[data-featured]").addEventListener("click", () => openDrawer(item));
    ui.featuredStrip.appendChild(card);
  });
}

function renderMeta() {
  ui.resultsMeta.textContent = `${state.filtered.length} of ${state.packages.length} releases`;
}

function renderEmpty() {
  ui.empty.style.display = state.filtered.length === 0 ? "block" : "none";
}

function renderDetailStory(item) {
  if (item.story && item.story.length) {
    return item.story.map((paragraph) => `<p>${paragraph}</p>`).join("");
  }
  if (item.description) {
    return `<p>${item.description}</p>`;
  }
  return "";
}

function renderDetailFeatures(item) {
  if (item.feature_sections && item.feature_sections.length) {
    return item.feature_sections
      .map((section) => {
        const imageStyle = section.image ? `style="background-image:url('${section.image}')"` : "";
        return `
          <div class="detail-grid">
            <div>
              <h4>${section.title}</h4>
              <p>${section.summary}</p>
              ${section.requires ? `<div class="muted">Requires: ${section.requires}</div>` : ""}
            </div>
            <div class="gallery-tile" ${imageStyle}></div>
          </div>
        `;
      })
      .join("");
  }
  if (item.features && item.features.length) {
    return `<div class="chip-row">${item.features.map((f) => `<span class="chip">${f}</span>`).join("")}</div>`;
  }
  return "";
}

function openDrawer(item) {
  const poster = item.poster?.hero || "";
  const posterImage = poster ? `<img class="poster-img" src="${poster}" alt="${item.name} poster">` : "";
  const gallery = (item.poster?.gallery || []).slice(0, 6);
  const galleryHtml = gallery.length
    ? `
      <div class="detail-gallery">
        ${gallery.map((img) => `<div class="gallery-tile" style="background-image:url('${img}')"></div>`).join("")}
      </div>
    `
    : "";

  const communityWarning =
    item.trust === "community"
      ? '<div class="detail-warning">Community build. Verify compatibility and hashes before flashing.</div>'
      : "";

  const artifact = (item.artifacts || [])[0] || {};
  const canFlash = "serial" in navigator;
  const method = inferFlashMethod(item, artifact);
  let flashLabel = "CLI";
  if (method === "esp32") flashLabel = canFlash ? "Web Flash (ESP32) / CLI" : "CLI";
  if (method === "rp2040") flashLabel = "UF2 Drag / CLI";
  if (method === "stm32") flashLabel = navigator.usb ? "Web DFU / CLI" : "CLI (DFU)";
  const mcuParam = (item.mcu || []).join(",");
  const flashHref = artifact.url
    ? `flash.html?url=${encodeURIComponent(artifact.url)}&sha=${artifact.sha256 || ""}&name=${encodeURIComponent(item.name)}&method=${encodeURIComponent(method)}&mcu=${encodeURIComponent(mcuParam)}`
    : "#";
  const flashLink = artifact.url ? `<a class="btn primary" href="${flashHref}">Flash</a>` : "";

  ui.drawerBody.innerHTML = `
    <div class="detail-hero">
      <div class="detail-poster">${posterImage}</div>
      <div>
        <div class="muted">${trustLabels[item.trust]}</div>
        <h2>${item.name}</h2>
        <p class="card-tagline">${item.tagline || item.description || ""}</p>
        <div class="detail-actions">
          ${flashLink}
          ${artifact.url ? `<a class="btn ghost" href="${artifact.url}">Download</a>` : ""}
          ${item.release?.notes ? `<a class="btn ghost" href="${item.release.notes}">Release notes</a>` : ""}
        </div>
        <div class="detail-stats">
          <div class="detail-stat"><strong>${(item.boards || []).length}</strong> devices</div>
          <div class="detail-stat"><strong>${(item.features || []).length}</strong> features</div>
          <div class="detail-stat"><strong>v${item.version}</strong> ? ${item.release?.date || ""}</div>
        </div>
      </div>
    </div>

    ${communityWarning}

    <div class="detail-section">
      <h3>Why it matters</h3>
      ${renderDetailStory(item)}
    </div>

    <div class="detail-section">
      <h3>Core features</h3>
      ${renderDetailFeatures(item)}
    </div>

    <div class="detail-section">
      <h3>Compatibility</h3>
      <div class="detail-grid">
        <div><strong>Devices:</strong> ${(item.boards || []).map(formatDeviceLabel).join(", ") || "-"}</div>
        <div><strong>Regions:</strong> ${(item.regions || []).join(", ") || "-"}</div>
        <div><strong>MCU:</strong> ${(item.mcu || []).join(", ") || "-"}</div>
        <div><strong>Flashing:</strong> ${flashLabel}</div>
        <div><strong>SHA256:</strong> ${artifact.sha256 || "-"}</div>
        <div><strong>Source:</strong> <a href="${item.release?.notes || "#"}">Release</a></div>
      </div>
    </div>

    <div class="detail-section">
      <h3>Trust & publisher</h3>
      <div class="detail-grid">
        <div><strong>Publisher:</strong> ${item.publisher?.name || "-"}</div>
        <div><strong>GitHub:</strong> ${item.publisher?.github || "-"}</div>
        <div><strong>Repo:</strong> <a href="${item.publisher?.repo || "#"}">Repository</a></div>
        <div><strong>Support:</strong> ${item.support || "supported"}</div>
      </div>
    </div>

    ${galleryHtml}
  `;

  ui.drawer.style.display = "flex";
}

function closeDrawer() {
  ui.drawer.style.display = "none";
}

function wireEvents() {
  ui.search.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    applyFilters();
  });

  ui.clearSearch.addEventListener("click", () => {
    state.filters.search = "";
    ui.search.value = "";
    applyFilters();
  });

  ui.deviceSearch.addEventListener("change", (event) => {
    const value = normalize(event.target.value);
    const match = state.devices.find((device) => normalize(device.label) === value);
    if (match) {
      selectDevice(match.key, match.label);
    }
  });

  ui.deviceSearch.addEventListener("input", (event) => {
    if (!event.target.value) {
      state.filters.device = "";
      applyFilters();
    }
  });

  ui.featureMode.addEventListener("click", (event) => {
    const button = event.target.closest(".mode-pill");
    if (!button) return;
    state.filters.featureMode = button.dataset.mode;
    applyFilters();
  });

  ui.trustSwitch.addEventListener("click", (event) => {
    const button = event.target.closest(".trust-pill");
    if (!button) return;
    const trust = button.dataset.trust;
    const idx = state.filters.trust.indexOf(trust);
    if (idx >= 0) {
      state.filters.trust.splice(idx, 1);
    } else {
      state.filters.trust.push(trust);
    }
    applyFilters();
  });

  document.querySelectorAll('input[name="channel"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      state.filters.channel = event.target.value;
      applyFilters();
    });
  });

  ui.showDeprecated.addEventListener("change", (event) => {
    state.filters.showDeprecated = event.target.checked;
    applyFilters();
  });

  ui.clearAll.addEventListener("click", () => {
    state.filters = {
      search: "",
      brand: "",
      device: "",
      features: [],
      featureMode: "and",
      region: "",
      scene: "",
      channel: "",
      showDeprecated: false,
      trust: ["official", "verified"]
    };
    ui.search.value = "";
    ui.deviceSearch.value = "";
    ui.showDeprecated.checked = false;
    document.querySelector('input[name="channel"][value=""]').checked = true;
    applyFilters();
  });

  document.querySelectorAll("[data-clear]").forEach((button) => {
    button.addEventListener("click", () => clearFilter(button.dataset.clear));
  });

  ui.drawerClose.addEventListener("click", closeDrawer);
  ui.drawer.addEventListener("click", (event) => {
    if (event.target === ui.drawer) closeDrawer();
  });
}

async function load() {
  let packages = null;

  try {
    const response = await fetch("manifests.json", { cache: "no-store" });
    if (response.ok) {
      const list = await response.json();
      if (Array.isArray(list) && list.length) {
        const results = await Promise.all(
          list.map(async (path) => {
            try {
              const itemResponse = await fetch(path, { cache: "no-store" });
              if (!itemResponse.ok) return null;
              return await itemResponse.json();
            } catch (err) {
              return null;
            }
          })
        );
        packages = results.filter(Boolean);
      } else {
        packages = [];
      }
    }
  } catch (err) {
    console.warn("Failed to load manifests.json", err);
  }

  if (!packages) {
    try {
      const response = await fetch("index.json", { cache: "no-store" });
      if (!response.ok) throw new Error("index.json not found");
      const data = await response.json();
      packages = data.packages || [];
    } catch (err) {
      console.warn("Failed to load index.json", err);
      packages = [];
    }
  }

  state.packages = packages;
  state.latestById = buildLatestIndex(state.packages);
  state.options = collectOptions(state.packages);

  renderFilters();
  wireEvents();
  applyFilters();
}

load();
