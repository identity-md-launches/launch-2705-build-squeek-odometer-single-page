/** @template {HTMLElement} T @param {string} id @returns {T} */
export function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return /** @type {T} */ (node);
}

/** @param {string} id @param {string | number} value */
export function text(id, value) {
  el(id).textContent = String(value);
}

/** @param {number} value @param {number} [digits] */
export function number(value, digits = 0) {
  return Number.isFinite(value)
    ? value.toLocaleString("en-GB", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
}

/** @param {unknown} value */
export function numeric(value) {
  return (
    (typeof value === "number" ||
      (typeof value === "string" && value.trim() !== "")) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
  );
}

/** @param {unknown} address @returns {address is string} */
export function isAddress(address) {
  return (
    typeof address === "string" &&
    /^0x[\da-f]{40}$/i.test(address) &&
    !/^0x0{40}$/i.test(address)
  );
}

/** @param {string} value */
export function short(value) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] || char,
  );
}

/** @param {string} date @param {boolean} [year] */
export function dateLabel(date, year = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** API activity days begin at noon UTC; the date names the evening the night started. @param {number} [now] */
export function nightDate(now = Date.now()) {
  return new Date(now - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** @param {number} timestamp */
export function age(timestamp) {
  if (!timestamp) return "not yet updated";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  return minutes < 1 ? "less than a min ago" : `${number(minutes)} min ago`;
}

/** @param {unknown} error */
export function errorMessage(error) {
  const code = /** @type {{code?: number}} */ (error)?.code;
  if (code === 4001 || code === 5000)
    return "Request declined in your wallet. You can try again.";
  if (code === -32002)
    return "A request is already open. Check your wallet to continue.";
  return "The wallet request could not finish. Check your wallet and try again.";
}

/** @param {string} key @param {unknown} fallback @returns {any} */
export function readStorage(key, fallback) {
  try {
    return (
      JSON.parse(localStorage.getItem(`squeek:${key}`) || "null") ?? fallback
    );
  } catch {
    return fallback;
  }
}

/** @param {string} key @param {unknown} value */
export function writeStorage(key, value) {
  try {
    localStorage.setItem(`squeek:${key}`, JSON.stringify(value));
    return true;
  } catch {
    const notice = document.getElementById("storage-notice");
    if (notice) {
      notice.hidden = false;
      notice.textContent =
        "Browser storage is unavailable or full. Your guesses and check-ins will only last for this visit.";
    }
    return false;
  }
}

/** @param {string} key */
export function removeStorage(key) {
  try {
    localStorage.removeItem(`squeek:${key}`);
  } catch {
    /* Restricted storage. */
  }
}
