/* SPDX-License-Identifier: AGPL-3.0-only. See LICENSE and PROTOCOL_NOTES.md. */
/** Ninebot D18 BLE diagnostics. Read-only: does not send commands. */
class NinebotBLEProtocol {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.onData = null;
    this.authenticated = false;
    this.onTelemetry = null;
    this.pending = null;
    this.buffer = [];
    this.rxChain = Promise.resolve();
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
      this.authenticated = false;
      this.failPending(new Error('Scooter disconnected.'));
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
      this.selectedService = service.uuid;
      this.report('Using service ' + service.uuid + '; notify ' + this.characteristic.uuid);
      this.characteristic.addEventListener('characteristicvaluechanged', this.notifyHandler);
      await this.characteristic.startNotifications();
      this.isConnected = true;
      this.authenticated = false; this.buffer = [];
      this.session = new NinebotCrypto();
      await this.session.initialize(device.name || 'Unnamed');
      this.writeCharacteristic = await service.getCharacteristic(service.uuid === this.CUSTOM_SERVICE_UUID ? '6e400002-0000-0000-006e-696e65626f74' : '6e400002-b5a3-f393-e0a9-e50e24dcca9e');
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
    this.rxChain = this.rxChain.then(() => this.acceptBytes(Array.from(bytes))).catch(error => this.report('RX rejected: ' + error.message));
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
    this.report('Diagnostic check complete. Use Authenticate and Read Telemetry next. D18 firmware compatibility is experimental.');
  }
  packet(target,command,index,data=[]) {
    return Uint8Array.from([0x5a,0xa5,data.length,0x3e,target,command,index,...data]);
  }
  failPending(error) {
    if(this.pending) {clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}
  }
  async acceptBytes(bytes) {
    this.buffer.push(...bytes);
    while(this.buffer.length>=3) {
      if(this.buffer[0]!==0x5a||this.buffer[1]!==0xa5) {this.buffer.shift();continue;}
      const size=this.buffer[2]+13;
      if(this.buffer.length<size)return;
      const wire=Uint8Array.from(this.buffer.splice(0,size));
      if(!this.session)continue;
      try {
        const plain=await this.session.decrypt(wire);
        const p=this.pending;
        if(p&&plain[3]===p.target&&plain[4]===0x3e&&plain[5]===p.reply&&(p.command!==1||plain[6]===p.index)) {
          clearTimeout(p.timer);this.pending=null;p.resolve(plain);
        }
      } catch(error) {this.report('Frame rejected: '+error.message);}
    }
  }
  async request(target,command,index,data=[],timeout=5000) {
    if(!this.isConnected)throw new Error('Connect first.');
    if(this.pending)throw new Error('Another request is in progress.');
    const wire=await this.session.encrypt(this.packet(target,command,index,data));
    let resolve,reject;
    const response=new Promise((yes,no)=>{resolve=yes;reject=no;});
    // Attach immediately so a write failure cannot cause an unhandled rejection.
    response.catch(()=>{});
    const pending={target,command,index,reply:command===1?4:command,resolve,reject};
    pending.timer=setTimeout(()=>{
      if(this.pending===pending)this.failPending(new Error('No valid response to command 0x'+command.toString(16)+'. Firmware may need another protocol.'));
    },timeout);
    this.pending=pending;
    try {
      for(let i=0;i<wire.length;i+=20) {
        const chunk=wire.slice(i,i+20);
        if(this.writeCharacteristic.properties.writeWithoutResponse)await this.writeCharacteristic.writeValueWithoutResponse(chunk);
        else await this.writeCharacteristic.writeValueWithResponse(chunk);
        if(i+20<wire.length)await new Promise(r=>setTimeout(r,10));
      }
      return await response;
    } catch(error) {if(this.pending===pending)this.failPending(error);throw error;}
  }
  async authenticate() {
    if(this.busy)throw new Error('Authentication is already running.');
    if(this.authenticated)return;
    this.busy=true;
    try {
      if(this.selectedService===this.CUSTOM_SERVICE_UUID)throw new Error('This version supports the Nordic UART handshake only.');
      // Each attempt starts a fresh BLE session; reusing counters after a timeout is unsafe.
      this.report('Experimental Ninebot encrypted authentication: requesting challenge...');
      const init=await this.request(0x21,0x5b,0);
      if(init[2]!==30)throw new Error('Unexpected challenge length; stopping.');
      const serial=init.slice(23,37);
      const key=crypto.getRandomValues(new Uint8Array(16));
      this.report('Press the scooter power button once now to approve pairing.');
      const deadline=Date.now()+30000;
      let confirmed=false;
      while(Date.now()<deadline) {
        const ping=await this.request(0x21,0x5c,0,Array.from(key));
        if(ping[6]===1) {confirmed=true;break;}
        await new Promise(r=>setTimeout(r,1000));
      }
      if(!confirmed)throw new Error('Power-button approval timed out.');
      const paired=await this.request(0x21,0x5d,0,Array.from(serial));
      if(paired[6]!==1)throw new Error('Scooter did not acknowledge authentication.');
      this.authenticated=true;
      this.report('Authenticated: scooter acknowledged pairing.');
    } catch(error) {
      this.authenticated=false;
      await this.disconnect();
      throw error;
    } finally {this.busy=false;}
  }
  async readAllTelemetry() {
    if(!this.authenticated)throw new Error('Authenticate first.');
    if(this.reading)throw new Error('A telemetry read is already running.');
    this.reading=true;
    // Family register definitions from ownbee/ninebot-ble. D18 mapping requires hardware validation.
    const reads=[
      {target:0x22,index:0x32,len:2,name:'battery',decode:b=>(b[1]<<8)|b[0]},
      {target:0x20,index:0x3e,len:2,name:'temperature',decode:b=>((b[1]<<8)|b[0])/10},
      {target:0x20,index:0x29,len:4,name:'distance',decode:b=>new DataView(b.buffer,b.byteOffset,4).getUint32(0,true)/1000},
      {target:0x20,index:0x75,len:2,name:'mode',decode:b=>['Normal','Eco','Sport'][(b[1]<<8)|b[0]]},
      {target:0x20,index:0x1a,len:2,name:'controllerFirmware',decode:b=>{const v=(b[1]<<8)|b[0];return (v>>8)+'.'+((v>>4)&15)+'.'+(v&15);}}
    ];
    try {
      for(const r of reads) {
        const frame=await this.request(r.target,1,r.index,[r.len]);
        const data=frame.slice(7);
        if(data.length!==r.len)throw new Error('Unexpected data length for '+r.name);
        const value=r.decode(data);
        if(value===undefined||(r.name==='battery'&&value>100))throw new Error('Unexpected register value for '+r.name);
        if(this.onTelemetry)this.onTelemetry(r.name,value);
        this.report(r.name+': '+value+' (family mapping; verify against Segway app)');
      }
    } finally {this.reading=false;}
  }
  async sendCommand() {throw new Error('Arbitrary commands are disabled.');}
  async setMaxSpeed() {throw new Error('Speed writes are disabled.');}
  async setDRL() {throw new Error('Settings writes are disabled.');}
  async setVolume() {throw new Error('Settings writes are disabled.');}
}
window.NinebotBLEProtocol = NinebotBLEProtocol;
