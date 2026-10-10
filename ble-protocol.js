/** Ninebot D18 BLE diagnostics. Read-only: does not send commands. */
class NinebotBLEProtocol {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.onData = null;
    this.onDiagnostic = null;
    this.notifyHandler = event => this.handleNotification(event);
    this.CUSTOM_SERVICE_UUID = '6e400001-0000-0000-006e-696e65626f74';
    this.INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
    this.onConnectionLost = null;
    this.SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    this.TX_CHARACTERISTIC = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  }
  async connect() {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth unavailable. Use Chrome on Android over HTTPS.');
    const device = await navigator.bluetooth.requestDevice({acceptAllDevices:true, optionalServices:[this.SERVICE_UUID, this.CUSTOM_SERVICE_UUID, this.INFO_SERVICE_UUID]});
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.isConnected = false;
      this.characteristic?.removeEventListener('characteristicvaluechanged', this.notifyHandler);
      if (this.onConnectionLost) this.onConnectionLost();
    });
    try {
      this.server = await device.gatt.connect();
      let service;
      try {
        service = await this.server.getPrimaryService(this.CUSTOM_SERVICE_UUID);
        this.characteristic = await service.getCharacteristic('6e400004-0000-0000-006e-696e65626f74');
      } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
        service = await this.server.getPrimaryService(this.SERVICE_UUID);
        this.characteristic = await service.getCharacteristic(this.TX_CHARACTERISTIC);
      }
      this.report('Using service ' + service.uuid + '; notify ' + this.characteristic.uuid);
      this.characteristic.addEventListener('characteristicvaluechanged', this.notifyHandler);
      await this.characteristic.startNotifications();
      this.isConnected = true;
      return true;
    } catch (error) {
      this.isConnected = false;
      if (device.gatt.connected) device.gatt.disconnect();
      throw error;
    }
  }
  handleNotification(event) {
    const value = event.target.value;
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const hex = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join(' ').toUpperCase();
    console.log('BLE notification:', hex);
    if (this.onData) this.onData(hex, Array.from(bytes));
  }
  async disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.isConnected = false;
  }
  report(message) { if (this.onDiagnostic) this.onDiagnostic(message); }
  async inspectServices() {
    if (!this.isConnected || !this.server?.connected) throw new Error('Connect to the scooter first.');
    const services = await this.server.getPrimaryServices();
    const names = {
      '00002a24-0000-1000-8000-00805f9b34fb': 'Model',
      '00002a26-0000-1000-8000-00805f9b34fb': 'Firmware',
      '00002a27-0000-1000-8000-00805f9b34fb': 'Hardware',
      '00002a28-0000-1000-8000-00805f9b34fb': 'Software',
      '00002a29-0000-1000-8000-00805f9b34fb': 'Manufacturer'
    };
    let infoRead = false;
    for (const service of services) {
      this.report('Service: ' + service.uuid);
      try {
        const characteristics = await service.getCharacteristics();
        for (const characteristic of characteristics) {
          const flags = ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter(key => characteristic.properties[key]);
          this.report('Characteristic: ' + characteristic.uuid + ' [' + flags.join(', ') + ']');
          if (service.uuid === this.INFO_SERVICE_UUID && names[characteristic.uuid] && characteristic.properties.read) {
            try {
              const value = await characteristic.readValue();
              const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
              this.report(names[characteristic.uuid] + ': ' + new TextDecoder().decode(bytes).replace(/\\0/g, ''));
              infoRead = true;
            } catch (error) { this.report('Could not read ' + names[characteristic.uuid] + ': ' + error.message); }
          }
        }
      } catch (error) { this.report('Could not inspect service: ' + error.message); }
    }
    if (!infoRead) this.report('No readable model/firmware details exposed.');
    this.report('Diagnostic check complete. Telemetry requests and authentication are not implemented; Bluetooth connection alone does not verify telemetry support.');
  }
  // Commands are intentionally unavailable until D18 protocol is verified.
  async sendCommand() { throw new Error('Writing to the scooter is disabled in diagnostic mode.'); }
  async readAllTelemetry() { /* Passive notifications only; no unverified reads sent. */ }
  async setMaxSpeed() { throw new Error('Speed changes are disabled in diagnostic mode.'); }
  async setDRL() { throw new Error('Settings changes are disabled in diagnostic mode.'); }
  async setVolume() { throw new Error('Settings changes are disabled in diagnostic mode.'); }
}
window.NinebotBLEProtocol = NinebotBLEProtocol;

