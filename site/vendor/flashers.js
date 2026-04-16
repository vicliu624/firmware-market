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

async function initializeEspLoader(loader, useStub, resetMode = "default_reset") {
  if (useStub) {
    await loader.main(resetMode);
    return;
  }

  await loader.detectChip(resetMode);
  const chipDescription = await loader.chip.getChipDescription(loader);
  loader.info(`Chip is ${chipDescription}`);
  loader.info(`Features: ${await loader.chip.getChipFeatures(loader)}`);
  loader.info(`Crystal is ${await loader.chip.getCrystalFreq(loader)}MHz`);
  loader.info(`MAC: ${await loader.chip.readMac(loader)}`);
  if (typeof loader.chip.postConnect === "function") {
    await loader.chip.postConnect(loader);
  }
  loader.info("Stub disabled. Using ROM bootloader.");
  if (loader.romBaudrate !== loader.baudrate) {
    await loader.changeBaud();
  }
}

async function connectEspLoader(selectedPort, baudRate, terminal, useStub) {
  let transport = new Transport(selectedPort, true);
  let loader = new ESPLoader({ transport, baudrate: baudRate, terminal });

  try {
    await initializeEspLoader(loader, useStub);
  } catch (err) {
    const message = String(err?.message || err || "");
    if (!message.includes("already open")) {
      throw err;
    }

    try {
      await selectedPort.close();
    } catch (closeErr) {
      // ignore close failures
    }

    transport = new Transport(selectedPort, true);
    loader = new ESPLoader({ transport, baudrate: baudRate, terminal });
    await initializeEspLoader(loader, useStub);
  }

  return { transport, loader };
}

async function disconnectEspTransport(transport) {
  if (!transport) return;
  try {
    await transport.disconnect();
  } catch (err) {
    // ignore disconnect failures
  }
}

async function resetEspTransport(transport) {
  if (!transport) return;
  try {
    await transport.setRTS(true);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await transport.setRTS(false);
  } catch (err) {
    // ignore reset failures
  }
}

async function writeEspFlash(loader, binaryString, address, progress, compress) {
  await loader.writeFlash({
    fileArray: [{ data: binaryString, address }],
    flashSize: "keep",
    eraseAll: false,
    compress,
    flashMode: "keep",
    flashFreq: "keep",
    reportProgress: (fileIndex, written, total) => {
      if (typeof total === "number" && total > 0) {
        progress(Math.min(100, Math.round((written / total) * 100)));
      }
    }
  });
}

function shouldPreferRomLoader(buffer) {
  const size = buffer?.byteLength || 0;
  return size >= 2 * 1024 * 1024;
}

function isCompressedWriteError(message) {
  const text = String(message || "");
  return text.includes("Failed to write compressed data to flash");
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
  let session = null;

  try {
    const binaryString = bufferToBinaryString(buffer);
    const address = parseOffset(offset) ?? 0x10000;
    const preferRomLoader = shouldPreferRomLoader(buffer);
    const useStub = !preferRomLoader;
    session = await connectEspLoader(selectedPort, baudRate, terminal, useStub);

    if (preferRomLoader) {
      log("Large firmware detected. Using ROM bootloader for stability.");
      log(`Flashing at 0x${address.toString(16)} with compression (ROM bootloader)...`);
      await writeEspFlash(session.loader, binaryString, address, progress, true);
    } else {
      try {
        log(`Flashing at 0x${address.toString(16)} with compression...`);
        await writeEspFlash(session.loader, binaryString, address, progress, true);
      } catch (err) {
        const message = String(err?.message || err || "");
        if (!isCompressedWriteError(message)) {
          throw err;
        }

        log(`Compressed flash failed: ${message}`);
        log("Reconnecting and retrying with ROM bootloader...");
        progress(0);

        await disconnectEspTransport(session.transport);
        session = await connectEspLoader(selectedPort, baudRate, terminal, false);

        try {
          log(`Flashing at 0x${address.toString(16)} with compression (ROM bootloader)...`);
          await writeEspFlash(session.loader, binaryString, address, progress, true);
        } catch (retryErr) {
          const retryMessage = String(retryErr?.message || retryErr || "");
          throw new Error(`${retryMessage} (stub attempt also failed: ${message})`);
        }
      }
    }

    await resetEspTransport(session.transport);
  } finally {
    await disconnectEspTransport(session?.transport);
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
