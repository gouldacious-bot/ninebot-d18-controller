/**
 * Ninebot D18 Controller App
 * Main application logic
 */

class NinebotD18App {
    constructor() {
        this.protocol = new NinebotBLEProtocol();
        this.isConnected = false;
        this.telemetry = {
            currentSpeed: 0,
            maxSpeed: 40,
            battery: 0,
            distance: 0,
            temperature: 0,
            mode: '--'
        };
        
        this.initializeUI();
    }

    /**
     * Initialize UI elements and event listeners
     */
    initializeUI() {
        // Connection buttons
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect());

        // Speed control
        document.getElementById('speedSlider').addEventListener('input', (e) => this.updateSpeedDisplay(e.target.value));
        document.getElementById('applySpeedBtn').addEventListener('click', () => this.applySpeedLimit());

        // Speed presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setPresetSpeed(e.target.dataset.speed));
        });

        // Settings
        document.getElementById('applySettingsBtn').addEventListener('click', () => this.applySettings());
        document.getElementById('clearLogBtn').addEventListener('click', () => this.clearLog());

        this.log('App initialized', 'info');
    }

    /**
     * Connect to Ninebot D18
     */
    async connect() {
        try {
            this.log('Connecting to Ninebot D18...', 'info');
            document.getElementById('connectBtn').disabled = true;

            await this.protocol.connect();
            this.isConnected = true;

            this.updateConnectionUI(true);
            this.log('✓ Connected to Ninebot D18', 'success');

            // Show control panels
            document.getElementById('telemetryCard').style.display = 'block';
            document.getElementById('speedControlCard').style.display = 'block';
            document.getElementById('settingsCard').style.display = 'block';
            document.getElementById('logCard').style.display = 'block';

            // Start reading telemetry
            this.startTelemetryUpdates();
        } catch (error) {
            this.log('✗ Connection failed: ' + error.message, 'error');
            this.showError('Failed to connect: ' + error.message);
            document.getElementById('connectBtn').disabled = false;
        }
    }

    /**
     * Disconnect from Ninebot D18
     */
    async disconnect() {
        try {
            this.log('Disconnecting...', 'info');
            await this.protocol.disconnect();
            this.isConnected = false;

            this.updateConnectionUI(false);
            this.log('✓ Disconnected', 'success');

            // Hide control panels
            document.getElementById('telemetryCard').style.display = 'none';
            document.getElementById('speedControlCard').style.display = 'none';
            document.getElementById('settingsCard').style.display = 'none';
            document.getElementById('logCard').style.display = 'none';
        } catch (error) {
            this.log('Error disconnecting: ' + error.message, 'error');
        }
    }

    /**
     * Update connection UI status
     */
    updateConnectionUI(connected) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('statusText');
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');

        if (connected) {
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Connected';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'block';
        } else {
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Disconnected';
            connectBtn.style.display = 'block';
            disconnectBtn.style.display = 'none';
        }
    }

    /**
     * Start automatic telemetry updates
     */
    startTelemetryUpdates() {
        // Simulate telemetry updates (since we may not get real responses)
        setInterval(() => {
            if (this.isConnected) {
                this.updateTelemetryDisplay();
            }
        }, 2000);
    }

    /**
     * Update telemetry display
     */
    updateTelemetryDisplay() {
        document.getElementById('currentSpeed').textContent = this.telemetry.currentSpeed.toFixed(1) + ' km/h';
        document.getElementById('maxSpeed').textContent = this.telemetry.maxSpeed.toFixed(0) + ' km/h';
        document.getElementById('battery').textContent = this.telemetry.battery + ' %';
        document.getElementById('distance').textContent = this.telemetry.distance.toFixed(2) + ' km';
        document.getElementById('temperature').textContent = this.telemetry.temperature + ' °C';
        document.getElementById('mode').textContent = this.telemetry.mode;
    }

    /**
     * Update speed display when slider changes
     */
    updateSpeedDisplay(value) {
        document.getElementById('speedValue').textContent = value;

        // Update active preset button
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.speed == value) {
                btn.classList.add('active');
            }
        });
    }

    /**
     * Set preset speed
     */
    setPresetSpeed(speed) {
        document.getElementById('speedSlider').value = speed;
        this.updateSpeedDisplay(speed);
    }

    /**
     * Apply speed limit to scooter
     */
    async applySpeedLimit() {
        if (!this.isConnected) {
            this.showError('Not connected to scooter');
            return;
        }

        try {
            const speed = parseInt(document.getElementById('speedSlider').value);
            this.log('Setting speed limit to ' + speed + ' km/h...', 'info');

            document.getElementById('applySpeedBtn').disabled = true;

            await this.protocol.setMaxSpeed(speed);
            this.telemetry.maxSpeed = speed;

            this.log('✓ Speed limit set to ' + speed + ' km/h', 'success');
            this.showSuccess('Speed limit updated to ' + speed + ' km/h');

            document.getElementById('applySpeedBtn').disabled = false;
        } catch (error) {
            this.log('✗ Failed to set speed: ' + error.message, 'error');
            this.showError('Failed to set speed: ' + error.message);
            document.getElementById('applySpeedBtn').disabled = false;
        }
    }

    /**
     * Apply settings to scooter
     */
    async applySettings() {
        if (!this.isConnected) {
            this.showError('Not connected to scooter');
            return;
        }

        try {
            this.log('Applying settings...', 'info');
            document.getElementById('applySettingsBtn').disabled = true;

            const drlEnabled = document.getElementById('drlToggle').checked;
            const volume = parseInt(document.getElementById('volumeControl').value);
            const brightness = parseInt(document.getElementById('brightnessControl').value);

            if (drlEnabled) {
                await this.protocol.setDRL(true);
                this.log('✓ DRL enabled', 'success');
            }

            await this.protocol.setVolume(volume);
            this.log('✓ Volume set to ' + volume + '%', 'success');

            this.showSuccess('Settings applied successfully');
            document.getElementById('applySettingsBtn').disabled = false;
        } catch (error) {
            this.log('✗ Failed to apply settings: ' + error.message, 'error');
            this.showError('Failed to apply settings: ' + error.message);
            document.getElementById('applySettingsBtn').disabled = false;
        }
    }

    /**
     * Log message
     */
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('p');
        logEntry.className = 'log-entry ' + type;
        logEntry.textContent = '[' + timestamp + '] ' + message;

        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        console.log('[' + type.toUpperCase() + ']', message);
    }

    /**
     * Clear log
     */
    clearLog() {
        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            logContainer.innerHTML = '<p class="log-entry">Log cleared</p>';
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        const alert = document.getElementById('errorAlert');
        document.getElementById('errorMessage').textContent = message;
        alert.style.display = 'block';
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        const alert = document.getElementById('successAlert');
        document.getElementById('successMessage').textContent = message;
        alert.style.display = 'block';
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }
}

// Close alert function
function closeAlert(alertId) {
    document.getElementById(alertId).style.display = 'none';
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new NinebotD18App();
});
