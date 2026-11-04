# Camera vital signs for Luklaan

Researched 4 November 2026. Scope: an optional browser-local pulse experiment, and whether camera blood pressure is ready to become a clinical record.

## Decision

Use the MIT-licensed `@sontakey/ppg-js` 0.3.0 package for an explicit fingertip pulse experiment. Its public browser API fits the existing JavaScript app without a new server or inference service. Show a pulse estimate only when the package accepts signal quality. Stop capture after the first accepted result or after 60 seconds without one. Do not generate blood pressure, oxygen saturation, glucose, temperature, diagnoses or clinical alerts from this experiment. Do not save its result into physician summaries. This is a product decision based on the evidence below, not a validation claim.

For the blood-pressure workflow, keep receiving readings from a cuff monitor by speech or camera-assisted reading of that monitor's display, followed by user confirmation. A video image of a person alone is not a cuff reading.

## Candidate comparison

| Project | What its primary source provides | License and fit | Decision |
|---|---|---|---|
| [sontakey/ppg-js](https://github.com/sontakey/ppg-js) | Fingertip on rear camera and flash, headless JavaScript API, signal-quality verdict, heart-rate estimate. Upstream explicitly says it has not been validated across a population or skin tones. | [MIT license](https://github.com/sontakey/ppg-js/blob/main/LICENSE), no runtime dependencies. Plain-browser build. | Use a pinned local copy for pulse research only. |
| [friesipayung/webppg](https://github.com/friesipayung/webppg) | Facial ROI extraction using MediaPipe and Rust WASM signal processing. Its README labels results as educational/research and not medical grade. | [MIT license](https://github.com/friesipayung/webppg/blob/main/LICENSE). Requires a WASM build and face-model assets. | Useful later facial-rPPG comparison. More moving parts than needed for the current experiment. |
| [phuselab/pyVHR](https://github.com/phuselab/pyVHR) | Python framework for evaluating video-derived pulse methods. The authors' [paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC9044207/) describes the research pipeline. | [GPL-3.0](https://raw.githubusercontent.com/phuselab/pyVHR/master/LICENSE). Python processing and its dependencies do not run directly in this browser UI. | Consider for offline benchmarking; do not bundle into the present app. |
| [ubicomplab/rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox) | Research/training and evaluation of rPPG models. | Its [RAIL source-code license](https://github.com/ubicomplab/rPPG-Toolbox/blob/main/LICENSE) has use restrictions. Not interchangeable with an MIT package. | Evaluate separately with dataset/model/license review; do not import as a drop-in medical feature. |
| [remotebiosensing/rppg](https://github.com/remotebiosensing/rppg/blob/main/README.md) | PyTorch research framework covering rPPG and continuous non-invasive BP research. The README's CNIBP section lists PP-Net as an unchecked example. | [Apache-2.0](https://raw.githubusercontent.com/remotebiosensing/rppg/main/LICENSE). Requires research datasets, training/evaluation and a separate inference plan. | Not evidence of a validated phone-camera BP measurement product. |

## Why camera blood pressure is not enabled

The [FDA's 16 September 2025 safety communication](https://www.fda.gov/medical-devices/safety-communications/do-not-use-unauthorized-devices-measuring-blood-pressure-fda-safety-communication) warns that unauthorized devices claiming to measure or estimate BP can produce inaccurate readings and harmful treatment decisions. This is US guidance, not a determination of Thai approval. It supports treating approval and accuracy as requirements rather than inferring them from a GitHub demo.

A primary [smartphone camera/IMU validation study](https://mhealth.jmir.org/2023/1/e44147) calibrated each participant three times and still called for validation designed specifically for cuffless devices. In the [iPARR trial's institutional record](https://edoc.unibas.ch/entities/publication/6ffbb342-0956-4cb5-9894-9b74cc52fc53), the tested smartphone algorithm failed the specified systolic-BP validation criteria. These findings do not prove every possible camera algorithm fails; they show that a specific implementation needs its own clinical validation.

Before a BP model is used in care, evaluate it against a validated reference across the target population, actual supported phones, lighting, motion and skin tones, with participant-separated data and an appropriate cuffless validation protocol. Assess calibration drift, real changes in BP and failure detection. Review the intended medical claims and applicable local regulatory requirements. An error metric on a research dataset is not sufficient evidence to place a camera BP estimate in a physician report.

## Implemented boundary

`camera-pulse.js` exports `CameraPulseSession`. The app supplies an optional video element and receives snapshots with `phase`, `heartRate`, `quality`, `message`, `experimental: true`, `source: 'camera-fingertip-ppg'` and `persisted: false`. The numeric field is null for rejected quality, non-finite or out-of-band output. A successful estimate stops the camera immediately; explicit stop clears the result. Late async starts and events cannot reopen a stopped session.

This module must run separately from the conversational camera. Stop the current camera stream before starting it. The user explicitly requests the experiment, and grants camera permission through the browser when required. The upstream library uses rear-camera fingertip contact, not a facial scan. A phone with a rear camera and controllable flash is the intended setup; desktop webcam and in-app browsers may not be suitable. These [device limitations](https://github.com/sontakey/ppg-js#browser-and-device-support) are upstream claims, not verified device coverage for Luklaan.

The vendored package's capture path was inspected. `stop()` releases its tracks, timers, page watchers and video source; `destroy()` calls `stop()`. No fetch, XHR or WebSocket calls were found in the vendored browser build. Debug persistence is disabled. The library still holds bounded signal diagnostics in memory during capture. Luklaan does not export them or call its download/debug APIs.

## Reproducibility and tests

Package source: [npm registry tarball 0.3.0](https://registry.npmjs.org/@sontakey/ppg-js/-/ppg-js-0.3.0.tgz). Retrieved with `npm pack @sontakey/ppg-js@0.3.0`; npm's integrity matches registry metadata. Unmodified ESM runtime files, MIT license and individual SHA-256 hashes are in `app/vendor/ppg-js-0.3.0/provenance.json`.

`node --test app/tests/camera-pulse.test.mjs` checks quality rejection, accepted research-only output, automatic release, invalid estimates, late async cancellation, errors and local vendor import. These are software contract tests, not an accuracy study. No real person's pulse, blood pressure or skin-tone performance was measured in this task.
