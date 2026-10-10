/** Ninebot D18 BLE diagnostics. Read-only: does not send commands. */
class NinebotBLEProtocol {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.onData = null;
    this.onConnectionLost = null;
    this.SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    this.TX_CHARACTERISTIC = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  }
  async connect() {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth unavailable. Use Chrome on Android over HTTPS.');
    const device = await navigator.bluetooth.requestDevice({acceptAllDevices:true, optionalServices:[this.SERVICE_UUID]});
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.isConnected = false;
      if (this.onConnectionLost) this.onConnectionLost();
    });
    try {
      this.server = await device.gatt.connect();
      const service = await this.server.getPrimaryService(this.SERVICE_UUID);
      this.characteristic = await service.getCharacteristic(this.TX_CHARACTERISTIC);
      this.characteristic.addEventListener('characteristicvaluechanged', event => this.handleNotification(event));
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
  // Commands are intentionally unavailable until D18 protocol is verified.
  async sendCommand() { throw new Error('Writing to the scooter is disabled in diagnostic mode.'); }
  async readAllTelemetry() { /* Passive notifications only; no unverified reads sent. */ }
  async setMaxSpeed() { throw new Error('Speed changes are disabled in diagnostic mode.'); }
  async setDRL() { throw new Error('Settings changes are disabled in diagnostic mode.'); }
  async setVolume() { throw new Error('Settings changes are disabled in diagnostic mode.'); }
}
window.NinebotBLEProtocol = NinebotBLEProtocol;
