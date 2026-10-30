import { age, isAddress, numeric, readStorage, writeStorage } from "./utils.js";

export const API = "https://api.squeekchain.com/v1";
export const POLL_MS = 15000;

/** @template T @param {string} key @param {(data: any) => boolean} validate @returns {import('./types').Dataset<T>} */
function dataset(key, validate) {
  const cached = readStorage(`cache:${key}`, null);
  if (cached && numeric(cached.updatedAt) && validate(cached.data))
    return { data: cached.data, updatedAt: cached.updatedAt, failed: true };
  return { data: null, updatedAt: 0, failed: false };
}

/** @param {any} data */
function validStatus(data) {
  const m = data?.measurement;
  return (
    !!m &&
    typeof m.coreStatus === "string" &&
    typeof m.freshness === "string" &&
    numeric(m.distanceMm) &&
    numeric(m.rpmMilli) &&
    numeric(m.speedMmPerSecond) &&
    numeric(m.cumulativeWorkUnits) &&
    numeric(data?.builder?.anchor?.blockHeight) &&
    numeric(data?.builder?.anchor?.blockProgress)
  );
}
/** @param {any} data */
function validEconomy(data) {
  return (
    isAddress(data?.identities?.token) &&
    /^\d+$/.test(data?.supply?.totalMintedBaseUnits) &&
    (!data.chain?.chainId || String(data.chain.chainId) === "11155111")
  );
}
/** @param {any} data */
function validStats(data) {
  return (
    numeric(data?.lifetime?.observedDistanceMm) &&
    Array.isArray(data?.activity?.days) &&
    data.activity.days.every(
      (/** @type {any} */ day) =>
        /^\d{4}-\d{2}-\d{2}$/.test(day.date) &&
        (day.distanceMm === null || numeric(day.distanceMm)),
    )
  );
}
/** @param {any} data */
function validSettlements(data) {
  return (
    Array.isArray(data?.buckets) &&
    data.buckets.every(
      (/** @type {any} */ b) =>
        /^\d+$/.test(b.workAdded) &&
        /^\d+$/.test(b.settlementCount) &&
        /^\d+$/.test(b.completedBlockCount),
    )
  );
}

export const feeds = {
  status:
    /** @type {import('./types').Dataset<import('./types').LiveStatus>} */ (
      dataset("status", validStatus)
    ),
  economy: /** @type {import('./types').Dataset<import('./types').Economy>} */ (
    dataset("economy", validEconomy)
  ),
  stats: /** @type {import('./types').Dataset<import('./types').Stats>} */ (
    dataset("stats", validStats)
  ),
  settlements:
    /** @type {import('./types').Dataset<import('./types').Settlements>} */ (
      dataset("settlements", validSettlements)
    ),
};

let inFlight = false;
/** @type {Set<() => void>} */
const listeners = new Set();
/** @param {() => void} listener */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** All four feeds refresh independently; one broken feed never erases another. */
export async function refresh() {
  if (inFlight) return;
  inFlight = true;
  try {
    await Promise.allSettled([
      load("status", "status", validStatus),
      load("economy", "economy/state", validEconomy),
      load("stats", "measurement/stats?range=30d", validStats),
      load("settlements", "settlements?range=24h", validSettlements),
    ]);
  } finally {
    inFlight = false;
    listeners.forEach((fn) => fn());
  }
}

/** @param {keyof typeof feeds} key @param {string} path @param {(data: any) => boolean} validate */
async function load(key, path, validate) {
  const feed = feeds[key];
  try {
    const response = await fetch(`${API}/${path}`, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!validate(data)) throw new Error("Unexpected API response");
    feed.data = data;
    feed.updatedAt = Date.now();
    feed.failed = false;
    writeStorage(`cache:${key}`, { data, updatedAt: feed.updatedAt });
  } catch {
    feed.failed = true;
  }
  listeners.forEach((fn) => fn());
}

/** @param {import('./types').Dataset<unknown>} feed */
export function healthLabel(feed) {
  if (!feed.data)
    return feed.failed
      ? "Feed unavailable · retrying every 15 seconds"
      : "Waiting for data…";
  if (feed.failed) return `Last updated ${age(feed.updatedAt)} · reconnecting`;
  return `Updated ${age(feed.updatedAt)}`;
}

export function liveState() {
  const { data, failed, updatedAt } = feeds.status;
  if (!data) return failed ? "offline" : "loading";
  const measurement = data.measurement;
  const observed = measurement.observedAt
    ? Date.parse(measurement.observedAt)
    : updatedAt;
  const staleAfter = (measurement.staleAfterSeconds || 120) * 1000;
  if (
    failed ||
    !["online", "fresh"].includes(measurement.freshness.toLowerCase()) ||
    Date.now() - observed > staleAfter ||
    Date.now() - updatedAt > staleAfter
  )
    return "offline";
  if (measurement.coreStatus === "SPINNING") return "running";
  if (measurement.coreStatus === "IDLE") return "resting";
  return "offline";
}

/** Keep every SQK digit exact before choosing the displayed 2 decimal places. @param {string} baseUnits */
export function formatSqk(baseUnits) {
  const value = BigInt(baseUnits);
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n)
    .toString()
    .padStart(18, "0")
    .slice(0, 2);
  return `${whole.toLocaleString("en-GB")}.${fraction}`;
}
