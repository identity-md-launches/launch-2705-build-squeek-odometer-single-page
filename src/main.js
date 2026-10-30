import {
  el,
  text,
  number,
  dateLabel,
  nightDate,
  escapeHtml,
  isAddress,
  age,
} from "./utils.js";
import {
  feeds,
  refresh,
  subscribe,
  healthLabel,
  liveState,
  formatSqk,
  POLL_MS,
} from "./data.js";
import { initWallet, renderWallet } from "./wallet.js";
import { initGuesses, renderGuesses } from "./guesses.js";
import { wheelArt, miniWheel } from "./visuals.js";

const overlay = new URLSearchParams(location.search).get("overlay") === "1";
let allTime = false;
let motionPaused = false;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
/** @type {Animation[]} */
const rotors = [];
/** @type {import('./types').Stats | null} */
let chartData = null;

if (overlay) el("overlay-wheel").innerHTML = miniWheel();
else el("wheel-art").innerHTML = wheelArt();

document.querySelectorAll(".wheel-rotor").forEach((rotor) => {
  const animation = rotor.animate(
    [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    { duration: 60000, iterations: Infinity },
  );
  animation.pause();
  rotors.push(animation);
});

function updateMotion() {
  const rpm = (feeds.status.data?.measurement.rpmMilli || 0) / 1000;
  const running =
    liveState() === "running" &&
    rpm > 0 &&
    !reduceMotion.matches &&
    !motionPaused;
  for (const animation of rotors) {
    if (running) {
      animation.updatePlaybackRate(rpm);
      if (animation.playState !== "running") animation.play();
    } else animation.pause();
  }
  if (!overlay) {
    const button = el("motion-toggle");
    /** @type {HTMLButtonElement} */ (button).disabled = reduceMotion.matches;
    button.setAttribute(
      "aria-label",
      reduceMotion.matches
        ? "Wheel animation paused by your reduced motion setting"
        : motionPaused
          ? "Resume wheel animation"
          : "Pause wheel animation",
    );
    button.setAttribute(
      "title",
      reduceMotion.matches
        ? "Animation paused by your reduced motion setting"
        : motionPaused
          ? "Resume wheel animation"
          : "Pause wheel animation",
    );
    button.textContent = motionPaused || reduceMotion.matches ? "▷" : "Ⅱ";
  }
}

/** @param {number} mm */
function renderOdometer(mm) {
  const value = (mm / 1e6).toFixed(3).padStart(7, "0");
  const odometer = el("odometer");
  odometer.setAttribute(
    "aria-label",
    `${number(mm / 1e6, 3)} kilometres tonight`,
  );
  odometer.classList.toggle("long-distance", value.length > 8);
  const characters = value.split("");
  if (odometer.dataset.characters !== String(characters.length)) {
    odometer.innerHTML = characters
      .map((char, i) =>
        char === "."
          ? '<span class="odometer-dot" aria-hidden="true">.</span>'
          : `<span class="digit-window${i > value.indexOf(".") ? " fraction" : ""}" aria-hidden="true"><span class="digit-strip">${Array.from({ length: 10 }, (_, digit) => `<span>${digit}</span>`).join("")}</span></span>`,
      )
      .join("");
    odometer.dataset.characters = String(characters.length);
  }
  let index = 0;
  odometer.querySelectorAll(".digit-strip").forEach((strip) => {
    if (characters[index] === ".") index++;
    /** @type {HTMLElement} */ (strip).style.setProperty(
      "--digit",
      characters[index++],
    );
  });
}

function renderLive() {
  const state = liveState();
  const m = feeds.status.data?.measurement;
  const status =
    state === "running"
      ? "SQUEEKTOSHI IS RUNNING"
      : state === "resting"
        ? "RESTING"
        : state === "offline"
          ? "WHEEL OFFLINE"
          : "CONNECTING TO THE WHEEL";
  if (!overlay) {
    text("wheel-status", status);
    el("status-dot").classList.toggle("running", state === "running");
    text("night-date", `Night of ${dateLabel(nightDate())}`);
    if (m) {
      renderOdometer(m.distanceMm);
      text("speed", number(m.speedMmPerSecond * 0.0036, 2));
      text("rpm", number(m.rpmMilli / 1000, 1));
      text(
        "distance-caption",
        state === "offline"
          ? "Last known readings; reconnecting to the wheel."
          : state === "resting"
            ? "The wheel is resting between runs."
            : "Every little kilometre counts.",
      );
    }
    const measured = m?.observedAt
      ? Date.parse(m.observedAt)
      : feeds.status.updatedAt;
    text(
      "last-updated",
      state === "offline" && m
        ? `Last updated ${age(Math.min(measured, feeds.status.updatedAt))}`
        : healthLabel(feeds.status),
    );
  } else {
    text(
      "overlay-status",
      state === "running"
        ? "RUNNING"
        : state === "resting"
          ? "RESTING"
          : state === "offline"
            ? "WHEEL OFFLINE"
            : "CONNECTING",
    );
    el("overlay")
      .querySelector(".status-dot")
      ?.classList.toggle("running", state === "running");
    if (m) {
      text("overlay-distance", (m.distanceMm / 1e6).toFixed(3));
      text("overlay-speed", number(m.speedMmPerSecond * 0.0036, 2));
    }
    text(
      "overlay-health",
      state === "offline"
        ? feeds.status.updatedAt
          ? `· last updated ${age(feeds.status.updatedAt)}`
          : "· reconnecting"
        : "",
    );
  }
  updateMotion();
}

function renderChain() {
  const anchor = feeds.status.data?.builder.anchor;
  if (anchor) {
    text("block-height", `#${number(Number(anchor.blockHeight))}`);
    const progress = Math.min(1e9, Math.max(0, Number(anchor.blockProgress)));
    /** @type {HTMLProgressElement} */ (el("block-progress")).value = progress;
    text("block-progress-label", `${number(progress / 1e7, 1)}%`);
    el("block-progress").setAttribute(
      "aria-valuetext",
      `${number(progress / 1e7, 1)} percent to the next block`,
    );
  }
  const economy = feeds.economy.data;
  if (economy) {
    text("minted", formatSqk(economy.supply.totalMintedBaseUnits));
    const token = /** @type {HTMLAnchorElement} */ (el("token-link"));
    token.href = `https://sepolia.etherscan.io/address/${economy.identities.token}`;
    token.textContent = `${economy.identities.token} ↗`;
  }
  text(
    "economy-health",
    feeds.economy.failed ? healthLabel(feeds.economy) : "",
  );
  const settlements = feeds.settlements.data;
  if (settlements) {
    const total = (
      /** @type {'workAdded'|'settlementCount'|'completedBlockCount'} */ field,
    ) =>
      settlements.buckets
        .reduce((sum, bucket) => sum + BigInt(bucket[field]), 0n)
        .toLocaleString("en-GB");
    text("settlement-count", total("settlementCount"));
    text("completed-blocks", total("completedBlockCount"));
    text("work-added", total("workAdded"));
  }
  text(
    "settlements-health",
    feeds.settlements.failed ? healthLabel(feeds.settlements) : "",
  );
}

function renderConversions() {
  const distanceMm = allTime
    ? feeds.stats.data
      ? Number(feeds.stats.data.lifetime.observedDistanceMm)
      : null
    : (feeds.status.data?.measurement.distanceMm ?? null);
  if (distanceMm !== null) {
    const metres = distanceMm / 1000;
    text("marathon", number((metres / 42195) * 100, 1));
    text("track", number(metres / 400, 1));
    text("pitch", number(metres / 346, 1));
  } else ["marathon", "track", "pitch"].forEach((id) => text(id, "—"));
  text(
    "conversion-source",
    allTime
      ? distanceMm === null
        ? "Waiting for lifetime distance from the stats feed."
        : `Based on ${number(distanceMm / 1e6, 3)} km of all-time observed distance.${feeds.stats.failed ? " Last known values." : ""}`
      : "Based on tonight’s measured distance.",
  );
}

function renderChart() {
  const stats = feeds.stats.data;
  text("stats-health", feeds.stats.failed ? healthLabel(feeds.stats) : "");
  if (!stats) {
    if (feeds.stats.failed)
      el("night-chart").innerHTML =
        '<p class="muted chart-loading">Nightly data is unavailable. Retrying automatically.</p>';
    return;
  }
  if (stats === chartData) return;
  chartData = stats;
  const days = stats.activity.days.slice(-30);
  const observed = days.filter((day) => day.distanceMm !== null);
  const maximum = Math.max(0, ...observed.map((day) => Number(day.distanceMm)));
  const record = observed.find((day) => Number(day.distanceMm) === maximum);
  text(
    "record-summary",
    record
      ? `⚑ Best observed: ${number(maximum / 1e6, 3)} km · ${dateLabel(record.date)}`
      : "No measured nights yet",
  );
  const chart = el("night-chart");
  chart.style.gridTemplateColumns = `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))`;
  chart.innerHTML = days
    .map((day, index) => {
      const missing = day.distanceMm === null;
      const mm = Number(day.distanceMm || 0);
      const height = missing
        ? 0
        : maximum
          ? Math.max((mm / maximum) * 100, mm > 0 ? 1 : 0)
          : 0;
      const isRecord = !missing && day.date === record?.date;
      const partial = !missing && (day.coverage?.coverageBps ?? 0) < 10000;
      const description = `${dateLabel(day.date, true)}: ${missing ? "no data" : `${number(mm / 1e6, 3)} km${partial ? ", partial coverage" : ""}`}${isRecord ? ", record night" : ""}`;
      return `<div class="night-bar${missing ? " missing" : ""}${isRecord ? " record" : ""}" style="--height:${height}%;--center:${((index + 0.5) / days.length) * 100}%" tabindex="0" role="img" aria-label="${escapeHtml(description)}"><span class="bar-fill"></span><span class="chart-tip" aria-hidden="true">${escapeHtml(description)}</span></div>`;
    })
    .join("");
  if (days.length) {
    text("chart-start", dateLabel(days[0].date));
    text("chart-middle", dateLabel(days[Math.floor(days.length / 2)].date));
    text("chart-end", dateLabel(days[days.length - 1].date));
    text(
      "chart-range",
      `${dateLabel(days[0].date)} – ${dateLabel(days[days.length - 1].date)}`,
    );
  }
  text(
    "chart-coverage",
    `${observed.length} of ${days.length} nights have data. Dates follow noon-to-noon UTC; the current night is still growing.`,
  );
  el("night-data-rows").innerHTML = days
    .slice()
    .reverse()
    .map(
      (day) =>
        `<tr><th scope="row">${dateLabel(day.date, true)}</th><td>${day.distanceMm === null ? "—" : `${number(Number(day.distanceMm) / 1e6, 3)} km`}</td><td>${day.distanceMm === null ? "No data" : (day.coverage?.coverageBps ?? 0) < 10000 ? "Partial" : day.date === nightDate() ? "In progress" : "Complete"}</td></tr>`,
    )
    .join("");
}

function render() {
  renderLive();
  if (overlay) return;
  renderChain();
  renderConversions();
  renderChart();
  renderWallet();
  renderGuesses();
}

function overlayUrl() {
  const url = new URL(location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set("overlay", "1");
  url.searchParams.set(
    "size",
    /** @type {HTMLSelectElement} */ (el("overlay-size")).value,
  );
  url.searchParams.set(
    "theme",
    /** @type {HTMLSelectElement} */ (el("overlay-theme")).value,
  );
  return url.href;
}

function setupOverlayControls() {
  const update = () => {
    /** @type {HTMLAnchorElement} */ (el("preview-overlay")).href =
      overlayUrl();
    text(
      "obs-dimensions",
      /** @type {HTMLSelectElement} */ (el("overlay-size")).value === "large"
        ? "Use a 540 × 220 canvas."
        : "Use a 380 × 160 canvas.",
    );
  };
  const copy = async () => {
    const url = overlayUrl();
    try {
      await navigator.clipboard.writeText(url);
      text(
        "overlay-feedback",
        "Overlay link copied. Paste it into an OBS Browser source.",
      );
      text("copy-overlay-top", "Overlay link copied ✓");
      el("overlay-copy-fallback").hidden = true;
    } catch {
      el("overlay-copy-fallback").hidden = false;
      const input = /** @type {HTMLInputElement} */ (el("overlay-url"));
      input.value = url;
      input.focus();
      input.select();
      text(
        "overlay-feedback",
        "Automatic copying is unavailable. Copy the selected link below.",
      );
      el("overlay-copy-fallback").scrollIntoView({ block: "center" });
    }
  };
  el("overlay-size").addEventListener("change", update);
  el("overlay-theme").addEventListener("change", update);
  el("copy-overlay").addEventListener("click", () => void copy());
  el("copy-overlay-top").addEventListener("click", () => void copy());
  update();
}

if (!overlay) {
  initWallet({
    onChange: renderWallet,
    getDistance: () =>
      liveState() === "offline"
        ? null
        : (feeds.status.data?.measurement.distanceMm ?? null),
    getToken: () =>
      !feeds.economy.failed &&
      Date.now() - feeds.economy.updatedAt < 120000 &&
      isAddress(feeds.economy.data?.identities.token)
        ? feeds.economy.data.identities.token
        : null,
  });
  initGuesses();
  setupOverlayControls();
  el("period-tonight").addEventListener("click", () => selectPeriod(false));
  el("period-all").addEventListener("click", () => selectPeriod(true));
  el("refresh").addEventListener("click", async () => {
    const button = /** @type {HTMLButtonElement} */ (el("refresh"));
    button.disabled = true;
    button.textContent = "Refreshing…";
    await refresh();
    button.disabled = false;
    button.textContent = "Refresh ↻";
  });
  el("motion-toggle").addEventListener("click", () => {
    motionPaused = !motionPaused;
    updateMotion();
  });
  el("show-night-data").addEventListener("click", () => {
    const expanded =
      el("show-night-data").getAttribute("aria-expanded") !== "true";
    el("show-night-data").setAttribute("aria-expanded", String(expanded));
    text(
      "show-night-data",
      expanded ? "Hide night data ↑" : "View night data ↓",
    );
    el("night-data").hidden = !expanded;
  });
}

/** @param {boolean} value */
function selectPeriod(value) {
  allTime = value;
  el("period-tonight").setAttribute("aria-pressed", String(!value));
  el("period-all").setAttribute("aria-pressed", String(value));
  renderConversions();
}

reduceMotion.addEventListener("change", updateMotion);
subscribe(render);
render();
void refresh();
window.setInterval(() => void refresh(), POLL_MS);
window.setInterval(() => {
  renderLive();
  if (!overlay) renderWallet();
}, 5000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});
