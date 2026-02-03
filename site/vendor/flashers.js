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

window.FirmwareFlashers.esp32 = async ({ buffer, baudRate, requestPort, port, log, progress }) => {
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
  if (selectedPort?.readable || selectedPort?.writable) {
    try {
      await selectedPort.close();
    } catch (err) {
      // ignore if already closed
    }
  }

  const transport = new Transport(selectedPort, true);
  await transport.connect(baudRate);

  const loader = new ESPLoader({ transport, baudrate: baudRate, terminal });
  await loader.main();

  const binaryString = bufferToBinaryString(buffer);
  await loader.writeFlash({
    fileArray: [{ data: binaryString, address: 0x0 }],
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
