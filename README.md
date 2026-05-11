# WebDFU

> 日本語のREADMEはこちらです: [README.ja.md](README.ja.md)

[
![NPM package](https://img.shields.io/npm/v/dfu)
](https://www.npmjs.com/package/dfu)
[
![CI in main branch](https://github.com/Flipper-Zero/webdfu/actions/workflows/main.yml/badge.svg)
](https://github.com/Flipper-Zero/webdfu/actions/workflows/main.yml)

A driver for working with DFU (Device Firmware Upgrade) and DfuSe devices in a browser over [WebUSB](https://wicg.github.io/webusb/) or [Web Bluetooth](https://webbluetoothcg.github.io/web-bluetooth/).

## Features

*   **Read & Write Firmware:** Perform upload and download operations on device firmware.
*   **DFU & DfuSe Support:** Compatible with the DFU 1.1 specification and STMicroelectronics DfuSe extensions.
*   **DFU Detach:** Switch devices from their runtime configuration to the DFU bootloader.
*   **Event-Driven Progress:** Track firmware operations with detailed progress events for erase, write, and read stages.

## Demo

A full-featured demo is available that allows you to read firmware from and write firmware to a connected DFU device.

*   **Live Demo:** [https://flipper-zero.github.io/webdfu/demo/](https://flipper-zero.github.io/webdfu/demo/)
*   **Run Locally:** Clone the repository and follow the instructions in the [demo/README.md](https://github.com/Flipper-Zero/webdfu/tree/main/demo).

## Installation

Install the package using npm:

```sh
npm install dfu
```

## Usage

The browser's security policy requires that WebUSB be initiated by a user action, such as a button click.

```javascript
import { WebDFU } from 'dfu';

// Add a button to your HTML: <button id="connect-button">Connect</button>
const connectButton = document.getElementById('connect-button');

connectButton.addEventListener('click', async () => {
  try {
    // Request a device from the user
    const device = await navigator.usb.requestDevice({ filters: [] });

    // Create a WebDFU instance
    const dfu = new WebDFU(device, { forceInterfacesName: true });
    await dfu.init();

    if (dfu.interfaces.length === 0) {
      throw new Error("The selected device does not have any DFU interfaces.");
    }

    // Connect to the first DFU interface
    await dfu.connect(0);
    console.log("Device properties:", dfu.properties);

    // Read firmware from the device
    const readProcess = dfu.read();
    
    readProcess.events.on('progress', (done, total) => {
      console.log(`Read: ${Math.round((done / total) * 100)}% complete`);
    });
    
    readProcess.events.on('end', (blob) => {
      console.log('Read complete!', blob);
      // The firmware is now in the 'blob' object.
    });

    readProcess.events.on('error', (error) => {
      console.error('Read error:', error);
    });

  } catch (error) {
    console.error('Failed to connect or perform DFU operation:', error);
  }
});
```

For a complete implementation with UI elements and DfuSe-specific fields, see the [demo source code](https://github.com/Flipper-Zero/webdfu/blob/main/demo/index.ts).

## API Reference

The `WebDFU` class provides methods for device interaction. These methods return a process object with an event emitter to track progress.

*   `dfu.read(xferSize, maxSize)`: Reads firmware from the device.
*   `dfu.write(xferSize, data, manifestationTolerant)`: Writes firmware to the device.

### Process Events

Listen to events on the returned process object:

*   **Read Process:** `progress`, `error`, `end(blob)`
*   **Write Process:** `erase/process`, `write/process`, `error`, `end()`

Detailed type definitions for all interfaces, descriptors, and events can be found in [core.ts](https://github.com/Flipper-Zero/webdfu/blob/main/core.ts).

## Development

To build the project locally, clone the repository and install the