const params = new URLSearchParams(window.location.search);
const manifestPath = params.get("manifest") || "";
const requestedDeviceKey = params.get("device") || "";
let firmwareUrl = params.get("url") || "";
let firmwareName = params.get("name") || "Unknown";
let firmwareSha = (params.get("sha") || "").toLowerCase();
let preferredMethod = params.get("method") || "";
let firmwareOffset = params.get("offset") || "";
let firmwareMcu = (params.get("mcu") || "").split(",").map((m) => m.trim()).filter(Boolean);
const baudRate = Number(params.get("baud") || 115200);

const ui = {
  firmwareName: document.getElementById("firmware-name"),
  firmwareSha: document.getElementById("firmware-sha"),
  deviceSelect: document.getElementById("target-device"),
  deviceHelp: document.getElementById("device-help"),
  methodSelect: document.getElementById("flash-method"),
  downloadLink: document.getElementById("download-link"),
  warning: document.getElementById("method-warning"),
  panelEsp32: document.getElementById("panel-esp32"),
  panelRp2040: document.getElementById("panel-rp2040"),
  panelStm32: document.getElementById("panel-stm32"),
  connect: document.getElementById("connect"),
  flash: document.getElementById("flash"),
  dfuConnect: document.getElementById("dfu-connect"),
  dfuFlash: document.getElementById("dfu-flash"),
  progress: document.getElementById("progress"),
  log: document.getElementById("log")
};

const state = {
  manifest: null,
  devices: [],
  selectedDeviceKey: ""
};

let port = null;

function log(message) {
  ui.log.textContent = `${ui.log.textContent}\n${message}`.trim();
}

function setProgress(value) {
  ui.progress.style.width = `${value}%`;
}

function setWarning(message) {
  ui.warning.textContent = message;
  ui.warning.style.display = message ? "block" : "none";
}

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
  return titleCase(board.model);
}

function deviceKey(board) {
  return `${board.brand}::${board.model}`;
}

function methodLabel(method) {
  const labels = {
    esp32: "ESP32 (esptool-js)",
    rp2040: "RP2040 (UF2 drag)",
    stm32: "STM32 (DFU WebUSB)"
  };
  return labels[method] || method;
}

function showPanel(method) {
  ui.panelEsp32.style.display = method === "esp32" ? "block" : "none";
  ui.panelRp2040.style.display = method === "rp2040" ? "block" : "none";
  ui.panelStm32.style.display = method === "stm32" ? "block" : "none";
}

function methodForMcu(mcu) {
  const value = normalize(mcu);
  if (value.startsWith("esp32")) return "esp32";
  if (value === "rp2040") return "rp2040";
  if (value.startsWith("stm32")) return "stm32";
  return "";
}

function inferFlashMethod(manifest, artifact) {
  if (artifact?.type === "uf2" || (artifact?.file || "").toLowerCase().endsWith(".uf2")) return "rp2040";
  const mcus = (manifest?.mcu || firmwareMcu).map((mcu) => normalize(mcu));
  if (mcus.includes("esp32") || mcus.includes("esp32-s3")) return "esp32";
  if (mcus.includes("rp2040")) return "rp2040";
  if (mcus.includes("stm32")) return "stm32";
  if (artifact?.type === "hex") return "stm32";
  return "";
}

function getFlashArtifacts(manifest) {
  return (manifest?.artifacts || []).filter((artifact) => artifact?.flash_url || artifact?.url);
}

function artifactHasBoardTargets(artifact) {
  return Array.isArray(artifact?.boards) && artifact.boards.length > 0;
}

function artifactMatchesBoard(artifact, board) {
  if (!artifactHasBoardTargets(artifact) || !board?.brand || !board?.model) return false;
  return artifact.boards.some((target) => deviceKey(target) === deviceKey(board));
}

function resolveArtifactForDevice(manifest, key) {
  const artifacts = getFlashArtifacts(manifest);
  const board = (manifest?.boards || []).find((candidate) => deviceKey(candidate) === key) || null;
  if (!artifacts.length) return { board, artifact: null };

  if (board) {
    const targeted = artifacts.find((artifact) => artifactMatchesBoard(artifact, board));
    if (targeted) return { board, artifact: targeted };
  }

  if (artifacts.length === 1) return { board, artifact: artifacts[0] };

  const sharedArtifacts = artifacts.filter((artifact) => !artifactHasBoardTargets(artifact));
  if (sharedArtifacts.length === 1) return { board, artifact: sharedArtifacts[0] };

  return { board, artifact: null };
}

function collectFlashDevices(manifest) {
  return (manifest?.boards || [])
    .map((board) => {
      const key = deviceKey(board);
      const { artifact } = resolveArtifactForDevice(manifest, key);
      return {
        key,
        board,
        label: formatDeviceLabel(board),
        artifact
      };
    })
    .filter((entry) => entry.artifact);
}

function browserSupport() {
  return "serial" in navigator;
}

function updateActionState() {
  const hasFirmware = Boolean(firmwareUrl);
  ui.flash.disabled = !hasFirmware;
  ui.dfuFlash.disabled = !hasFirmware;
  ui.connect.disabled = !browserSupport();
  ui.dfuConnect.disabled = !navigator.usb;
}

function updateDownloadLink() {
  if (firmwareUrl) {
    ui.downloadLink.href = firmwareUrl;
    ui.downloadLink.classList.remove("disabled");
  } else {
    ui.downloadLink.href = "#";
    ui.downloadLink.classList.add("disabled");
  }
}

function updateFirmwareMeta() {
  ui.firmwareName.textContent = firmwareName;
  ui.firmwareSha.textContent = firmwareSha ? `${firmwareSha.slice(0, 12)}...` : "-";
  updateDownloadLink();
  updateActionState();
}

function syncWarning(method) {
  const warnings = [];
  if (state.manifest && state.devices.length > 1 && !state.selectedDeviceKey) {
    warnings.push("Select a device to load the matching firmware artifact.");
  }

  const recommendedMethod = preferredMethod || firmwareMcu.map(methodForMcu).find(Boolean) || "";
  if (recommendedMethod && method && recommendedMethod !== method) {
    warnings.push(`Selected firmware expects ${methodLabel(recommendedMethod)}.`);
  }

  if (method === "rp2040" && firmwareUrl && !firmwareUrl.toLowerCase().endsWith(".uf2")) {
    warnings.push("RP2040 requires a UF2 file. Current firmware is not .uf2.");
  }
  if (method === "stm32" && !navigator.usb) {
    warnings.push("WebUSB is not supported in this browser.");
  }
  if (method === "esp32" && firmwareUrl && !browserSupport()) {
    warnings.push("WebSerial is not supported in this browser.");
  }

  setWarning(warnings.join(" "));
}

function updateMethod(method) {
  showPanel(method);
  syncWarning(method);
  updateActionState();
}

function renderMethodOptions() {
  const methods = ["esp32", "rp2040", "stm32"];
  ui.methodSelect.innerHTML = "";
  methods.forEach((method) => {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = methodLabel(method);
    ui.methodSelect.appendChild(option);
  });
}

function renderLegacyDeviceState(message) {
  ui.deviceSelect.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "Direct firmware URL";
  ui.deviceSelect.appendChild(option);
  ui.deviceSelect.disabled = true;
  ui.deviceHelp.textContent = message;
}

function renderDeviceOptions(devices) {
  ui.deviceSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = devices.length > 1 ? "Select device" : "Matched device";
  ui.deviceSelect.appendChild(placeholder);

  devices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.key;
    option.textContent = device.label;
    ui.deviceSelect.appendChild(option);
  });

  ui.deviceSelect.disabled = devices.length <= 1;
  if (!devices.length) {
    ui.deviceHelp.textContent = "This package does not expose any flashable device targets.";
  } else if (devices.length === 1) {
    ui.deviceHelp.textContent = `Firmware matched automatically for ${devices[0].label}.`;
  } else {
    ui.deviceHelp.textContent = "Select the target board to match the correct firmware.";
  }
}

function applyDeviceSelection(key) {
  state.selectedDeviceKey = key;
  if (!state.manifest) return;

  if (!key) {
    firmwareName = state.manifest.name || params.get("name") || "Unknown";
    firmwareUrl = "";
    firmwareSha = "";
    firmwareOffset = "";
    preferredMethod = "";
    firmwareMcu = (state.manifest.mcu || []).map((m) => String(m).trim()).filter(Boolean);
    updateFirmwareMeta();
    updateMethod(ui.methodSelect.value);
    return;
  }

  const { board, artifact } = resolveArtifactForDevice(state.manifest, key);
  if (!artifact) {
    firmwareName = state.manifest.name || params.get("name") || "Unknown";
    firmwareUrl = "";
    firmwareSha = "";
    firmwareOffset = "";
    preferredMethod = "";
    firmwareMcu = (state.manifest.mcu || []).map((m) => String(m).trim()).filter(Boolean);
    updateFirmwareMeta();
    updateMethod(ui.methodSelect.value);
    return;
  }

  const method = inferFlashMethod(state.manifest, artifact);
  firmwareName = board ? `${state.manifest.name} (${formatDeviceLabel(board)})` : state.manifest.name || firmwareName;
  firmwareUrl = artifact.flash_url || artifact.url || "";
  firmwareSha = (artifact.sha256 || "").toLowerCase();
  firmwareOffset = artifact.flash?.offset || (method === "esp32" ? "0x10000" : "");
  preferredMethod = method || "";
  firmwareMcu = (state.manifest.mcu || []).map((m) => String(m).trim()).filter(Boolean);
  updateFirmwareMeta();
  if (preferredMethod) ui.methodSelect.value = preferredMethod;
  updateMethod(ui.methodSelect.value);
}

async function loadManifest(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Manifest not found (${response.status})`);
  return await response.json();
}

async function connectPort() {
  if (!browserSupport()) {
    log("WebSerial is not supported in this browser.");
    return;
  }
  try {
    port = await navigator.serial.requestPort();
    log("Port selected. Ready to flash.");
  } catch (err) {
    log(`Connection failed: ${err.message || err}`);
  }
}

async function fetchFirmware() {
  if (!firmwareUrl) throw new Error("Firmware URL missing");
  log("Downloading firmware...");
  const response = await fetch(firmwareUrl);
  if (!response.ok) throw new Error("Download failed");
  const buffer = await response.arrayBuffer();
  log(`Downloaded ${buffer.byteLength} bytes.`);
  return buffer;
}

async function verifySha(buffer) {
  if (!firmwareSha) return true;
  if (!window.crypto?.subtle) {
    log("SHA256 check skipped (WebCrypto unavailable).");
    return true;
  }
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const digest = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== firmwareSha) {
    log("SHA256 mismatch. Aborting.");
    return false;
  }
  log("SHA256 verified.");
  return true;
}

async function flashEsp32() {
  if (!firmwareUrl) {
    log("Firmware URL missing.");
    return;
  }

  if (!browserSupport()) {
    log("WebSerial not supported. Use the CLI guide.");
    return;
  }

  try {
    setProgress(0);
    const buffer = await fetchFirmware();
    const ok = await verifySha(buffer);
    if (!ok) return;

    if (window.FirmwareFlashers?.esp32) {
      await window.FirmwareFlashers.esp32({
        url: firmwareUrl,
        buffer,
        offset: firmwareOffset,
        baudRate,
        port,
        requestPort: () => navigator.serial.requestPort(),
        log,
        progress: setProgress
      });
      log("ESP32 flash complete.");
      setProgress(100);
    } else {
      setWarning("ESP32 flashing requires an esptool-js adapter. Provide window.FirmwareFlashers.esp32 to enable.");
      log("ESP32 adapter not detected.");
    }
  } catch (err) {
    log(`ESP32 flash failed: ${err.message || err}`);
  }
}

async function init() {
  renderMethodOptions();
  updateFirmwareMeta();

  if (manifestPath) {
    try {
      state.manifest = await loadManifest(manifestPath);
      state.devices = collectFlashDevices(state.manifest);
      firmwareName = state.manifest.name || firmwareName;
      firmwareMcu = (state.manifest.mcu || []).map((m) => String(m).trim()).filter(Boolean);
      renderDeviceOptions(state.devices);

      const initialDevice =
        state.devices.find((device) => device.key === requestedDeviceKey)?.key ||
        (state.devices.length === 1 ? state.devices[0].key : "");
      if (initialDevice) {
        ui.deviceSelect.value = initialDevice;
        applyDeviceSelection(initialDevice);
      } else {
        updateFirmwareMeta();
      }
    } catch (err) {
      renderLegacyDeviceState("Failed to load package metadata. Falling back to the direct firmware link.");
      setWarning(`Manifest load failed: ${err.message || err}`);
    }
  } else {
    renderLegacyDeviceState("This launch uses a direct firmware URL, so no device selection is available.");
  }

  const inferred = firmwareMcu.map(methodForMcu).find(Boolean) || preferredMethod || ui.methodSelect.value;
  ui.methodSelect.value = inferred || ui.methodSelect.value;
  updateMethod(ui.methodSelect.value);

  ui.deviceSelect.addEventListener("change", (event) => {
    applyDeviceSelection(event.target.value);
  });
  ui.methodSelect.addEventListener("change", (event) => updateMethod(event.target.value));
  ui.connect.addEventListener("click", connectPort);
  ui.flash.addEventListener("click", flashEsp32);

  ui.dfuConnect.addEventListener("click", () => {
    if (window.FirmwareFlashers?.stm32) {
      window.FirmwareFlashers.stm32({ url: firmwareUrl, log, progress: setProgress });
    } else {
      setWarning("STM32 DFU requires a WebUSB DFU adapter. Provide window.FirmwareFlashers.stm32 to enable.");
    }
  });

  ui.dfuFlash.addEventListener("click", () => {
    if (window.FirmwareFlashers?.stm32) {
      window.FirmwareFlashers.stm32({ url: firmwareUrl, log, progress: setProgress });
    } else {
      setWarning("STM32 DFU requires a WebUSB DFU adapter. Provide window.FirmwareFlashers.stm32 to enable.");
    }
  });

  if (!firmwareUrl && !state.manifest) {
    log("No firmware URL provided. Use the catalog to launch this page.");
  } else if (!firmwareUrl && state.manifest && state.devices.length > 1) {
    log("Select a device to load the matching firmware.");
  }
}

init();
