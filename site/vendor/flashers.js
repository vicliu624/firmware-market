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

window.FirmwareFlashers.esp32 = async ({ buffer, baudRate, requestPort, log, progress }) => {
  const port = await requestPort();
  const transport = new Transport(port);
  const loader = new ESPLoader({ transport, baudrate: baudRate, terminal: { log } });
  await loader.connect();
  await loader.flashData(buffer, 0x0, progress);
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
