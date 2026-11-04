# Blood pressure device integration

Researched 4 November 2026. This implementation receives a cuff monitor's readings. It does not estimate blood pressure from a face or fingertip image, and it does not remotely trigger cuff inflation.

## Protocol and implementation choices

The [Bluetooth SIG assigned numbers](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Assigned_Numbers/out/en/index-en.html) identify the Blood Pressure Service as 0x1810 and Blood Pressure Measurement as 0x2A35. The module selects only monitors advertising that service.

The [Blood Pressure Service v1.1.1](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/BLS_v1.1.1/out/en/index-en.html) defines the three pressure subfields and optional device time, pulse, user ID and status fields. Values use IEEE 11073 SFLOAT. The module subscribes to completed measurements through the browser's notification API, which configures the characteristic's indication support. It does not subscribe to intermediate cuff pressure. Unavailable systolic or diastolic values block a reading; unavailable MAP or optional pulse remain missing rather than being invented.

The [Bluetooth SIG transcoding white paper](https://www.bluetooth.com/wp-content/uploads/2019/03/PHD_Transcoding_WP_v16.pdf) describes signed mantissa/exponent SFLOAT encoding and its special values. The decoder handles these explicitly. kPa is normalized using 1000/133.3224 mmHg per kPa, based on [NIST conversion factors](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9), and rounded to one decimal place.

The [Blood Pressure Profile collector rules](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/BLP_v1.1.1/out/en/index-en.html) require reading the device feature characteristic before interpreting measurement-status flags. They also require ignoring RFU bits and extra octets. Accordingly, the implementation reads 0x2A49, ignores unknown flag/status bits, and masks unsupported status features. Supported movement, cuff-fit and measurement-position problems require a repeat measurement. An irregular-pulse flag is retained as a device warning, not diagnosed by the app.

The characteristic's device timestamp has no timezone. `occurredAt` is receipt time and `timeBasis` is `received`; a known device-local timestamp is separately retained as `deviceTimestamp`. The app must read back the receipt basis and let the person confirm the actual measurement time, especially for historical readings transmitted by a monitor.

## Browser interaction

[Chrome's Web Bluetooth guide](https://developer.chrome.com/docs/capabilities/bluetooth) documents secure-context and user-gesture requirements, the device chooser, service discovery, indications/notifications, and GATT disconnection. A spoken instruction can open this workflow, but the person must tap the connection button and select a device. Unsupported browsers should offer camera-assisted reading of an actual cuff display. A claimed Bluetooth brand is not enough; the device must expose the standard service. Proprietary vendor protocols are not supported.

## Verification and limits

Seven automated tests exercise literal mmHg and kPa packets, optional fields, SFLOAT unavailable values, impossible/truncated data, feature-dependent status flags, RFU behavior, connection/indication handling, cancellation, listener cleanup, and confirmation visibility. No physical monitor has been tested. Pairing, OS/browser support, device interoperability and accuracy of a particular cuff remain unverified. No reading is automatically persisted. User confirmation and the existing health-record validation remain mandatory.
