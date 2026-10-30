# Squeek Odometer design system

## Overview

A compact live dashboard for livestream viewers, streamers and Sepolia visitors. Warm orange highlights sit on a dark, flat instrument panel. The large illustrated hamster wheel and rolling numbers carry the visual identity; supporting sections use shared alignment and open space. The first screen contains the actual wheel, distance and connect control, followed by chain progress, comparisons, history and local tools.

The canonical implementation is `src/style.css`, with semantic structure in `index.html` and the original illustration in `src/visuals.js`. Rendered evidence is in `docs/evidence/`. The dashboard stays dark; the stream overlay supports explicit dark/light query parameters.

## Colors

Use semantic tokens in components. Their primitive values and roles are defined at `src/style.css:15`.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` / `--neutral-950` | `#141412` | Page background; text on the orange action |
| `--surface` / `--neutral-900` | `#1b1b18` | Live panel, fields, dialog, dark overlay |
| `--hover` / `--neutral-850` | `#23231f` | Hover and pressed surfaces; odometer tiles |
| `--border` / `--neutral-800` | `#30302a` | Structural lines, chart guides |
| `--control-border` / `--neutral-700` | `#65655b` | Outlined controls, neutral chart bars |
| `--muted` / `--neutral-400` | `#aaa99d` | Secondary text and units |
| `--text`, `--focus` / `--neutral-100` | `#f2f0e7` | Primary text and visible keyboard outlines |
| `--accent` / `--orange-400` | `#fa9851` | Primary action, distance fractions, wheel, record and live cues |
| `--accent-hover` / `--orange-300` | `#ffad70` | Orange action hover/press |

The light overlay overrides surface/background to `#faf7f0`, text/focus to `#24241f`, muted text to `#646358`, control border to `#918b7e` and accent to `#a9470b`. The space outside either overlay card is transparent; the card itself is opaque. Status is always written in text, so an orange/neutral dot is supplemental.

Measured rendered overlay contrast: dark primary 15.12:1 and muted 7.29:1 against `#1b1b18`; light primary 14.57:1 and muted 5.66:1 against `#faf7f0`. The final dashboard probe measured a minimum text ratio of 7.27:1. These measurements cover the inspected states, not arbitrary future changes or stream artwork.

## Typography

- `--font-sans`: locally bundled variable **DM Sans**, then Arial/sans-serif. UI uses weights 400, 500 and 600; body 14px with unitless 1.5 line height. Section headings are normally 20px/1.3, and the desktop page heading is 32px/1.2.
- `--font-mono`: locally bundled **IBM Plex Mono**, then ui-monospace/monospace, weight 400. Use `.mono` for telemetry, addresses, dates and changing numbers. Tabular numbers stabilize updates.
- Six sizes: `--text-xs` 12px, `--text-sm` 14px, `--text-base` 16px, `--text-lg` 20px, `--text-xl` 32px, `--text-display` 64px. Mobile inputs remain 16px. The mobile odometer uses 32px; the large overlay uses 64px when it fits.
- Headlines use `text-wrap: balance`; prose uses `pretty`. Display text has modest negative tracking; ordinary content retains natural spacing. Addresses and error text wrap rather than lose characters. Visible chain/supply values fit the narrow layouts.

Font declarations are at the beginning of `src/style.css`; both faces were confirmed loaded in the browser. Font files and OFL notices are in `public/fonts/`. The uppercase live state follows the required product copy; it is not a recurring heading treatment.

## Layout

`.wrap` caps content at 1240px, with 48px desktop gutters, 32px below 1100px and 20px below 850px. At 359px and narrower, gutters become 16px. Shared spacing tokens are 4, 8, 12, 16, 24, 32, 48 and 64px; spacing declarations consume these tokens. Specific component insets also use 20, 28 and 40px.

The live panel has a two-column wheel/readings grid on desktop, collapsing to one column at 600px. The wheel becomes 204px wide on phones; the pause control stays visible beside it. The normal page heading becomes 20px. The stream link stays beside the heading when it fits and is omitted below 360px; the footer keeps the same destination available.

The chain strip starts with three columns, becomes two plus a full-width settlement row below 850px, and becomes one column below 360px. Comparisons change from three columns to three rows at 600px. The check-in/guess grid uses two columns until 600px, then stacks in DOM order. The 30 chart bars compress within their grid; expanded table data gets its own overflow container. Controls wrap instead of forcing a horizontal page scroll.

Breakpoints are 1100, 850, 600 and 359px, plus a 399px adjustment for the large overlay when opened in a small viewport. Final rendered checks covered 320, 390, 768, 1024 and 1440px. Native zoom and RTL rendering were not tested.

## Elevation & Depth

The interface is deliberately flat. There are no card shadows or gradient text. A single darker/lighter surface distinguishes the live instrument panel; other sections are separated by space and thin structural rules. Native `dialog` uses an opaque surface, border and translucent black backdrop. The dialog enters the browser’s top layer; chart tooltips sit just above their bars.

## Shapes

Buttons, inputs, tags, panels, dialogs and bars have square corners and thin borders. The wheel, its hub, the hamster illustration and tiny status dots retain their circular geometry. Odometer tiles clip only the decorative digit strip; the full distance has one accessible graphic label. Meaningful text, transaction hashes and token addresses remain available without clipping.

## Components

| Pattern | Implementation | Behavior and states |
| --- | --- | --- |
| Buttons | `.button`, `.primary`, `.outline`, `.subtle`, `.text-button`, `.icon-button` | Orange connect control; neutral secondary actions. Hover, pressed, disabled, pending labels and 2px offset focus outline. Hover treatments are gated to pointing devices. |
| Live instrument | `.live-panel`, `.live-grid`, `renderLive()` | Connecting, running, resting and offline text states. Last-good telemetry remains visible with age on failure. |
| Wheel | `src/visuals.js`, `updateMotion()` | A 60-second rotor animation with playback rate equal to real RPM; pauses on IDLE/offline, manual pause or reduced motion. The hamster remains upright. No decorative page-entry animation. |
| Odometer | `.digit-window`, `.digit-strip`, `renderOdometer()` | Monospace digit strips with 650ms transform transitions when motion is allowed. Fractional digits use the accent. One graphic label carries the whole readable value. |
| Distance period | `.segmented` | Native Tonight/All time buttons with `aria-pressed`; converts measured values without changing the selected night. |
| Night chart | `.night-chart`, `renderChart()` | 30 bars with a text-described record, missing/partial states, focus/hover descriptions and a native-button table disclosure. |
| Wallet picker | `src/wallet.js`, native `dialog` | Named EIP-6963 rows, phone app links, Coinbase passkey path, per-request pending state and recoverable inline errors. Escape, close control and backdrop dismiss it; focus returns to the connect button. Native modal behavior makes the page behind inert. |
| Check-in | `sendCheckIn()`, `watchReceipt()` | Disabled until wallet, chain and token feed are ready. Exact pre-signing explanation, signing/sent/confirmed/failed states, a full explorer link and local history. |
| Guess form | `src/guesses.js`, `.guess-controls` | Visible label, decimal keyboard, submit-time validation and focus on invalid input. Saves/updates the current night locally; completed history compares the matching date only. |
| Overlay | `.overlay-mode`, `setupOverlayControls()` | Transparent page, one compact card. 360px or 520px card; use 380 × 160 or 540 × 220 OBS canvases. Size/theme settings affect copy and preview together. Clipboard denial exposes a selected URL field. |

Feedback uses stable `role="status"` regions. Native buttons, links, inputs, selects, progress, details/summary and table semantics are preserved. Reduced motion also removes rolling-digit transitions and smooth scrolling. The forced-colors rule preserves system focus behavior; that mode has not been inspected visually.

## Do’s and Don’ts

- Start additional content with `.wrap`, the six-size scale and semantic color/spacing tokens. Follow the current section heading, data, then supporting explanation order.
- Keep the wheel and useful telemetry near the top; keep the connect control visible on the initial phone screen.
- Use orange for the single emphasized connect action and existing telemetry cues. Reuse outlined controls for other actions.
- Preserve square controls, local fonts, tabular figures and full accessible values. Use exact text status alongside color or motion.
- Keep absent data explicitly absent. Preserve cached values with freshness labels and require a fresh Sepolia token feed before signing.
- Reuse the existing dialog, feedback and form patterns for any new local tool; check narrow reflow, keyboard focus, pending/error states and reduced motion before rebuilding `dist/`.

Design guidance attribution and licenses: `docs/design-guidance-LICENSE.txt`. Review findings and coverage are recorded separately in `docs/validation.md`.
