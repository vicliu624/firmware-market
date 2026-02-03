# Flashing Guide (CLI)

Use the method appropriate for your device and bootloader. Always verify board, region, and partition layout before flashing.

## ESP32 (esptool.py)

```
esptool.py --chip esp32 --port COM3 --baud 921600 write_flash 0x0 firmware.bin
```

## STM32 (dfu-util)

```
dfu-util -a 0 -s 0x08000000:leave -D firmware.bin
```

## SAMD (bossac)

```
bossac -i -d --port=COM3 -U -w -v -R firmware.bin
```

## Nordic (nrfjprog)

```
nrfjprog --program firmware.hex --reset
```

## UF2 Drag and Drop

If your device exposes a USB mass storage volume, copy the `.uf2` file to the drive.

## Safety Notes

- Flashing the wrong firmware can brick your device
- Verify SHA256 when possible
- Keep a known-good release for rollback
