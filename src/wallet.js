import {
  el,
  errorMessage,
  escapeHtml,
  isAddress,
  readStorage,
  removeStorage,
  short,
  text,
  writeStorage,
} from "./utils.js";

export const CHAIN_ID = "0xaa36a7";
export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://sepolia.etherscan.io";

/** @type {{provider: import('./types').Provider | null, address: string | null, chainId: string | null, busy: boolean, sending: boolean, walletId: string | null}} */
export const walletState = {
  provider: null,
  address: null,
  chainId: null,
  busy: false,
  sending: false,
  walletId: null,
};
/** @type {Map<string, import('./types').Wallet>} */
const wallets = new Map();
/** @type {Set<string>} */
const watching = new Set();
/** @type {() => void} */
let notify = () => {};
/** @type {() => number | null} */
let distance = () => null;
/** @type {() => string | null} */
let tokenAddress = () => null;
/** @type {(() => void) | null} */
let detach = null;
let restoring = false;

const storedHistory = readStorage("checkins", []);
/** @type {import('./types').CheckIn[]} */
export const checkins = Array.isArray(storedHistory)
  ? storedHistory
      .filter(
        (item) =>
          /^0x[\da-f]{64}$/i.test(item?.hash) &&
          isAddress(item?.address) &&
          Number.isFinite(item?.time) &&
          (item.distanceMm === null ||
            (Number.isFinite(item.distanceMm) && item.distanceMm >= 0)) &&
          ["pending", "success", "failed"].includes(item.status),
      )
      .slice(0, 100)
  : [];

/** @param {{onChange: () => void, getDistance: () => number | null, getToken: () => string | null}} options */
export function initWallet(options) {
  notify = options.onChange;
  distance = options.getDistance;
  tokenAddress = options.getToken;
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = /** @type {CustomEvent<import('./types').Wallet>} */ (event)
      .detail;
    if (
      !detail?.info?.uuid ||
      typeof detail.info.name !== "string" ||
      typeof detail.provider?.request !== "function"
    )
      return;
    wallets.set(detail.info.uuid, detail);
    renderPicker();
    if (readStorage("wallet", null) === detail.info.rdns)
      void restore(detail.provider, detail.info.rdns);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  el("connect-wallet").addEventListener("click", async () => {
    if (
      walletState.provider &&
      walletState.address &&
      walletState.chainId !== CHAIN_ID
    ) {
      await switchChain();
      return;
    }
    openPicker();
  });
  el("close-wallet").addEventListener("click", closePicker);
  el("wallet-dialog").addEventListener("click", (event) => {
    if (event.target !== el("wallet-dialog")) return;
    const r = el("wallet-dialog").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closePicker();
  });
  el("wallet-dialog").addEventListener("close", () =>
    el("connect-wallet").focus(),
  );
  el("checkin").addEventListener("click", () => void sendCheckIn());
  if (window.ethereum && readStorage("wallet", null) === "browser")
    void restore(window.ethereum, "browser");
  if (readStorage("wallet", null) === "coinbase") {
    void smartProvider()
      .then((provider) => restore(provider, "coinbase"))
      .catch(() => {});
  }
  for (const item of checkins.filter((item) => item.status === "pending"))
    void watchReceipt(item);
  renderPicker();
  notify();
}

function openPicker() {
  text("wallet-feedback", "");
  renderPicker();
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  /** @type {HTMLDialogElement} */ (el("wallet-dialog")).showModal();
}

function closePicker() {
  /** @type {HTMLDialogElement} */ (el("wallet-dialog")).close();
}

function mobile() {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !window.ethereum &&
    wallets.size === 0
  );
}

/** @returns {Promise<import('./types').Provider>} */
async function smartProvider() {
  const { createCoinbaseWalletSDK } = await import("@coinbase/wallet-sdk");
  return createCoinbaseWalletSDK({
    appName: "Squeek Odometer",
    appLogoUrl: new URL("favicon.svg", document.baseURI).href,
    appChainIds: [11155111],
    preference: { options: "smartWalletOnly" },
  }).getProvider();
}

function renderPicker() {
  const list = el("wallet-list");
  // Keep a pending row and keyboard focus stable as late wallet announcements arrive.
  if (
    walletState.busy ||
    (el("wallet-dialog").contains(document.activeElement) &&
      document.activeElement?.closest(".wallet-row"))
  )
    return;
  list.replaceChildren();
  if (walletState.address) {
    text("wallet-intro", `Connected as ${walletState.address}`);
    const connected = Array.from(wallets.values()).find(
      (wallet) => wallet.info.rdns === walletState.walletId,
    );
    const icon = connected?.info.icon;
    const disconnect = row(
      "Disconnect wallet",
      icon && /^data:image\//i.test(icon)
        ? icon
        : walletState.walletId === "coinbase"
          ? "wallets/coinbase.svg"
          : "favicon.svg",
      !!icon && /^data:image\//i.test(icon),
    );
    disconnect.addEventListener("click", () => {
      disconnectWallet();
      closePicker();
    });
    list.append(disconnect);
  } else {
    text("wallet-intro", "Choose a wallet for Sepolia testnet.");
    if (mobile()) {
      const url = location.href;
      const links = [
        {
          name: "MetaMask",
          icon: "metamask",
          href: `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
        },
        {
          name: "Coinbase Wallet",
          icon: "coinbase",
          href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
        },
        {
          name: "Rabby",
          icon: "rabby",
          href: `https://go.rabby.io/mobile/?url=${encodeURIComponent(url)}`,
        },
        {
          name: "Phantom",
          icon: "phantom",
          href: `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(location.origin)}`,
        },
      ];
      for (const link of links) {
        const anchor = document.createElement("a");
        anchor.className = "wallet-row";
        anchor.href = link.href;
        anchor.innerHTML = `<img src="${new URL(`wallets/${link.icon}.svg`, document.baseURI).href}" width="28" height="28" alt=""><span>Open in ${link.name}</span><span class="row-end" aria-hidden="true">↗</span>`;
        list.append(anchor);
      }
    }
    for (const wallet of wallets.values()) {
      const icon =
        typeof wallet.info.icon === "string" &&
        /^data:image\/(svg\+xml|png|webp|jpeg)[;,]/i.test(wallet.info.icon)
          ? wallet.info.icon
          : "";
      const button = row(wallet.info.name, icon, true);
      button.addEventListener(
        "click",
        () => void connect(wallet.provider, wallet.info.rdns, button),
      );
      list.append(button);
    }
    if (wallets.size === 0 && window.ethereum) {
      const button = row("Browser wallet", "favicon.svg");
      button.addEventListener(
        "click",
        () =>
          window.ethereum && void connect(window.ethereum, "browser", button),
      );
      list.append(button);
    }
    const smart = row(
      mobile() ? "Coinbase Smart Wallet" : "Coinbase Wallet · use a passkey",
      "wallets/coinbase.svg",
    );
    smart.addEventListener("click", async () => {
      if (walletState.busy) return;
      setBusy(true, smart);
      try {
        const provider = await smartProvider();
        setBusy(false);
        await connect(provider, "coinbase", smart);
      } catch {
        text(
          "wallet-feedback",
          "Coinbase Wallet could not open. Check your connection and try again.",
        );
        setBusy(false);
      }
    });
    list.append(smart);
    if (!mobile() && !wallets.size && !window.ethereum) {
      const hint = document.createElement("p");
      hint.className = "wallet-help";
      hint.textContent =
        "No browser wallets found. Enable your wallet extension, or use Coinbase Wallet with a passkey.";
      list.append(hint);
    }
  }
}

/** @param {string} label @param {string} icon @param {boolean} [data] */
function row(label, icon, data = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wallet-row";
  if (icon) {
    const image = document.createElement("img");
    image.src = data ? icon : new URL(icon, document.baseURI).href;
    image.width = 28;
    image.height = 28;
    image.alt = "";
    button.append(image);
  }
  const name = document.createElement("span");
  name.textContent = label;
  button.append(name);
  const arrow = document.createElement("span");
  arrow.className = "row-end";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";
  button.append(arrow);
  return button;
}

/** @param {boolean} busy @param {HTMLButtonElement} [button] */
function setBusy(busy, button) {
  walletState.busy = busy;
  el("wallet-list")
    .querySelectorAll("button")
    .forEach((row) => {
      row.disabled = busy;
    });
  if (button)
    button
      .querySelector(".row-end")
      ?.replaceChildren(document.createTextNode(busy ? "Opening…" : "↗"));
  notify();
}

/** @param {import('./types').Provider} provider @param {string} id @param {HTMLButtonElement} button */
async function connect(provider, id, button) {
  if (walletState.busy) return;
  text("wallet-feedback", "");
  setBusy(true, button);
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!Array.isArray(accounts) || !isAddress(accounts[0]))
      throw new Error("No account");
    const chain = await provider.request({ method: "eth_chainId" });
    activate(provider, id, accounts[0], String(chain));
    closePicker();
    if (walletState.chainId !== CHAIN_ID) await switchChain();
  } catch (error) {
    text("wallet-feedback", errorMessage(error));
  } finally {
    setBusy(false, button);
  }
}

/** @param {import('./types').Provider} provider @param {string} id */
async function restore(provider, id) {
  if (walletState.provider || walletState.busy || restoring) return;
  restoring = true;
  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    if (Array.isArray(accounts) && isAddress(accounts[0])) {
      const chain = await provider.request({ method: "eth_chainId" });
      if (!walletState.provider)
        activate(provider, id, accounts[0], String(chain));
    }
  } catch {
    /* Reconnection must never open a permission prompt. */
  } finally {
    restoring = false;
  }
}

/** @param {import('./types').Provider} provider @param {string} id @param {string} address @param {string} chain */
function activate(provider, id, address, chain) {
  detach?.();
  Object.assign(walletState, {
    provider,
    walletId: id,
    address,
    chainId: chain.toLowerCase(),
  });
  writeStorage("wallet", id);
  const accountsChanged = (/** @type {unknown} */ accounts) => {
    if (!Array.isArray(accounts) || !isAddress(accounts[0])) {
      disconnectWallet();
      return;
    }
    walletState.address = accounts[0];
    notify();
  };
  const chainChanged = (/** @type {unknown} */ chain) => {
    walletState.chainId = String(chain).toLowerCase();
    notify();
  };
  const disconnected = () => disconnectWallet();
  provider.on?.("accountsChanged", accountsChanged);
  provider.on?.("chainChanged", chainChanged);
  provider.on?.("disconnect", disconnected);
  detach = () => {
    provider.removeListener?.("accountsChanged", accountsChanged);
    provider.removeListener?.("chainChanged", chainChanged);
    provider.removeListener?.("disconnect", disconnected);
  };
  notify();
}

function disconnectWallet() {
  const oldProvider = walletState.provider;
  const oldId = walletState.walletId;
  detach?.();
  detach = null;
  Object.assign(walletState, {
    provider: null,
    address: null,
    chainId: null,
    walletId: null,
  });
  removeStorage("wallet");
  if (oldId === "coinbase") void oldProvider?.disconnect?.().catch(() => {});
  text("transaction-status", "");
  notify();
}

export async function switchChain() {
  const provider = walletState.provider;
  if (!provider) return false;
  text("transaction-status", "Confirm the switch to Sepolia in your wallet.");
  try {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID }],
      });
    } catch (error) {
      if (/** @type {{code?:number}} */ (error)?.code !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID,
            chainName: "Sepolia",
            nativeCurrency: {
              name: "Sepolia Ether",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: [SEPOLIA_RPC],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID }],
      });
    }
    walletState.chainId = String(
      await provider.request({ method: "eth_chainId" }),
    ).toLowerCase();
    text(
      "transaction-status",
      walletState.chainId === CHAIN_ID
        ? "Connected to Sepolia. Ready for your check-in."
        : "Switch to Sepolia to check in.",
    );
    return walletState.chainId === CHAIN_ID;
  } catch (error) {
    text("transaction-status", errorMessage(error));
    return false;
  } finally {
    notify();
  }
}

/** ERC-20 approve(address,uint256); the spender is always the connected account, amount always zero. @param {string} address */
export function approvalData(address) {
  if (!isAddress(address)) throw new Error("Invalid account");
  return `0x095ea7b3${address.slice(2).toLowerCase().padStart(64, "0")}${"0".repeat(64)}`;
}

async function sendCheckIn() {
  const provider = walletState.provider;
  const address = walletState.address;
  const token = tokenAddress();
  if (
    !provider ||
    !address ||
    !isAddress(token) ||
    walletState.sending ||
    walletState.chainId !== CHAIN_ID
  )
    return;
  walletState.sending = true;
  el("transaction-link").hidden = true;
  text("transaction-status", "Confirm your 0 SQK check-in in your wallet.");
  notify();
  try {
    // Re-read accounts and chain immediately before requesting a transaction.
    const accounts = await provider.request({ method: "eth_accounts" });
    if (
      !Array.isArray(accounts) ||
      String(accounts[0]).toLowerCase() !== address.toLowerCase()
    )
      throw new Error("Account changed");
    const chain = String(
      await provider.request({ method: "eth_chainId" }),
    ).toLowerCase();
    walletState.chainId = chain;
    if (chain !== CHAIN_ID) {
      text(
        "transaction-status",
        "Your wallet changed networks. Switch to Sepolia to check in.",
      );
      return;
    }
    if (tokenAddress() !== token) {
      text(
        "transaction-status",
        "The token feed changed. Review the contract details and try again.",
      );
      return;
    }
    const capturedDistance = distance();
    const hash = await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          to: token,
          data: approvalData(address),
          value: "0x0",
          chainId: CHAIN_ID,
        },
      ],
    });
    if (typeof hash !== "string" || !/^0x[\da-f]{64}$/i.test(hash))
      throw new Error("Invalid transaction hash");
    const item = /** @type {import('./types').CheckIn} */ ({
      time: Date.now(),
      hash,
      distanceMm: capturedDistance,
      address,
      status: "pending",
    });
    checkins.unshift(item);
    checkins.splice(100);
    writeStorage("checkins", checkins);
    showTransaction(item);
    void watchReceipt(item);
  } catch (error) {
    text("transaction-status", errorMessage(error));
  } finally {
    walletState.sending = false;
    notify();
  }
}

/** @param {import('./types').CheckIn} item */
function showTransaction(item) {
  const link = /** @type {HTMLAnchorElement} */ (el("transaction-link"));
  link.hidden = false;
  link.href = `${EXPLORER}/tx/${item.hash}`;
  link.textContent = `${item.hash} ↗`;
  text(
    "transaction-status",
    item.status === "success"
      ? "Check-in confirmed. You were here."
      : item.status === "failed"
        ? "Check-in failed on-chain. No approval was made. You can try again."
        : "Check-in sent. Waiting for a Sepolia receipt…",
  );
}

/** @param {import('./types').CheckIn} item */
async function watchReceipt(item) {
  if (watching.has(item.hash)) return;
  watching.add(item.hash);
  let attempts = 0;
  const poll = async () => {
    if (item.status !== "pending") {
      watching.delete(item.hash);
      return;
    }
    attempts++;
    try {
      const response = await fetch(SEPOLIA_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getTransactionReceipt",
          params: [item.hash],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Receipt RPC unavailable");
      const { result, error } = await response.json();
      if (error) throw new Error("Receipt RPC error");
      if (result && ["0x1", "0x0"].includes(result.status)) {
        item.status = result.status === "0x1" ? "success" : "failed";
        writeStorage("checkins", checkins);
        if (checkins[0]?.hash === item.hash) showTransaction(item);
        notify();
        watching.delete(item.hash);
        return;
      }
    } catch {
      if (checkins[0]?.hash === item.hash)
        text(
          "transaction-status",
          "Receipt lookup is unavailable. Your check-in is saved as pending; follow the transaction link.",
        );
    }
    if (attempts < 120) window.setTimeout(() => void poll(), 6000);
    else {
      watching.delete(item.hash);
      if (checkins[0]?.hash === item.hash)
        text(
          "transaction-status",
          "Still pending. Follow the transaction link or reload to resume receipt checks.",
        );
    }
  };
  await poll();
}

export function renderWallet() {
  const { address, chainId, busy, sending } = walletState;
  text(
    "connect-label",
    busy
      ? "Opening wallet…"
      : address
        ? chainId === CHAIN_ID
          ? short(address)
          : "Switch to Sepolia"
        : "Connect wallet",
  );
  const connect = /** @type {HTMLButtonElement} */ (el("connect-wallet"));
  connect.disabled = busy || sending;
  connect.setAttribute(
    "aria-label",
    address
      ? chainId === CHAIN_ID
        ? `Wallet ${address}. Open wallet options`
        : "Switch to Sepolia"
      : "Connect wallet",
  );
  const button = /** @type {HTMLButtonElement} */ (el("checkin"));
  const token = tokenAddress();
  button.disabled =
    !address || chainId !== CHAIN_ID || !token || sending || busy;
  button.textContent = sending
    ? "Squeek check-in · signing…"
    : "Squeek check-in ↗";
  text(
    "checkin-hint",
    !address
      ? "Connect your wallet above to check in. Sepolia ETH is needed for gas."
      : chainId !== CHAIN_ID
        ? "Switch your wallet to Sepolia using the button above."
        : !token
          ? "Waiting for a fresh SQK token address. The economy feed must be available to check in."
          : "Ready on Sepolia. Your wallet will ask you to confirm. Sepolia ETH is needed for gas.",
  );
  const list = el("checkin-history");
  const visible = address
    ? checkins.filter(
        (item) => item.address.toLowerCase() === address.toLowerCase(),
      )
    : checkins;
  list.innerHTML = visible.length
    ? visible
        .slice(0, 6)
        .map(
          (item) =>
            `<li class="checkin-item"><a class="tx" href="${EXPLORER}/tx/${item.hash}" target="_blank" rel="noopener noreferrer" aria-label="Check-in transaction ${item.hash}">${short(item.hash)} ↗</a><span class="checkin-time">${escapeHtml(new Date(item.time).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))} · ${item.status === "success" ? "Confirmed" : item.status === "failed" ? "Failed" : "Pending"}</span><span class="distance">${item.distanceMm === null ? "Distance unavailable" : `${(item.distanceMm / 1e6).toFixed(3)} km`}</span></li>`,
        )
        .join("")
    : '<li class="muted caption">Your first check-in will appear here.</li>';
}
