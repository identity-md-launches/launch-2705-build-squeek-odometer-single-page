import {
  el,
  dateLabel,
  escapeHtml,
  nightDate,
  number,
  readStorage,
  text,
  writeStorage,
} from "./utils.js";
import { feeds } from "./data.js";

const saved = readStorage("guesses", []);
/** @type {import('./types').Guess[]} */
const guesses = Array.isArray(saved)
  ? saved
      .filter(
        (item) =>
          /^\d{4}-\d{2}-\d{2}$/.test(item?.date) &&
          Number.isFinite(item?.km) &&
          item.km >= 0 &&
          Number.isFinite(item.savedAt) &&
          (item.actualMm === undefined ||
            (Number.isFinite(item.actualMm) && item.actualMm >= 0)),
      )
      .slice(0, 180)
  : [];

export function initGuesses() {
  const form = /** @type {HTMLFormElement} */ (el("guess-form"));
  const input = /** @type {HTMLInputElement} */ (el("guess-km"));
  const current = guesses.find((guess) => guess.date === nightDate());
  if (current) input.value = String(current.km);
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    text("guess-feedback", "");
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const km = input.valueAsNumber;
    if (!input.value.trim() || !Number.isFinite(km) || km < 0 || km > 1000000) {
      input.setAttribute("aria-invalid", "true");
      text("guess-feedback", "Enter a distance from 0 to 1,000,000 km.");
      input.focus();
      return;
    }
    if (!input.validity.stepMismatch) {
      const date = nightDate();
      const index = guesses.findIndex((guess) => guess.date === date);
      const item = { date, km, savedAt: Date.now() };
      if (index >= 0) guesses[index] = item;
      else guesses.unshift(item);
      guesses.splice(180);
      const persisted = writeStorage("guesses", guesses);
      text(
        "guess-feedback",
        `${number(km, 3)} km ${persisted ? "saved on this device" : "saved for this visit"} for the night of ${dateLabel(date)}.`,
      );
      renderGuesses();
    } else {
      input.setAttribute("aria-invalid", "true");
      text("guess-feedback", "Use up to 3 decimal places, such as 12.500 km.");
      input.focus();
    }
  });
  renderGuesses();
}

export function renderGuesses() {
  const date = nightDate();
  const current = guesses.find((guess) => guess.date === date);
  const panel = el("current-guess");
  panel.hidden = !current;
  const actual = feeds.status.data?.measurement.distanceMm;
  if (current) {
    panel.innerHTML = `<p>Your guess: <span class="mono">${number(current.km, 3)} km</span></p><p class="caption muted">${actual === undefined ? "Waiting for tonight’s distance." : `${number(actual / 1e6, 3)} km measured so far. Final result after this night ends.`}</p>`;
    text("save-guess", "Update guess ↗");
  } else text("save-guess", "Save guess ↗");

  const days = feeds.stats.data?.activity.days || [];
  let changed = false;
  const past = guesses.filter((guess) => guess.date < date);
  const rows = past.slice(0, 8).map((guess) => {
    const day = days.find((day) => day.date === guess.date);
    if (
      day?.distanceMm !== null &&
      day?.distanceMm !== undefined &&
      day.coverage?.coverageBps === 10000
    ) {
      const actualMm = Number(day.distanceMm);
      if (guess.actualMm !== actualMm) {
        guess.actualMm = actualMm;
        changed = true;
      }
    }
    const actualMm = guess.actualMm;
    if (actualMm !== undefined) {
      const km = actualMm / 1e6;
      const off = Math.abs(km - guess.km);
      const percent =
        km > 0
          ? `${number((off / km) * 100, 1)}% off`
          : off === 0
            ? "Exact match"
            : "A zero-distance night";
      return `<li class="guess-result"><span>${dateLabel(guess.date, true)}</span><span class="mono">${number(guess.km, 3)} → ${number(km, 3)} km</span><p>${number(off, 3)} km ${guess.km > km ? "over" : guess.km < km ? "under" : "away"} · ${percent}</p></li>`;
    }
    const observed = day?.distanceMm;
    return `<li class="guess-result"><span>${dateLabel(guess.date, true)}</span><span class="mono">Guess: ${number(guess.km, 3)} km</span><p>${observed === null || observed === undefined ? "The final distance is not available in the 30-night feed yet." : `${number(Number(observed) / 1e6, 3)} km observed, with partial coverage. A final score needs complete data.`}</p></li>`;
  });
  el("guess-results").innerHTML = rows.length
    ? rows.join("")
    : '<li class="caption muted">Come back after tonight to see how close you were.</li>';
  if (changed) writeStorage("guesses", guesses);
  // Derive a night label from the same UTC boundaries as the API, never from the visitor’s timezone.
  el("guess-km").setAttribute(
    "aria-label",
    `Your distance prediction in km for the night of ${escapeHtml(dateLabel(date))}`,
  );
}
