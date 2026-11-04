# Visual and interaction check

Checked in Codex in-app browser on 4 November 2026.

Design reference: existing cream/cobalt Luklaan app branding and approved `app/assets/luklaan-mascot.png`. This is an HTML adaptation of the sales narrative, with native interactive phone screens rather than static slide images.

Checked all 11 slides at 1440×900: assets load, no horizontal overflow, text ends above the presentation footer. Checked 1366×768 and mobile390×844. On mobile the text and phone stack vertically and the page scrolls.

Comparison points: cream background and cobalt actions preserved; original transparent mascot preserved; consistent Thai typography; slide title and phone hierarchy; generous editorial spacing; thin outline icons; responsive phone and content separation. No copy changed unintentionally relative to the authored HTML slide data. The HTML deck intentionally condenses the original 13-slide narrative to11 slides and adds demonstrable phone states.

Fixed: notebook copy touching the footer; phone summary and calendar controls extending below the phone; initial directory URL rejected by the existing static-server allowlist. Use `/pitch/index.html`.

Verified interactions: chat example, one confirmation and saved state, camera inspection example, calendar addition, family/doctor summary switch, answering a simulated call, slide picker, speaker notes. No real API calls, camera permission, phone call or database write occurs.

Syntax check: `node --check app/pitch/pitch.js` passes. Intentional limits: voice/camera/PSTN are visual demos; Google Fonts needs internet with sans-serif fallback. Keyboard and fullscreen controls implemented; fullscreen browser permission depends on host environment.
