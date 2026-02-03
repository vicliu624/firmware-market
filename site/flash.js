const params = new URLSearchParams(window.location.search);
const firmwareUrl = params.get("url") || "";
const firmwareName = params.get("name") || "Unknown";
const firmwareSha = (params.get("sha") || "").toLowerCase();
const preferredMethod = params.get("method") || "";
const firmwareMcu = (params.get("mcu") || "").split(",").map((m) => m.trim()).filter(Boolean);
const baudRate = Number(params.get("baud") || 115200);

const ui = {
  firmwareName: document.getElementById("firmware-name"),
  firmwareSha: document.getElementById("firmware-sha"),
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

async function loadSupportedMethods() {
  const methods = new Set();
  try {
    const response = await fetch("manifests.json", { cache: "no-store" });
    if (!response.ok) throw new Error("manifests.json not found");
    const list = await response.json();
    if (Array.isArray(list)) {
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
      results.filter(Boolean).forEach((item) => {
        (item.mcu || []).forEach((mcu) => {
          const method = methodForMcu(mcu);
          if (method) methods.add(method);
        });
      });
    }
  } catch (err) {
    // ignore; fallback below
  }

  if (methods.size === 0) {
    ["esp32", "rp2040", "stm32"].forEach((method) => methods.add(method));
  }
  return Array.from(methods);
}

function renderMethodOptions(methods) {
  const labels = {
    esp32: "ESP32 (esptool-js)",
    rp2040: "RP2040 (UF2 drag)",
    stm32: "STM32 (DFU WebUSB)"
  };
  ui.methodSelect.innerHTML = "";
  methods.forEach((method) => {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = labels[method] || method;
    ui.methodSelect.appendChild(option);
  });
}

function browserSupport() {
  return "serial" in navigator;
}

async function connectPort() {
  if (!browserSupport()) {
    log("WebSerial is not supported in this browser.");
    return;
  }
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate });
    log(`Connected at ${baudRate} baud.`);
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

function updateDownloadLink() {
  if (firmwareUrl) {
    ui.downloadLink.href = firmwareUrl;
    ui.downloadLink.classList.remove("disabled");
  } else {
    ui.downloadLink.href = "#";
    ui.downloadLink.classList.add("disabled");
  }
}

function updateMethod(method) {
  showPanel(method);
  setWarning("");
  if (method === "rp2040") {
    if (firmwareUrl && !firmwareUrl.toLowerCase().endsWith(".uf2")) {
      setWarning("RP2040 requires a UF2 file. Current firmware is not .uf2.");
    }
  }
  if (method === "stm32") {
    if (!navigator.usb) setWarning("WebUSB is not supported in this browser.");
  }
}

async function init() {
  ui.firmwareName.textContent = firmwareName;
  ui.firmwareSha.textContent = firmwareSha ? firmwareSha.slice(0, 12) + "..." : "-";

  const availableMethods = await loadSupportedMethods();
  renderMethodOptions(availableMethods);
  const inferred = firmwareMcu.map(methodForMcu).find(Boolean) || "";
  ui.methodSelect.value = preferredMethod || inferred || ui.methodSelect.value;

  updateDownloadLink();
  updateMethod(ui.methodSelect.value);

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

  if (!firmwareUrl) {
    log("No firmware URL provided. Use the catalog to launch this page.");
  }
}

init();
