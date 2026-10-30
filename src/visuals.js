/** Original vector art: the rotor moves, while its small passenger stays upright. */
export function wheelArt() {
  const spokes = Array.from(
    { length: 12 },
    (_, i) => `<path d="M160 40V147" transform="rotate(${i * 30} 160 160)"/>`,
  ).join("");
  return `<svg viewBox="0 0 320 330" xmlns="http://www.w3.org/2000/svg" fill="none">
    <path d="M160 161v148m-61 8h122m-45-33 26 33m-58-33-26 33" stroke="#65655b" stroke-width="3"/>
    <circle cx="160" cy="160" r="143" stroke="#30302a"/>
    <circle cx="160" cy="160" r="137" stroke="#30302a" stroke-dasharray="1 7" stroke-width="5"/>
    <circle cx="160" cy="160" r="125" fill="#171714" stroke="#65655b" stroke-width="2"/>
    <g class="wheel-rotor" style="transform-origin:160px 160px">
      <g stroke="#37372f" stroke-width="1.5">${spokes}</g>
      <circle cx="160" cy="160" r="125" stroke="#fa9851" stroke-width="2.5" stroke-dasharray="30 166.35"/>
      <circle cx="160" cy="160" r="116" stroke="#30302a" stroke-dasharray="2 11" stroke-width="3"/>
    </g>
    <circle cx="160" cy="160" r="13" fill="#1b1b18" stroke="#65655b" stroke-width="2"/><circle cx="160" cy="160" r="4" fill="#fa9851"/>
    <path d="M86 274h148" stroke="#30302a"/>
    <g class="hamster">
      <path d="M102 252c-20-9-29 1-25 9 4 6 14 7 25 0" stroke="#bd7641" stroke-width="4" stroke-linecap="round"/>
      <path d="M100 263c-9-11-10-33 3-48 14-17 47-17 67-8 5-9 15-14 27-10 11 3 16 11 15 22 7 5 10 12 16 17 6 4 7 9 2 15-7 8-16 9-27 8-10 11-25 16-50 15-22 1-45-2-53-11Z" fill="#c88b51"/>
      <path d="M114 266c-6-12-6-29 3-41 9-12 23-15 38-12-11 14-12 27-4 42 7 11 20 14 33 16-24 7-55 2-70-5Z" fill="#e8caa1"/>
      <path d="M175 209c-4-11 0-23 10-23 13 0 17 10 13 23" fill="#d99a64"/><path d="M180 205c-2-7 1-13 6-13 7 0 9 6 7 12" fill="#9e5d38"/>
      <path d="M186 255c2-14 9-25 21-28-2 9 1 15 8 21-6 7-16 10-29 7Z" fill="#e8caa1"/>
      <circle cx="207" cy="224" r="3.5" fill="#171714"/><circle cx="208" cy="223" r="1" fill="#f2f0e7"/>
      <path d="m226 237 5 2-4 4" fill="#171714"/><path d="m224 245 12 2m-13 2 11 5" stroke="#9e5d38" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M123 267c-3 4-1 8 5 8h15m42-11c2 6 8 8 15 7l9-1" stroke="#bd7641" stroke-width="6" stroke-linecap="round"/>
    </g>
    <path d="M7 160h7m292 0h7M160 7v7" stroke="#65655b"/>
  </svg>`;
}

export function miniWheel() {
  return `<svg class="mini-wheel" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:var(--accent)"><circle cx="32" cy="29" r="25" stroke="currentColor" stroke-width="2"/><g class="wheel-rotor" style="transform-origin:32px 29px" stroke="currentColor" stroke-width="1.5"><path d="M32 4v50M7 29h50M14 11l36 36M14 47l36-36"/></g><circle cx="32" cy="29" r="4" fill="var(--surface)" stroke="currentColor" stroke-width="2"/><path d="M32 54v6m-12 1h24" stroke="currentColor" stroke-width="2"/></svg>`;
}
