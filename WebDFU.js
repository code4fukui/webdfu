// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

let createNanoEvents = ()=>({
        events: {},
        emit (event, ...args) {
            let callbacks = this.events[event] || [];
            for(let i = 0, length = callbacks.length; i < length; i++){
                callbacks[i](...args);
            }
        },
        on (event, cb) {
            this.events[event]?.push(cb) || (this.events[event] = [
                cb
            ]);
            return ()=>{
                this.events[event] = this.events[event]?.filter((i)=>cb !== i);
            };
        }
    });
var DFUseCommands;
(function(DFUseCommands) {
    DFUseCommands[DFUseCommands["GET_COMMANDS"] = 0x00] = "GET_COMMANDS";
    DFUseCommands[DFUseCommands["SET_ADDRESS"] = 0x21] = "SET_ADDRESS";
    DFUseCommands[DFUseCommands["ERASE_SECTOR"] = 0x41] = "ERASE_SECTOR";
})(DFUseCommands || (DFUseCommands = {}));
const WebDFUType = {
    DFU: 1,
    SDFUse: 2
};
class WebDFUError extends Error {
}
function parseMemoryDescriptor(desc) {
    const nameEndIndex = desc.indexOf("/");
    if (!desc.startsWith("@") || nameEndIndex == -1) {
        throw new WebDFUError(`Not a DfuSe memory descriptor: "${desc}"`);
    }
    const name = desc.substring(1, nameEndIndex).trim();
    const segmentString = desc.substring(nameEndIndex);
    let segments = [];
    const sectorMultipliers = {
        " ": 1,
        B: 1,
        K: 1024,
        M: 1048576
    };
    let contiguousSegmentRegex = /\/\s*(0x[0-9a-fA-F]{1,8})\s*\/(\s*[0-9]+\s*\*\s*[0-9]+\s?[ BKM]\s*[abcdefg]\s*,?\s*)+/g;
    let contiguousSegmentMatch;
    while(contiguousSegmentMatch = contiguousSegmentRegex.exec(segmentString)){
        let segmentRegex = /([0-9]+)\s*\*\s*([0-9]+)\s?([ BKM])\s*([abcdefg])\s*,?\s*/g;
        let startAddress = parseInt(contiguousSegmentMatch?.[1] ?? "", 16);
        let segmentMatch;
        while(segmentMatch = segmentRegex.exec(contiguousSegmentMatch[0])){
            let sectorCount = parseInt(segmentMatch[1], 10);
            let sectorSize = parseInt(segmentMatch[2]) * (sectorMultipliers[segmentMatch?.[3] ?? ""] ?? 0);
            let properties = (segmentMatch?.[4] ?? "")?.charCodeAt(0) - "a".charCodeAt(0) + 1;
            let segment = {
                start: startAddress,
                sectorSize: sectorSize,
                end: startAddress + sectorSize * sectorCount,
                readable: (properties & 0x1) != 0,
                erasable: (properties & 0x2) != 0,
                writable: (properties & 0x4) != 0
            };
            segments.push(segment);
            startAddress += sectorSize * sectorCount;
        }
    }
    return {
        name,
        segments
    };
}
function parseDeviceDescriptor(data) {
    return {
        bLength: data.getUint8(0),
        bDescriptorType: data.getUint8(1),
        bcdUSB: data.getUint16(2, true),
        bDeviceClass: data.getUint8(4),
        bDeviceSubClass: data.getUint8(5),
        bDeviceProtocol: data.getUint8(6),
        bMaxPacketSize: data.getUint8(7),
        idVendor: data.getUint16(8, true),
        idProduct: data.getUint16(10, true),
        bcdDevice: data.getUint16(12, true),
        iManufacturer: data.getUint8(14),
        iProduct: data.getUint8(15),
        iSerialNumber: data.getUint8(16),
        bNumConfigurations: data.getUint8(17)
    };
}
function parseFunctionalDescriptor(data) {
    return {
        bLength: data.getUint8(0),
        bDescriptorType: data.getUint8(1),
        bmAttributes: data.getUint8(2),
        wDetachTimeOut: data.getUint16(3, true),
        wTransferSize: data.getUint16(5, true),
        bcdDFUVersion: data.getUint16(7, true)
    };
}
function parseInterfaceDescriptor(data) {
    return {
        bLength: data.getUint8(0),
        bDescriptorType: data.getUint8(1),
        bInterfaceNumber: data.getUint8(2),
        bAlternateSetting: data.getUint8(3),
        bNumEndpoints: data.getUint8(4),
        bInterfaceClass: data.getUint8(5),
        bInterfaceSubClass: data.getUint8(6),
        bInterfaceProtocol: data.getUint8(7),
        iInterface: data.getUint8(8),
        descriptors: []
    };
}
function parseSubDescriptors(descriptorData) {
    let remainingData = descriptorData;
    let descriptors = [];
    let currIntf;
    let inDfuIntf = false;
    while(remainingData.byteLength > 2){
        let bLength = remainingData.getUint8(0);
        let bDescriptorType = remainingData.getUint8(1);
        let descData = new DataView(remainingData.buffer.slice(0, bLength));
        if (bDescriptorType == 4) {
            currIntf = parseInterfaceDescriptor(descData);
            if (currIntf.bInterfaceClass == 0xfe && currIntf.bInterfaceSubClass == 0x01) {
                inDfuIntf = true;
            } else {
                inDfuIntf = false;
            }
            descriptors.push(currIntf);
        } else if (inDfuIntf && bDescriptorType == 0x21) {
            let funcDesc = parseFunctionalDescriptor(descData);
            descriptors.push(funcDesc);
            currIntf?.descriptors.push(funcDesc);
        } else {
            let desc = {
                bLength: bLength,
                bDescriptorType: bDescriptorType,
                descData: descData
            };
            descriptors.push(desc);
            if (currIntf) {
                currIntf.descriptors.push(desc);
            }
        }
        remainingData = new DataView(remainingData.buffer.slice(bLength));
    }
    return descriptors;
}
function parseConfigurationDescriptor(data) {
    let descriptorData = new DataView(data.buffer.slice(9));
    let descriptors = parseSubDescriptors(descriptorData);
    return {
        bLength: data.getUint8(0),
        bDescriptorType: data.getUint8(1),
        wTotalLength: data.getUint16(2, true),
        bNumInterfaces: data.getUint8(4),
        bConfigurationValue: data.getUint8(5),
        iConfiguration: data.getUint8(6),
        bmAttributes: data.getUint8(7),
        bMaxPower: data.getUint8(8),
        descriptors: descriptors
    };
}
export { DFUseCommands as DFUseCommands };
export { WebDFUType as WebDFUType };
export { WebDFUError as WebDFUError };
export { parseMemoryDescriptor as parseMemoryDescriptor };
export { parseDeviceDescriptor as parseDeviceDescriptor };
export { parseFunctionalDescriptor as parseFunctionalDescriptor };
export { parseInterfaceDescriptor as parseInterfaceDescriptor };
export { parseSubDescriptors as parseSubDescriptors };
export { parseConfigurationDescriptor as parseConfigurationDescriptor };
class WebDFUProcessRead {
    events = createNanoEvents();
}
class WebDFUProcessWrite {
    events = createNanoEvents();
}
class WebDFUProcessErase {
    events = createNanoEvents();
}
const dfuCommands = {
    DETACH: 0x00,
    DOWNLOAD: 0x01,
    UPLOAD: 0x02,
    GETSTATUS: 0x03,
    CLRSTATUS: 0x04,
    GETSTATE: 0x05,
    ABORT: 0x06,
    appIDLE: 0,
    appDETACH: 1,
    dfuIDLE: 2,
    dfuDOWNLOAD_SYNC: 3,
    dfuDNBUSY: 4,
    dfuDOWNLOAD_IDLE: 5,
    dfuMANIFEST_SYNC: 6,
    dfuMANIFEST: 7,
    dfuMANIFEST_WAIT_RESET: 8,
    dfuUPLOAD_IDLE: 9,
    dfuERROR: 10,
    STATUS_OK: 0x0
};
class WebDFU {
    events;
    interfaces;
    properties;
    connected;
    dfuseStartAddress;
    dfuseMemoryInfo;
    currentInterfaceSettings;
    constructor(device, settings = {}, log){
        this.device = device;
        this.settings = settings;
        this.log = log;
        this.events = createNanoEvents();
        this.interfaces = [];
        this.connected = false;
        this.dfuseStartAddress = NaN;
    }
    get type() {
        if (this.properties?.DFUVersion == 0x011a && this.currentInterfaceSettings?.alternate.interfaceProtocol == 0x02) {
            return WebDFUType.SDFUse;
        }
        return WebDFUType.DFU;
    }
    async init() {
        this.interfaces = await this.findDfuInterfaces();
        this.events.emit("init");
    }
    async connect(interfaceIndex) {
        if (!this.device.opened) {
            await this.device.open();
        }
        let desc = null;
        try {
            desc = await this.getDFUDescriptorProperties();
        } catch (error) {
            this.events.emit("disconnect", error);
            throw error;
        }
        const intrf = this.interfaces[interfaceIndex];
        if (!intrf) {
            throw new WebDFUError("Interface not found");
        }
        this.currentInterfaceSettings = intrf;
        if (this.currentInterfaceSettings.name) {
            this.dfuseMemoryInfo = parseMemoryDescriptor(this.currentInterfaceSettings.name);
        }
        if (desc) {
            this.properties = desc;
        }
        try {
            await this.open();
        } catch (error) {
            this.events.emit("disconnect", error);
            throw error;
        }
        this.events.emit("connect");
    }
    async close() {
        await this.device.close();
        this.events.emit("disconnect");
    }
    read(xferSize, maxSize) {
        if (!this) {
            throw new WebDFUError("Required initialized driver");
        }
        const process = new WebDFUProcessRead();
        try {
            let blob;
            if (this.type === WebDFUType.SDFUse) {
                blob = this.do_dfuse_read(process, xferSize, maxSize);
            } else {
                blob = this.do_read(process, xferSize, maxSize);
            }
            blob.then((data)=>process.events.emit("end", data)).catch((error)=>process.events.emit("error", error));
        } catch (error) {
            process.events.emit("error", error);
        }
        return process;
    }
    write(xfer_size, data, manifestationTolerant) {
        if (!this) {
            throw new WebDFUError("Required initialized driver");
        }
        let process = new WebDFUProcessWrite();
        setTimeout(()=>{
            try {
                let result;
                if (this.type === WebDFUType.SDFUse) {
                    result = this.do_dfuse_write(process, xfer_size, data);
                } else {
                    result = this.do_write(process, xfer_size, data, manifestationTolerant);
                }
                result.then(()=>process.events.emit("end")).catch((error)=>process.events.emit("error", error));
            } catch (error) {
                process.events.on("error", error);
            }
        }, 0);
        return process;
    }
    async getDFUDescriptorProperties() {
        const data = await this.readConfigurationDescriptor(0);
        let configDesc = parseConfigurationDescriptor(data);
        let funcDesc = null;
        let configValue = this.device.configuration?.configurationValue;
        if (configDesc.bConfigurationValue == configValue) {
            for (let desc of configDesc.descriptors){
                if (desc.bDescriptorType == 0x21 && desc.hasOwnProperty("bcdDFUVersion")) {
                    funcDesc = desc;
                    break;
                }
            }
        }
        if (!funcDesc) {
            return null;
        }
        return {
            WillDetach: (funcDesc.bmAttributes & 0x08) != 0,
            ManifestationTolerant: (funcDesc.bmAttributes & 0x04) != 0,
            CanUpload: (funcDesc.bmAttributes & 0x02) != 0,
            CanDownload: (funcDesc.bmAttributes & 0x01) != 0,
            TransferSize: funcDesc.wTransferSize,
            DetachTimeOut: funcDesc.wDetachTimeOut,
            DFUVersion: funcDesc.bcdDFUVersion
        };
    }
    async findDfuInterfaces() {
        const interfaces = [];
        for (let conf of this.device.configurations){
            for (let intf of conf.interfaces){
                for (let alt of intf.alternates){
                    if (alt.interfaceClass == 0xfe && alt.interfaceSubclass == 0x01 && (alt.interfaceProtocol == 0x01 || alt.interfaceProtocol == 0x02)) {
                        interfaces.push({
                            configuration: conf,
                            interface: intf,
                            alternate: alt,
                            name: alt.interfaceName
                        });
                    }
                }
            }
        }
        if (this.settings.forceInterfacesName) {
            await this.fixInterfaceNames(interfaces);
        }
        return interfaces;
    }
    async fixInterfaceNames(interfaces) {
        if (interfaces.some((intf)=>intf.name == null)) {
            await this.device.open();
            await this.device.selectConfiguration(1);
            let mapping = await this.readInterfaceNames();
            for (let intf of interfaces){
                if (intf.name === null) {
                    let configIndex = intf.configuration.configurationValue;
                    let intfNumber = intf["interface"].interfaceNumber;
                    let alt = intf.alternate.alternateSetting;
                    intf.name = mapping?.[configIndex]?.[intfNumber]?.[alt]?.toString();
                }
            }
        }
    }
    async readStringDescriptor(index, langID = 0) {
        const wValue = 0x03 << 8 | index;
        const request_setup = {
            requestType: "standard",
            recipient: "device",
            request: 0x06,
            value: wValue,
            index: langID
        };
        let result = await this.device.controlTransferIn(request_setup, 1);
        if (result.data && result.status == "ok") {
            const bLength = result.data.getUint8(0);
            result = await this.device.controlTransferIn(request_setup, bLength);
            if (result.data && result.status == "ok") {
                const len = (bLength - 2) / 2;
                let u16_words = [];
                for(let i = 0; i < len; i++){
                    u16_words.push(result.data.getUint16(2 + i * 2, true));
                }
                if (langID == 0) {
                    return u16_words;
                } else {
                    return String.fromCharCode.apply(String, u16_words);
                }
            }
        }
        throw new WebDFUError(`Failed to read string descriptor ${index}: ${result.status}`);
    }
    async readDeviceDescriptor() {
        const wValue = 0x01 << 8;
        const result = await this.device.controlTransferIn({
            requestType: "standard",
            recipient: "device",
            request: 0x06,
            value: wValue,
            index: 0
        }, 18);
        if (!result.data || result.status !== "ok") {
            throw new WebDFUError(`Failed to read device descriptor: ${result.status}`);
        }
        return result.data;
    }
    async readInterfaceNames() {
        let configs = {};
        let allStringIndices = new Set();
        for(let configIndex = 0; configIndex < this.device.configurations.length; configIndex++){
            const rawConfig = await this.readConfigurationDescriptor(configIndex);
            let configDesc = parseConfigurationDescriptor(rawConfig);
            let configValue = configDesc.bConfigurationValue;
            configs[configValue] = {};
            for (let desc of configDesc.descriptors){
                if (desc.bDescriptorType === 4) {
                    desc = desc;
                    if (!configs[configValue]?.[desc.bInterfaceNumber]) {
                        configs[configValue][desc.bInterfaceNumber] = {};
                    }
                    configs[configValue][desc.bInterfaceNumber][desc.bAlternateSetting] = desc.iInterface;
                    if (desc.iInterface > 0) {
                        allStringIndices.add(desc.iInterface);
                    }
                }
            }
        }
        let strings = {};
        for (let index of allStringIndices){
            try {
                strings[index] = await this.readStringDescriptor(index, 0x0409);
            } catch (error) {
                console.log(error);
                strings[index] = null;
            }
        }
        for (let config of Object.values(configs)){
            for (let intf of Object.values(config)){
                for(let alt in intf){
                    intf[alt] = strings[intf[alt]];
                }
            }
        }
        return configs;
    }
    async readConfigurationDescriptor(index) {
        const wValue = 0x02 << 8 | index;
        const setup = {
            requestType: "standard",
            recipient: "device",
            request: 0x06,
            value: wValue,
            index: 0
        };
        const descriptorSize = await this.device.controlTransferIn(setup, 4);
        if (!descriptorSize.data || descriptorSize.status !== "ok") {
            throw new WebDFUError(`controlTransferIn error. [status]: ${descriptorSize.status}`);
        }
        let wLength = descriptorSize.data.getUint16(2, true);
        const descriptor = await this.device.controlTransferIn(setup, wLength);
        if (!descriptor.data || descriptor.status !== "ok") {
            throw new WebDFUError(`controlTransferIn error. [status]: ${descriptor.status}`);
        }
        return descriptor.data;
    }
    async open() {
        if (!this.currentInterfaceSettings) {
            throw new WebDFUError("Required selected interface");
        }
        const confValue = this.currentInterfaceSettings.configuration.configurationValue;
        if (!this.device.configuration || this.device.configuration.configurationValue !== confValue) {
            await this.device.selectConfiguration(confValue);
        }
        if (!this.device.configuration) {
            throw new WebDFUError(`Couldn't select the configuration '${confValue}'`);
        }
        const intfNumber = this.currentInterfaceSettings["interface"].interfaceNumber;
        if (!this.device.configuration.interfaces[intfNumber]?.claimed) {
            await this.device.claimInterface(intfNumber);
        }
        const altSetting = this.currentInterfaceSettings.alternate.alternateSetting;
        let intf = this.device.configuration.interfaces[intfNumber];
        if (!intf?.alternate || intf.alternate.alternateSetting != altSetting) {
            await this.device.selectAlternateInterface(intfNumber, altSetting);
        }
    }
    detach() {
        return this.requestOut(dfuCommands.DETACH, undefined, 1000);
    }
    abort() {
        return this.requestOut(dfuCommands.ABORT);
    }
    async waitDisconnected(timeout) {
        let device = this;
        let usbDevice = this.device;
        return new Promise((resolve, reject)=>{
            let timeoutID;
            function onDisconnect(event) {
                if (event.device === usbDevice) {
                    if (timeout > 0) {
                        clearTimeout(timeoutID);
                    }
                    device.connected = false;
                    navigator.usb.removeEventListener("disconnect", onDisconnect);
                    event.stopPropagation();
                    resolve(device);
                }
            }
            if (timeout > 0) {
                timeoutID = window.setTimeout(()=>{
                    navigator.usb.removeEventListener("disconnect", onDisconnect);
                    if (device.connected) {
                        reject("Disconnect timeout expired");
                    }
                }, timeout);
            } else {
                navigator.usb.addEventListener("disconnect", onDisconnect);
            }
        });
    }
    async isError() {
        try {
            const state = await this.getStatus();
            if (!state) {
                return true;
            }
            return state?.state == dfuCommands.dfuERROR;
        } catch (_) {
            return true;
        }
    }
    getState() {
        return this.requestIn(dfuCommands.GETSTATE, 1).then((data)=>Promise.resolve(data.getUint8(0)), (error)=>Promise.reject("DFU GETSTATE failed: " + error));
    }
    getStatus() {
        return this.requestIn(dfuCommands.GETSTATUS, 6).then((data)=>Promise.resolve({
                status: data.getUint8(0),
                pollTimeout: data.getUint32(1, true) & 0xffffff,
                state: data.getUint8(4)
            }), (error)=>Promise.reject("DFU GETSTATUS failed: " + error));
    }
    clearStatus() {
        return this.requestOut(dfuCommands.CLRSTATUS);
    }
    get intfNumber() {
        if (!this.currentInterfaceSettings) {
            throw new WebDFUError("Required selected interface");
        }
        return this.currentInterfaceSettings.interface.interfaceNumber;
    }
    async requestOut(bRequest, data, wValue = 0) {
        try {
            const result = await this.device.controlTransferOut({
                requestType: "class",
                recipient: "interface",
                request: bRequest,
                value: wValue,
                index: this.intfNumber
            }, data);
            if (result.status !== "ok") {
                throw new WebDFUError(result.status);
            }
            return result.bytesWritten;
        } catch (error) {
            throw new WebDFUError("ControlTransferOut failed: " + error);
        }
    }
    async requestIn(bRequest, wLength, wValue = 0) {
        try {
            const result = await this.device.controlTransferIn({
                requestType: "class",
                recipient: "interface",
                request: bRequest,
                value: wValue,
                index: this.intfNumber
            }, wLength);
            if (result.status !== "ok" || !result.data) {
                throw new WebDFUError(result.status);
            }
            return result.data;
        } catch (error) {
            throw new WebDFUError("ControlTransferIn failed: " + error);
        }
    }
    download(data, blockNum) {
        return this.requestOut(dfuCommands.DOWNLOAD, data, blockNum);
    }
    upload(length, blockNum) {
        return this.requestIn(dfuCommands.UPLOAD, length, blockNum);
    }
    async abortToIdle() {
        await this.abort();
        let state = await this.getState();
        if (state == dfuCommands.dfuERROR) {
            await this.clearStatus();
            state = await this.getState();
        }
        if (state != dfuCommands.dfuIDLE) {
            throw new WebDFUError("Failed to return to idle state after abort: state " + state);
        }
    }
    async poll_until(state_predicate) {
        let dfu_status = await this.getStatus();
        function async_sleep(duration_ms) {
            return new Promise((resolve)=>{
                setTimeout(resolve, duration_ms);
            });
        }
        while(!state_predicate(dfu_status.state) && dfu_status.state != dfuCommands.dfuERROR){
            await async_sleep(dfu_status.pollTimeout);
            dfu_status = await this.getStatus();
        }
        return dfu_status;
    }
    poll_until_idle(idle_state) {
        return this.poll_until((state)=>state == idle_state);
    }
    async do_read(process, xfer_size, max_size = Infinity, first_block = 0) {
        let transaction = first_block;
        let blocks = [];
        let bytes_read = 0;
        process.events.emit("process", 0);
        let result;
        let bytes_to_read;
        do {
            bytes_to_read = Math.min(xfer_size, max_size - bytes_read);
            result = await this.upload(bytes_to_read, transaction++);
            if (result.byteLength > 0) {
                blocks.push(result);
                bytes_read += result.byteLength;
            }
            process.events.emit("process", bytes_read, Number.isFinite(max_size) ? max_size : undefined);
        }while (bytes_read < max_size && result.byteLength == bytes_to_read)
        if (bytes_read == max_size) {
            await this.abortToIdle();
        }
        return new Blob(blocks, {
            type: "application/octet-stream"
        });
    }
    async do_write(process, xfer_size, data, manifestationTolerant = true) {
        let bytes_sent = 0;
        let expected_size = data.byteLength;
        let transaction = 0;
        process.events.emit("write/start");
        process.events.emit("write/process", bytes_sent, expected_size);
        while(bytes_sent < expected_size){
            const bytes_left = expected_size - bytes_sent;
            const chunk_size = Math.min(bytes_left, xfer_size);
            let bytes_written = 0;
            let dfu_status;
            try {
                bytes_written = await this.download(data.slice(bytes_sent, bytes_sent + chunk_size), transaction++);
                dfu_status = await this.poll_until_idle(dfuCommands.dfuDOWNLOAD_IDLE);
            } catch (error) {
                throw new WebDFUError("Error during DFU download: " + error);
            }
            if (dfu_status.status != dfuCommands.STATUS_OK) {
                throw new WebDFUError(`DFU DOWNLOAD failed state=${dfu_status.state}, status=${dfu_status.status}`);
            }
            bytes_sent += bytes_written;
            process.events.emit("write/process", bytes_sent, expected_size);
        }
        try {
            await this.download(new ArrayBuffer(0), transaction++);
        } catch (error) {
            throw new WebDFUError("Error during final DFU download: " + error);
        }
        process.events.emit("write/end", bytes_sent);
        if (manifestationTolerant) {
            let dfu_status;
            try {
                dfu_status = await this.poll_until((state)=>state == dfuCommands.dfuIDLE || state == dfuCommands.dfuMANIFEST_WAIT_RESET);
                if (dfu_status.status != dfuCommands.STATUS_OK) {
                    throw new WebDFUError(`DFU MANIFEST failed state=${dfu_status.state}, status=${dfu_status.status}`);
                }
            } catch (error) {
                if (error.endsWith("ControlTransferIn failed: NotFoundError: Device unavailable.") || error.endsWith("ControlTransferIn failed: NotFoundError: The device was disconnected.")) {
                    this.log.warning("Unable to poll final manifestation status");
                } else {
                    throw new WebDFUError("Error during DFU manifest: " + error);
                }
            }
        } else {
            try {
                await this.getStatus();
            } catch (error) {}
        }
        try {
            await this.device.reset();
        } catch (error) {
            if (error == "NetworkError: Unable to reset the device." || error == "NotFoundError: Device unavailable." || error == "NotFoundError: The device was disconnected.") {} else {
                throw new WebDFUError("Error during reset for manifestation: " + error);
            }
        }
    }
    async do_dfuse_write(process, xfer_size, data) {
        if (!this.dfuseMemoryInfo || !this.dfuseMemoryInfo.segments) {
            throw new WebDFUError("No memory map available");
        }
        process.events.emit("erase/start");
        let bytes_sent = 0;
        let expected_size = data.byteLength;
        let startAddress = this.dfuseStartAddress;
        if (isNaN(startAddress)) {
            startAddress = this.dfuseMemoryInfo.segments[0]?.start;
            if (!startAddress) {
                throw new WebDFUError("startAddress not found");
            }
            this.log.warning("Using inferred start address 0x" + startAddress.toString(16));
        } else if (this.getDfuseSegment(startAddress) === null && data.byteLength !== 0) {
            throw new WebDFUError(`Start address 0x${startAddress.toString(16)} outside of memory map bounds`);
        }
        await new Promise((resolve, reject)=>{
            if (!startAddress) {
                reject(new WebDFUError("startAddress not found"));
                return;
            }
            const ev = this.erase(startAddress, expected_size);
            ev.events.on("process", (...args)=>process.events.emit("erase/process", ...args));
            ev.events.on("error", reject);
            ev.events.on("end", ()=>{
                process.events.emit("erase/end");
                resolve();
            });
        });
        process.events.emit("write/start");
        let address = startAddress;
        while(bytes_sent < expected_size){
            const bytes_left = expected_size - bytes_sent;
            const chunk_size = Math.min(bytes_left, xfer_size);
            let bytes_written = 0;
            let dfu_status;
            try {
                await this.dfuseCommand(DFUseCommands.SET_ADDRESS, address, 4);
                bytes_written = await this.download(data.slice(bytes_sent, bytes_sent + chunk_size), 2);
                dfu_status = await this.poll_until_idle(dfuCommands.dfuDOWNLOAD_IDLE);
                address += chunk_size;
            } catch (error) {
                throw new WebDFUError("Error during DfuSe download: " + error);
            }
            if (dfu_status.status != dfuCommands.STATUS_OK) {
                throw new WebDFUError(`DFU DOWNLOAD failed state=${dfu_status.state}, status=${dfu_status.status}`);
            }
            bytes_sent += bytes_written;
            process.events.emit("write/process", bytes_sent, expected_size);
        }
        process.events.emit("write/end", bytes_sent);
        try {
            await this.dfuseCommand(DFUseCommands.SET_ADDRESS, startAddress, 4);
            await this.download(new ArrayBuffer(0), 0);
        } catch (error) {
            throw new WebDFUError("Error during DfuSe manifestation: " + error);
        }
        await this.poll_until((state)=>state == dfuCommands.dfuMANIFEST);
    }
    async do_dfuse_read(process, xfer_size, max_size = Infinity) {
        if (!this.dfuseMemoryInfo) {
            throw new WebDFUError("Unknown a DfuSe memory info");
        }
        let startAddress = this.dfuseStartAddress;
        if (isNaN(startAddress)) {
            startAddress = this.dfuseMemoryInfo.segments[0]?.start;
            if (!startAddress) {
                throw new WebDFUError("Unknown memory segments");
            }
            this.log.warning("Using inferred start address 0x" + startAddress.toString(16));
        } else if (this.getDfuseSegment(startAddress) === null) {
            this.log.warning(`Start address 0x${startAddress.toString(16)} outside of memory map bounds`);
        }
        let state = await this.getState();
        if (state != dfuCommands.dfuIDLE) {
            await this.abortToIdle();
        }
        await this.dfuseCommand(DFUseCommands.SET_ADDRESS, startAddress, 4);
        await this.abortToIdle();
        return await this.do_read(process, xfer_size, max_size, 2);
    }
    getDfuseSegment(addr) {
        if (!this.dfuseMemoryInfo || !this.dfuseMemoryInfo.segments) {
            throw new WebDFUError("No memory map information available");
        }
        for (let segment of this.dfuseMemoryInfo.segments){
            if (segment.start <= addr && addr < segment.end) {
                return segment;
            }
        }
        return null;
    }
    getDfuseFirstWritableSegment() {
        if (!this.dfuseMemoryInfo || !this.dfuseMemoryInfo.segments) {
            throw new WebDFUError("No memory map information available");
        }
        for (let segment of this.dfuseMemoryInfo.segments){
            if (segment.writable) {
                return segment;
            }
        }
        return null;
    }
    getDfuseMaxReadSize(startAddr) {
        if (!this.dfuseMemoryInfo || !this.dfuseMemoryInfo.segments) {
            throw new WebDFUError("No memory map information available");
        }
        let numBytes = 0;
        for (let segment of this.dfuseMemoryInfo.segments){
            if (segment.start <= startAddr && startAddr < segment.end) {
                if (segment.readable) {
                    numBytes += segment.end - startAddr;
                } else {
                    return 0;
                }
            } else if (segment.start == startAddr + numBytes) {
                if (segment.readable) {
                    numBytes += segment.end - segment.start;
                } else {
                    break;
                }
            }
        }
        return numBytes;
    }
    getDfuseSectorStart(addr, segment) {
        if (typeof segment === "undefined") {
            segment = this.getDfuseSegment(addr);
        }
        if (!segment) {
            throw new WebDFUError(`Address ${addr.toString(16)} outside of memory map`);
        }
        const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
        return segment.start + sectorIndex * segment.sectorSize;
    }
    getDfuseSectorEnd(addr, segment = this.getDfuseSegment(addr)) {
        if (!segment) {
            throw new WebDFUError(`Address ${addr.toString(16)} outside of memory map`);
        }
        const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
        return segment.start + (sectorIndex + 1) * segment.sectorSize;
    }
    erase(startAddr, length) {
        const process = new WebDFUProcessErase();
        const that = this;
        void (async function() {
            let segment = that.getDfuseSegment(startAddr);
            let addr = that.getDfuseSectorStart(startAddr, segment);
            const endAddr = that.getDfuseSectorEnd(startAddr + length - 1);
            if (!segment) {
                throw new WebDFUError("Unknown segment");
            }
            let bytesErased = 0;
            const bytesToErase = endAddr - addr;
            if (bytesToErase > 0) {
                process.events.emit("process", bytesErased, bytesToErase);
            }
            while(addr < endAddr){
                if ((segment?.end ?? 0) <= addr) {
                    segment = that.getDfuseSegment(addr);
                }
                if (!segment?.erasable) {
                    bytesErased = Math.min(bytesErased + (segment?.end ?? 0) - addr, bytesToErase);
                    addr = segment?.end ?? 0;
                } else {
                    const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
                    const sectorAddr = segment.start + sectorIndex * segment.sectorSize;
                    await that.dfuseCommand(DFUseCommands.ERASE_SECTOR, sectorAddr, 4);
                    addr = sectorAddr + segment.sectorSize;
                    bytesErased += segment.sectorSize;
                }
                process.events.emit("process", bytesErased, bytesToErase);
            }
        })().then(()=>process.events.emit("end")).catch((error)=>process.events.emit("error", error));
        return process;
    }
    async dfuseCommand(command, param = 0x00, len = 1) {
        const commandNames = {
            [DFUseCommands.GET_COMMANDS]: "GET_COMMANDS",
            [DFUseCommands.SET_ADDRESS]: "SET_ADDRESS",
            [DFUseCommands.ERASE_SECTOR]: "ERASE_SECTOR"
        };
        let payload = new ArrayBuffer(len + 1);
        let view = new DataView(payload);
        view.setUint8(0, command);
        if (len == 1) {
            view.setUint8(1, param);
        } else if (len == 4) {
            view.setUint32(1, param, true);
        } else {
            throw new WebDFUError("Don't know how to handle data of len " + len);
        }
        try {
            await this.download(payload, 0);
        } catch (error) {
            throw new WebDFUError("Error during special DfuSe command " + commandNames[command] + ":" + error);
        }
        let status = await this.poll_until((state)=>state != dfuCommands.dfuDNBUSY);
        if (status.status != dfuCommands.STATUS_OK) {
            throw new WebDFUError("Special DfuSe command " + command + " failed");
        }
    }
    device;
    settings;
    log;
}
export { dfuCommands as dfuCommands };
export { WebDFU as WebDFU };
