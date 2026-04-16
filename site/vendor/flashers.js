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

async function connectEspLoader(selectedPort, baudRate, terminal) {
  let transport = new Transport(selectedPort, true);
  let loader = new ESPLoader({ transport, baudrate: baudRate, terminal });

  try {
    await loader.main();
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
    await loader.main();
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

function padBytes(bytes, multiple, padValue = 0xff) {
  const remainder = bytes.length % multiple;
  if (remainder === 0) return bytes;
  const padding = new Uint8Array(multiple - remainder).fill(padValue);
  const result = new Uint8Array(bytes.length + padding.length);
  result.set(bytes);
  result.set(padding, bytes.length);
  return result;
}

async function writeEspFlash(loader, binaryString, address, progress, compress) {
  if (!compress) {
    const image = loader._updateImageFlashParams(
      loader.ui8ToBstr(padBytes(loader.bstrToUi8(binaryString), 4)),
      address,
      "keep",
      "keep",
      "keep"
    );
    const imageBytes = loader.bstrToUi8(image);
    const total = imageBytes.length;
    const blocks = await loader.flashBegin(total, address);
    const startedAt = Date.now();
    let written = 0;

    progress(0);
    for (let seq = 0; seq < blocks; seq += 1) {
      const offset = seq * loader.FLASH_WRITE_SIZE;
      const chunk = imageBytes.slice(offset, offset + loader.FLASH_WRITE_SIZE);
      const timeout = Math.max(3000, loader.timeoutPerMb(loader.ERASE_WRITE_TIMEOUT_PER_MB, chunk.length));
      loader.info(`Writing at 0x${(address + written).toString(16)}... (${Math.floor(((seq + 1) / blocks) * 100)}%)`);
      await loader.flashBlock(chunk, seq, timeout);
      written += chunk.length;
      progress(Math.min(100, Math.round((written / total) * 100)));
    }

    if (loader.IS_STUB) {
      await loader.readReg(loader.CHIP_DETECT_MAGIC_REG_ADDR, Math.max(3000, loader.timeoutPerMb(loader.ERASE_WRITE_TIMEOUT_PER_MB, total)));
      await loader.flashBegin(0, 0);
    }
    await loader.flashFinish();
    loader.info(`Wrote ${total} bytes at 0x${address.toString(16)} in ${((Date.now() - startedAt) / 1000).toFixed(1)} seconds.`);
    return;
  }

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

function shouldUseCompressedFlash(buffer) {
  const size = buffer?.byteLength || 0;
  return size > 0 && size < 2 * 1024 * 1024;
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
    const useCompression = shouldUseCompressedFlash(buffer);
    session = await connectEspLoader(selectedPort, baudRate, terminal);

    if (!useCompression) {
      log("Large firmware detected. Using uncompressed flash for stability.");
      log(`Flashing at 0x${address.toString(16)} without compression...`);
      await writeEspFlash(session.loader, binaryString, address, progress, false);
    } else {
      try {
        log(`Flashing at 0x${address.toString(16)} with compression...`);
        await writeEspFlash(session.loader, binaryString, address, progress, true);
      } catch (err) {
        const message = String(err?.message || err || "");
        log(`Compressed flash failed: ${message}`);
        log("Reconnecting and retrying without compression...");
        progress(0);

        await disconnectEspTransport(session.transport);
        session = await connectEspLoader(selectedPort, baudRate, terminal);

        try {
          log(`Flashing at 0x${address.toString(16)} without compression...`);
          await writeEspFlash(session.loader, binaryString, address, progress, false);
        } catch (retryErr) {
          const retryMessage = String(retryErr?.message || retryErr || "");
          throw new Error(`${retryMessage} (compressed attempt also failed: ${message})`);
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
