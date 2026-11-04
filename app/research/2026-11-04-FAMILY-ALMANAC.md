# Family almanac: ปฏิทินดูแลกัน

User brief: plans can be a calendar, other pages and arrow affordances feel ordinary, more artistic/considered UX, existing mascot approved and must stay unchanged. No green. Mobile and desktop share voice-first behavior.

## Research and application

- Timepage's timeline/day model helps see the coming week and move between overview and daily detail: https://bonobolabs.com/support/timepage/navigating-timeline-and-day-view/ . Apply month selection plus a chronological day agenda; do not copy brand graphics or expose a complex scheduling dashboard to older users.
- W3C date picker patterns describe keyboard date navigation, spoken month changes and named date cells: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/ . Use a semantic table with named buttons, selected/today state, one tab stop and arrow/Home/End/PageUp/PageDown support. Monday-start November 2026 starts on Sunday; November 4 is Wednesday. Need assistive-technology checks beyond DOM inspection.
- NN/g icon usability: recognizable glyphs still need meaningful labels: https://www.nngroup.com/articles/icon-usability/ . Remove decorative diagonal arrows. Use one SVG stroke family, chevrons for navigation/disclosure, an external-link symbol for public reference links, and explicit names for previous/next month. The whole agenda row responds, with a named keyboard-focusable action button.
- MoMA's typographic poster work demonstrates hierarchy and graphic rhythm through type rather than many containers: https://www.moma.org/calendar/exhibitions/443 . Creative interpretation: a family almanac with oversized serif day/time numerals, restrained burnt-orange underlines, cobalt selection ink, paper ground and ruled agenda rows. These are design decisions, not proven accessibility or market-fit claims.

## Design system

Ink #292b29, paper #faf7ee, cobalt #314e9d, clay #bc542d, divider #dcd5c6. Keep IBM Plex Sans Thai for text and Georgian-style numerals for calendar/time; no new font requests. Primary heading 31px mobile / up to52px desktop, 44px day touch targets, reduced-motion support. Button corners and icons are consistent across home, health/history, medication, family and physician pages. Motion runs on route entry only, not each date/filter/data update; no opacity pulse that looks disabled.

Concepts: design/family-almanac-desktop.png and design/family-almanac-mobile.png. They define layout direction, not literal clinical data. The implementation preserves the existing navigation, separates real personal appointments from recurring example medication/call plans and adds no invented healthcare bookings. The existing mascot artwork/poses are unchanged.

## Calendar behavior

`/#calendar`: month plus day agenda; mobile stacks them. Recurring medication times are read-only examples, call times use actual configured demonstration settings, and personal appointments/activities/follow-ups are persisted under calendarPlans in PostgreSQL workspace settings. Add/edit/cancel available in UI and shared voice catalog; voice mutations require spoken readback/confirmation. Cancellation retains history. No calendar write changes medication observations or creates a hospital booking. Notifications while the app is closed remain unimplemented.

Validation covers impossible dates/times, type allowlist (no prescription type), calendar bounds 2000–2099, max300 plans and title/note lengths on both client and server. ISO dates use Gregorian year while displayed dates use Thai/Buddhist format and Asia/Bangkok. Native input identifiers avoid shadowing HTMLFormElement.id; form submissions never place plan content in the URL.

## Verification

Automated: 51 JavaScript and 27 Python tests passed after final functional fixes. Browser: month/day rendering, adding a fictional test appointment, reloading it and cancelling with confirmation, desktop/mobile calendar, and mobile medication/history/family/summary/home. Test appointment is labelled fictional and left cancelled. Check no horizontal overflow, date keyboard focus and no new console errors. Full spoken calendar commands, assistive technology and production reminder delivery are not claimed verified.
