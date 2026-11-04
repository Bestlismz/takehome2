# Voice control implementation plan

The user wants ลูกหลาน to operate the app through conversation and show the work as it happens. The approved mascot and mounted voice and camera session remain the interaction entry point.

## Ground

The existing flow is Realtime function call, app command validation, spoken proposal authorization, app execution, PostgreSQL flush, and activity completion. The registry currently exposes 58 app actions. The audit found missing selected-form context, stored-summary reading, and an explicit calendar form opener. Existing activity feedback omits its target and gives a generic completion message.

## Design alternatives

| Candidate | Result |
| --- | --- |
| Semantic command registry with observable task events | Reuses existing value validation, exact proposal confirmation, and durable persistence. Chosen. |
| Generic click and type controller | Duplicates execution paths and depends on selectors. It would still need user interaction for operating system permissions and file dialogs. Rejected. |

Two independent read-only audits agreed on semantic commands. Their useful additions were bounded interface inspection and explicit target and saving events. No arbitrary JavaScript execution or simulated browser screenshots are needed.

The operation model contains an id, label, target, location, phase, terminal status, result message, and sources. Only actual execution transitions produce events. InterfaceSnapshot contains the current route, dialog, selected identifiers, camera state, and allowlisted visible draft values. StoredSummary is read from PostgreSQL through the existing workspace API.

## Work checklist

- [x] Ground the affected subsystem.
- [x] Sketch two distinct control designs and choose the semantic registry.
- [x] Agree. Proceed under the user's implementation request.
- [x] Implement the missing commands and observable progress.
- [x] Scrap. Not needed because the semantic executor remains the single mutation path.
- [x] Verify the command results, failed persistence, confirmation behavior, and rendered panel.

## Throughput checkpoint

- Blocking first steps. Audit the registry and validation before extending commands.
- Independent workstreams. One owner handles command coverage and spoken scripts. Another handles task presentation and durable progress.
- Shared mutable state. Both touch app.js through surgical patches in separate functions. PostgreSQL test fixtures remain isolated from user data.
- Smallest safe decomposition. Keep related commands under one owner and activity state under one owner. The parent reviews integration and performs browser verification.

No commit, push, external message, real carrier call, or remote sharing is included in this request.

## Verification

The full suites pass with 85 JavaScript tests and 39 Python tests. Executor tests call the actual command function with isolated in-memory state, while HTTP tests verify persistence against PostgreSQL test workspaces. The browser search test returned a real WHO citation and showed the running and completed activity with its query. Calendar form opening and dismissal were checked in the browser without saving any user data.

The live Realtime SDK accepted the current registry and selected app.inspect, calendar.form.open, and summary.history correctly for three fictional text requests. Run `.venv/bin/python prototype/scripts/verify_voice_tool_routing.py` to repeat this paid provider check. It does not execute mutations or capture a microphone. Physical spoken recognition and camera continuity were not retested in this task. The phone and remote sharing remain demonstrations.
