# Squeek Odometer

A static stream companion for Squeektoshi on Squeekchain’s Ethereum Sepolia testnet. Plain HTML, CSS and JavaScript; Vite builds the export. No backend, API key, relay or WalletConnect project ID is required.

## Install, run and rebuild

Use Node.js 20.19+ or 22.12+ and npm. Node 24 was used for the recorded checks.

```sh
npm ci
npm run dev
```

To rebuild and serve the production export:

```sh
npm run typecheck
npm run build
npm run preview
```

Serve `dist/` through any static HTTP host. The finished `dist/index.html`, bundled scripts, fonts, wallet marks, favicon and social image are included in this submission. Asset URLs use Vite’s `base: './'`; the export was exercised under `/preview/`, not just at a server root. Opening the source HTML with `file://` is not supported.

## What it does

- Fetches all four public Squeekchain endpoints every 15 seconds. Each feed keeps its last validated response in memory and localStorage. Failed requests retain the numbers and show their age; a stale/offline wheel stops animating. Requests time out after 10 seconds.
- Shows real RPM, km/h, a rolling distance counter, Squeekchain block progress, SQK supply and the summed 24-hour settlement buckets. SQK base units are formatted using `BigInt`.
- Converts tonight’s or lifetime distance into marathon percentage, 400 m laps and a 346 m football-pitch perimeter (105 × 68 m). Lifetime distance comes from `lifetime.observedDistanceMm`, rather than treating work units as distance.
- Draws the last 30 API night records. Missing distance remains missing; it is never turned into a zero-distance night. The best observed night is highlighted and each bar has a keyboard-accessible description. A table exposes every value and its coverage.
- Saves a prediction for each night locally. Return after the night ends to compare with that date’s observed distance. A final score needs complete coverage; partial or missing results remain explicitly unresolved. Resolved scores are retained beyond the API’s 30-night window.

The API’s activity window starts at noon UTC. “Tonight” therefore uses the date of the evening beginning that noon-to-noon period, including after midnight. Guesses use the same boundary. The current night is never scored as final. If the API changes its night boundaries or schema, update the validators and `nightDate()` together.

## Wallet check-ins

One connect control discovers browser wallets with EIP-6963 and lists each by name and icon. A legacy browser provider is used only when no named wallet is announced. The phone picker offers MetaMask, Coinbase Wallet, Rabby and Phantom app links. Coinbase Smart Wallet is available through the lazily loaded Coinbase SDK, including a passkey path without an installed extension. The connected control opens Disconnect; a remembered wallet is restored with `eth_accounts`, without requesting permission again.

Check-ins are enabled only with a connected Sepolia account and a fresh, validated economy feed. The SQK token address is always read from `identities.token`; there is no production fallback address. Network switching uses `wallet_switchEthereumChain`, with a Sepolia add-chain fallback. The transaction preflight re-reads the account and chain and rejects a changed token address.

The check-in makes exactly `approve(ownAddress, 0)` on that token, with zero ETH value, on chain `11155111` (`0xaa36a7`). The page displays: “This approves 0 SQK to yourself on Sepolia testnet. It moves no funds.” Sepolia ETH is needed for gas. A transaction link appears immediately after submission; receipt checks use `https://ethereum-sepolia-rpc.publicnode.com` every 6 seconds, with a 10-second request timeout and up to 120 attempts. A failed lookup preserves the pending transaction and explorer link; reload resumes pending receipt checks.

The most recent 100 check-ins are retained locally (six shown), including time, transaction hash, account, status and the distance captured when signing was requested. An unavailable live distance is recorded as unavailable. Up to 180 nightly guesses are retained (eight previous results shown). Neither guesses nor check-in history are shared between visitors or devices. Browser storage restrictions are reported, and the current visit continues in memory. No private key or seed phrase is requested.

## OBS overlay

Select size and theme at the bottom of the page and use **Copy OBS overlay link**. The copy button near the odometer uses the same settings. Clipboard restrictions reveal a selectable URL instead.

```text
?overlay=1&size=small&theme=dark
?overlay=1&size=large&theme=light
```

Add an OBS Browser source and paste the URL. Use **380 × 160** for small, or **540 × 220** for large. The page background is transparent; the compact card has an opaque dark or light surface so its text stays readable over video. There is no header, footer or wallet UI in overlay mode. Omitted/unknown size and theme values default to small and dark. System reduced-motion preferences stop the rotor; the dashboard also has a pause control.

## Validation

```sh
npm run build
npm run typecheck
npx playwright install chromium
npm test
```

The test command serves the actual export at a subpath, manages its browser/server lifetime, and writes evidence to the system temporary directory. Set `SQUEEK_TEST_OUT` to change the output location. It uses deterministic API responses and simulated EIP-1193 wallets; it never signs or submits a real transaction. Browser tooling and dependencies were installed outside this repository during this assignment; `SQUEEK_DEPS_ROOT` is an optional contributor-only override for that arrangement. Ordinary `npm ci` needs no override.

Recorded final results: production build passed; strict `checkJs` typecheck passed; **9 Chromium interaction groups passed**; axe reported **0 violations** on the loaded dashboard and wallet dialog; the pinned design probe passed **16/16** checks. Layouts were checked at 320, 390, 768, 1024 and 1440 CSS pixels, and the live API was inspected in the assigned browser. The first 390 × 844 screen contains the product, odometer and wallet action.

WebKit was attempted but could not launch because this host lacks its system libraries. Safari, physical wallet app links, an actual Coinbase passkey handshake, real wallet signing, native browser zoom, screen-reader speech and an actual OBS capture remain unverified. API availability and RPC connectivity remain external dependencies. See [the review and validation record](docs/validation.md), [interaction results](docs/evidence/interaction-results.json), [probe results](docs/evidence/design-probe.json) and [design system](DESIGN.md).

## Source map and credits

`index.html` owns the page structure. `src/style.css` owns tokens and responsive layouts. `src/data.js` validates, polls and caches feeds; `src/main.js` renders the dashboard and overlays; `src/wallet.js` handles discovery, connection and transactions; `src/guesses.js` manages predictions. `src/visuals.js` contains the original wheel and hamster vector art. JavaScript is checked using JSDoc and the interfaces in `src/types.d.ts`.

DM Sans and IBM Plex Mono are bundled locally under the SIL Open Font License; license texts accompany their font files. Wallet app marks come from RainbowKit (MIT); Coinbase’s mark is used for its connector. Bundled dependency notices are in `public/THIRD-PARTY-NOTICES.txt` and are copied into the export.

The implementation and review apply the pinned Better Interface guidance by Jakub Krehel (MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`). The design documentation method is adapted from Paul Bakaus’s Impeccable (Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). Their notices and full licenses are retained in [docs/design-guidance-LICENSE.txt](docs/design-guidance-LICENSE.txt). These guides informed this implementation; the finished files do not depend on the pinned input directory.

Fan-made companion for Squeekchain. Testnet only. Not affiliated.
