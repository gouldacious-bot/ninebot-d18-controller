/** Ninebot D18 BLE protocol — discovery fix only. Control commands are unverified. */
class NinebotBLEProtocol {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    this.RX_CHARACTERISTIC = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
    this.TX_CHARACTERISTIC = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
    this.PARAM_SPEED = 0x74;
    this.PARAM_BATTERY = 0x61;
    this.PARAM_DISTANCE = 0x65;
    this.PARAM_TEMP = 0x71;
    this.PARAM_CURRENT_SPEED = 0x56;
    this.PARAM_MODE = 0x7C;
  }
  async connect() {
    try {
      const options = {acceptAllDevices: true, optionalServices: [this.SERVICE_UUID]};
      this.device = await navigator.bluetooth.requestDevice(options);
      console.log('Device found:', this.device.name);
      this.device.addEventListener('gattserverdisconnected', () => this.onDisconnected());
      this.server = await this.device.gatt.connect();
      const service = await this.server.getPrimaryService(this.SERVICE_UUID);
      this.characteristic = await service.getCharacteristic(this.TX_CHARACTERISTIC);
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', e => this.handleNotification(e));
      this.isConnected = true;
      return true;
    } catch (error) { this.isConnected = false; throw error; }
  }
  async disconnect() { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); this.isConnected = false; }
  handleNotification(event) { const value = event.target.value; const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength); console.log('Received:', Array.from(data).map(x => x.toString(16)).join(' ')); }
  onDisconnected() { this.isConnected = false; }
  async sendCommand(data) { if (!this.isConnected || !this.characteristic) throw new Error('Not connected to scooter'); const service = await this.server.getPrimaryService(this.SERVICE_UUID); const rxChar = await service.getCharacteristic(this.RX_CHARACTERISTIC); await rxChar.writeValue(data); }
  buildReadCommand(paramId) { return new Uint8Array([0x01, paramId]); }
  buildWriteCommand(paramId, value) { const cmd = new Uint8Array(2 + value.length); cmd[0] = 0x02; cmd[1] = paramId; cmd.set(value, 2); return cmd; }
  async readBattery() { await this.sendCommand(this.buildReadCommand(this.PARAM_BATTERY)); }
  async readCurrentSpeed() { await this.sendCommand(this.buildReadCommand(this.PARAM_CURRENT_SPEED)); }
  async readMaxSpeed() { await this.sendCommand(this.buildReadCommand(this.PARAM_SPEED)); }
  async readDistance() { await this.sendCommand(this.buildReadCommand(this.PARAM_DISTANCE)); }
  async readTemperature() { await this.sendCommand(this.buildReadCommand(this.PARAM_TEMP)); }
  async setMaxSpeed(speed) { if (speed < 20 || speed > 55) throw new Error('Speed must be between 20 and 55 km/h'); const speedInt = Math.round(speed * 100); await this.sendCommand(this.buildWriteCommand(this.PARAM_SPEED, new Uint8Array([(speedInt >> 8) & 255, speedInt & 255]))); }
  async setDRL(enabled) { await this.sendCommand(this.buildWriteCommand(0xD3, new Uint8Array([enabled ? 1 : 0]))); }
  async setVolume(volume) { if (volume < 0 || volume > 100) throw new Error('Volume must be between 0 and 100'); await this.sendCommand(this.buildWriteCommand(0xF5, new Uint8Array([Math.round(volume / 100 * 255)]))); }
  async readAllTelemetry() { try { for (const fn of ['readBattery','readCurrentSpeed','readMaxSpeed','readDistance','readTemperature']) { await this[fn](); await new Promise(resolve => setTimeout(resolve, 100)); } } catch(error) { console.error('Telemetry read error:', error); } }
  parseTelemetry(data) { const telemetry = {}; if (data.length < 2) return telemetry; switch(data[1]) { case this.PARAM_BATTERY: telemetry.battery=data[2]; break; case this.PARAM_CURRENT_SPEED: telemetry.currentSpeed=((data[2]<<8)|data[3])/100; break; case this.PARAM_SPEED: telemetry.maxSpeed=((data[2]<<8)|data[3])/100; break; case this.PARAM_DISTANCE: telemetry.distance=((data[2]<<24)|(data[3]<<16)|(data[4]<<8)|data[5])/1000; break; case this.PARAM_TEMP: telemetry.temperature=data[2]; break; case this.PARAM_MODE: telemetry.mode=['Eco','Sport','Race','Walk'][data[2]] || 'Unknown'; break; } return telemetry; }
}
window.NinebotBLEProtocol = NinebotBLEProtocol;
