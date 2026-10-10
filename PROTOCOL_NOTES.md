# Experimental Ninebot encrypted telemetry

This implementation adapts scooterhacking/NinebotCrypto (AGPL-3.0), credited to majsi and nopbxlr. Source: https://github.com/scooterhacking/NinebotCrypto/tree/master
Register references: https://github.com/ownbee/ninebot-ble

D18 support is NOT hardware-verified. The supported upstream list includes F-series BLE307, not D18. A shared Nordic UART service does not establish protocol compatibility.

Only handshake commands 0x5B/0x5C/0x5D and register reads 0x01 are sent. Settings, speed changes and firmware operations are disabled. Authentication may establish a new session pairing key, with physical power-button approval. Session keys remain in memory.

A response must have valid length, checksum or MAC and expected source/target/command/index. Encrypted BLE fragments are reassembled. Requests are serialized and time out. Authentication failure disconnects and requires a fresh connection.

Battery, temperature, mileage, mode and controller firmware use Ninebot family mappings and require comparison with the official app. Current speed and max speed remain unavailable. There is no automatic polling.

This project is distributed under AGPL-3.0-only. Complete source is included in this download; preserve LICENSE and attribution when deploying it.

Pairing approval requests repeat once per second for up to 30 seconds, including when the dashboard is silent. The final serial acknowledgement is retried up to three times. Other errors stop the handshake. Hardware log confirmed a valid initial challenge from NBScooter4546; complete authentication remains unverified.
