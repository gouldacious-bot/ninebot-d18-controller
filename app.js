/* SPDX-License-Identifier: AGPL-3.0-only. See LICENSE and PROTOCOL_NOTES.md. */
/** Ninebot D18 diagnostic dashboard. No invented telemetry or scooter writes. */
class NinebotD18App {
  constructor() {
    this.protocol = new NinebotBLEProtocol();
    this.isConnected = false;
    this.protocol.onDiagnostic = message => this.log(message, 'info');
    this.protocol.onData = (hex, bytes) => {
      this.log('BLE RX (' + bytes.length + ' bytes): ' + hex, 'info');
      this.receivedPackets++;
      this.logStatus();
    };
    this.protocol.onConnectionLost = () => {
      this.isConnected = false;
      this.updateConnectionUI(false);
      this.log('Bluetooth connection lost', 'error');
    };
    this.receivedPackets = 0;
    this.telemetry = {};
    this.protocol.onTelemetry = (name,value) => { this.telemetry[name]=value; this.updateTelemetryDisplay(); };
    this.initializeUI();
  }
  initializeUI() {
    document.getElementById('connectBtn')?.addEventListener('click', () => this.connect());
    document.getElementById('disconnectBtn')?.addEventListener('click', () => this.disconnect());
    document.getElementById('clearLogBtn')?.addEventListener('click', () => this.clearLog());
    document.getElementById('speedSlider')?.addEventListener('input', e => this.updateSpeedDisplay(e.target.value));
    document.querySelectorAll('.preset-btn').forEach(btn => btn.addEventListener('click', e => this.setPresetSpeed(e.currentTarget.dataset.speed)));
    for (const id of ['applySpeedBtn','applySettingsBtn']) {
      const el = document.getElementById(id);
      if (el) { el.disabled = true; el.title = 'Disabled until scooter protocol is verified'; }
    }
    const card = document.getElementById('telemetryCard');
    if (card) {
      const explanation = document.createElement('p');
      explanation.className = 'info-text';
      explanation.textContent = 'Bluetooth diagnostics only. Experimental encrypted telemetry. Approve pairing with the scooter power button when prompted; register mappings need verification.';
      const check = document.createElement('button');
      check.id = 'diagnosticsBtn';
      check.className = 'btn btn-primary';
      check.textContent = 'Check Bluetooth Services';
      check.addEventListener('click', async () => {
        check.disabled = true;
        try { await this.protocol.inspectServices(); }
        catch (error) { this.log('Diagnostic check failed: ' + error.message, 'error'); }
        finally { check.disabled = !this.isConnected; }
      });
      check.disabled = true;
      const read = document.createElement('button');
      read.id='readTelemetryBtn'; read.className='btn btn-primary';
      read.textContent='Authenticate and Read Telemetry'; read.disabled=true;
      read.addEventListener('click',async()=>{
        read.disabled=true; check.disabled=true;
        try {
          await this.protocol.authenticate();
          await this.protocol.readAllTelemetry();
        } catch(error) {this.log(error.message,'error');this.showError(error.message);}
        finally {read.disabled=!this.isConnected;check.disabled=!this.isConnected;}
      });
      card.append(explanation, check, read);
    }
    this.updateTelemetryDisplay();
    this.log('Diagnostic mode: settings writes disabled. Encrypted handshake and read-only telemetry available (experimental).', 'info');
  }
  async connect() {
    const button = document.getElementById('connectBtn');
    if (button) button.disabled = true;
    try {
      this.log('Select your scooter in the Bluetooth chooser...', 'info');
      this.receivedPackets = 0;
      this.telemetry = {};
      await this.protocol.connect();
      this.isConnected = true;
      this.updateConnectionUI(true);
      for (const id of ['telemetryCard','logCard']) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
      }
      for (const id of ['speedControlCard','settingsCard']) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      }
      this.updateTelemetryDisplay();
      this.log('Connected to ' + (this.protocol.device?.name || 'Bluetooth device') + '. Notifications enabled.', 'success');
      this.log('No telemetry has been decoded yet. Watch for BLE RX messages below.', 'info');
    } catch (error) {
      this.log('Connection failed: ' + error.message, 'error');
      this.showError(error.message);
    } finally { if (button) button.disabled = false; }
  }
  async disconnect() {
    await this.protocol.disconnect();
    this.isConnected = false;
    this.updateConnectionUI(false);
    this.log('Disconnected', 'info');
  }
  updateConnectionUI(connected) {
    const read = document.getElementById('readTelemetryBtn');
    if(read)read.disabled=!connected;
    const check = document.getElementById('diagnosticsBtn');
    if (check) check.disabled = !connected;
    const dot = document.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    const status = document.getElementById('statusText');
    if (status) status.textContent = connected ? 'Connected (diagnostic)' : 'Disconnected';
    const connect = document.getElementById('connectBtn');
    const disconnect = document.getElementById('disconnectBtn');
    if (connect) connect.style.display = connected ? 'none' : 'block';
    if (disconnect) disconnect.style.display = connected ? 'block' : 'none';
  }
  updateTelemetryDisplay() {
    for (const id of ['currentSpeed','maxSpeed','battery','distance','temperature','mode']) {
      const el = document.getElementById(id);
      if (el) {
        const units={battery:' %',temperature:' °C',distance:' km'};
        el.textContent = this.telemetry[id] === undefined ? '--' : String(this.telemetry[id])+(units[id]||'');
      }
    }
  }
  updateSpeedDisplay(value) {
    const el = document.getElementById('speedValue');
    if (el) el.textContent = value;
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.speed == value));
  }
  setPresetSpeed(speed) {
    const el = document.getElementById('speedSlider');
    if (el) el.value = speed;
    this.updateSpeedDisplay(speed);
  }
  applySpeedLimit() { this.showError('Speed controls disabled until protocol is verified.'); }
  applySettings() { this.showError('Settings disabled until protocol is verified.'); }
  logStatus() { const status = document.getElementById('statusText'); if (status && this.isConnected) status.textContent = 'Connected (diagnostic; ' + this.receivedPackets + ' received packets)'; }
  log(message, type='info') {
    const container = document.getElementById('logContainer');
    if (container) {
      const line = document.createElement('p');
      line.className = 'log-entry ' + type;
      line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
      container.appendChild(line);
      container.scrollTop = container.scrollHeight;
    }
    console.log('[' + type.toUpperCase() + ']', message);
  }
  clearLog() {
    const el = document.getElementById('logContainer');
    if (el) el.textContent = '';
  }
  showError(message) {
    const alert = document.getElementById('errorAlert');
    const label = document.getElementById('errorMessage');
    if (label) label.textContent = message;
    if (alert) { alert.style.display = 'block'; setTimeout(() => alert.style.display = 'none', 5000); }
  }
  showSuccess(message) {
    const alert = document.getElementById('successAlert');
    const label = document.getElementById('successMessage');
    if (label) label.textContent = message;
    if (alert) { alert.style.display = 'block'; setTimeout(() => alert.style.display = 'none', 5000); }
  }
}
function closeAlert(alertId) { const el = document.getElementById(alertId); if (el) el.style.display = 'none'; }
document.addEventListener('DOMContentLoaded', () => { window.app = new NinebotD18App(); });

