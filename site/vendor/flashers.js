// Vendor adapters. Provide esptool-js and webdfu bundles under site/vendor
// to enable real flashing.
import { ESPLoader, Transport } from "esptool-js";

window.FirmwareFlashers = window.FirmwareFlashers || {};

let webdfuModulePromise = null;
async function loadWebDfu() {
  if (!webdfuModulePromise) {
    webdfuModulePromise = import("dfu");
  }
  return webdfuModulePromise;
}

function bufferToBinaryString(buffer) {
  const bytes = new Uint8Array(buffer);
  let result = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return result;
}

function parseOffset(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (text.startsWith("0x")) {
    const parsed = parseInt(text.slice(2), 16);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

window.FirmwareFlashers.esp32 = async ({ buffer, offset, baudRate, requestPort, port, log, progress }) => {
  const terminal = {
    log: (msg) => log(String(msg)),
    info: (msg) => log(String(msg)),
    warn: (msg) => log(String(msg)),
    error: (msg) => log(String(msg)),
    write: (msg) => log(String(msg)),
    writeLine: (msg) => log(String(msg)),
    writeln: (msg) => log(String(msg)),
    clean: () => {},
    clear: () => {}
  };

  const selectedPort = port || (await requestPort());
  let transport = null;

  try {
    transport = new Transport(selectedPort, true);
    const loader = new ESPLoader({ transport, baudrate: baudRate, terminal });

    try {
      await loader.main();
    } catch (err) {
      const message = String(err?.message || err || "");
      if (message.includes("already open")) {
        try {
          await selectedPort.close();
        } catch (closeErr) {
          // ignore close failures
        }
        await loader.main();
      } else {
        throw err;
      }
    }

    const binaryString = bufferToBinaryString(buffer);
    const address = parseOffset(offset) ?? 0x10000;
    log(`Flashing at 0x${address.toString(16)}...`);
    await loader.writeFlash({
      fileArray: [{ data: binaryString, address }],
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      flashMode: "keep",
      flashFreq: "keep",
      reportProgress: (fileIndex, written, total) => {
        if (typeof total === "number" && total > 0) {
          progress(Math.min(100, Math.round((written / total) * 100)));
        }
      }
    });

    try {
      await transport.setRTS(true);
      await new Promise((resolve) => setTimeout(resolve, 120));
      await transport.setRTS(false);
    } catch (err) {
      // ignore reset failures
    }
  } finally {
    if (transport) {
      try {
        await transport.disconnect();
      } catch (err) {
        // ignore disconnect failures
      }
    }
  }
};

window.FirmwareFlashers.stm32 = async ({ url, log, progress }) => {
  if (!navigator.usb) {
    throw new Error("WebUSB not supported in this browser");
  }
  const { WebDFU } = await loadWebDfu();
  const selectedDevice = await navigator.usb.requestDevice({ filters: [] });
  const webdfu = new WebDFU(selectedDevice, { forceInterfacesName: true });
  await webdfu.init();

  if (!webdfu.interfaces.length) {
    throw new Error("The selected device does not have any USB DFU interfaces.");
  }

  await webdfu.connect(0);

  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to download firmware");
  const buffer = await response.arrayBuffer();

  const transferSize = webdfu.properties?.TransferSize || 1024;
  const writer = webdfu.write(transferSize, buffer, true);

  await new Promise((resolve, reject) => {
    writer.events.on("write/process", (written, total) => {
      if (typeof total === "number" && total > 0) {
        progress(Math.min(100, Math.round((written / total) * 100)));
      }
    });
    writer.events.on("end", resolve);
    writer.events.on("error", reject);
  });
};
