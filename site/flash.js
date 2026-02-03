const params = new URLSearchParams(window.location.search);
const firmwareUrl = params.get("url") || "";
const firmwareName = params.get("name") || "Unknown";
const firmwareSha = (params.get("sha") || "").toLowerCase();
const baudRate = Number(params.get("baud") || 115200);

const ui = {
  browserStatus: document.getElementById("browser-status"),
  firmwareName: document.getElementById("firmware-name"),
  firmwareSha: document.getElementById("firmware-sha"),
  connect: document.getElementById("connect"),
  flash: document.getElementById("flash"),
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

async function writeSerial(buffer) {
  if (!port || !port.writable) throw new Error("Serial port not open");
  const writer = port.writable.getWriter();
  const chunkSize = 1024 * 16;
  const total = buffer.byteLength;
  let offset = 0;

  try {
    while (offset < total) {
      const chunk = buffer.slice(offset, offset + chunkSize);
      await writer.write(new Uint8Array(chunk));
      offset += chunkSize;
      setProgress(Math.min(100, Math.round((offset / total) * 100)));
    }
  } finally {
    writer.releaseLock();
  }
}

async function flash() {
  if (!browserSupport()) {
    log("WebSerial not supported. Use the CLI guide.");
    return;
  }
  if (!port) {
    await connectPort();
  }
  if (!port) return;

  try {
    setProgress(0);
    const buffer = await fetchFirmware();
    const ok = await verifySha(buffer);
    if (!ok) return;
    log("Streaming firmware to device...");
    await writeSerial(buffer);
    log("Flash complete. Reboot your device if needed.");
    setProgress(100);
  } catch (err) {
    log(`Flash failed: ${err.message || err}`);
  }
}

function init() {
  ui.firmwareName.textContent = firmwareName;
  ui.firmwareSha.textContent = firmwareSha ? firmwareSha.slice(0, 12) + "..." : "-";
  ui.browserStatus.textContent = browserSupport() ? "WebSerial supported" : "Not supported";

  ui.connect.addEventListener("click", connectPort);
  ui.flash.addEventListener("click", flash);

  if (!firmwareUrl) {
    log("No firmware URL provided. Use the catalog to launch this page.");
    ui.flash.disabled = true;
  }
}

init();
