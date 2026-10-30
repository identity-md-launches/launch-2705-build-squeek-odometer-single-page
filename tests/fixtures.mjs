// Deterministic browser fixtures only. Production reads its token address from the economy API.
export const account = "0x1234567890123456789012345678901234567890";
export const token = "0x5501e1fa81be1c3f49225fa7668da0245d07db60";
export const txHash = `0x${"ab".repeat(32)}`;
export const currentNight = new Date(Date.now() - 12 * 3600000)
  .toISOString()
  .slice(0, 10);
export const previousNight = new Date(Date.now() - 36 * 3600000)
  .toISOString()
  .slice(0, 10);

export function fixtureData() {
  return {
    status: {
      generatedAt: new Date().toISOString(),
      measurement: {
        coreStatus: "SPINNING",
        rpmMilli: 90000,
        speedMmPerSecond: 1000,
        distanceMm: 12500000,
        cumulativeWorkUnits: "45000",
        freshness: "online",
        observedAt: new Date().toISOString(),
        staleAfterSeconds: 120,
      },
      builder: { anchor: { blockHeight: "4135", blockProgress: "250000000" } },
    },
    economy: {
      chain: { chainId: "11155111" },
      supply: { totalMintedBaseUnits: "16455437093891105632782689" },
      identities: { token },
    },
    settlements: {
      buckets: [
        { workAdded: "20", settlementCount: "2", completedBlockCount: "3" },
        { workAdded: "10", settlementCount: "1", completedBlockCount: "2" },
      ],
    },
    stats: {
      generatedAt: new Date().toISOString(),
      lifetime: { observedDistanceMm: "50000000" },
      activity: {
        days: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(
            Date.parse(`${currentNight}T12:00:00Z`) - (29 - i) * 86400000,
          )
            .toISOString()
            .slice(0, 10),
          distanceMm:
            i < 2
              ? null
              : i === 28
                ? "14000000"
                : i === 29
                  ? "12500000"
                  : String(5000000 + i * 100000),
          coverage: {
            coverageBps: i < 2 ? 0 : 10000,
            expectedRoundCount: 144,
            observedRoundCount: i < 2 ? 0 : 144,
          },
        })),
      },
    },
  };
}

/** Runs before the production bundle. No signing or actual RPC traffic occurs. */
export function injectWallets({
  account,
  txHash,
  chain = "0x1",
  reject = false,
  unknownChain = false,
}) {
  window.__walletCalls = [];
  window.__mockChain = chain;
  window.__mockAccounts = [account];
  window.__reject = reject;
  window.__unknownChain = unknownChain;
  window.__receiptStatus = "0x1";
  const listeners = new Map();
  const provider = {
    async request(args) {
      window.__walletCalls.push(args);
      if (args.method === "eth_requestAccounts") {
        if (window.__reject)
          throw Object.assign(new Error("User rejected"), { code: 4001 });
        return window.__mockAccounts;
      }
      if (args.method === "eth_accounts") return window.__mockAccounts;
      if (args.method === "eth_chainId") return window.__mockChain;
      if (args.method === "wallet_switchEthereumChain") {
        if (window.__unknownChain)
          throw Object.assign(new Error("Unknown chain"), { code: 4902 });
        window.__mockChain = args.params[0].chainId;
        listeners.get("chainChanged")?.(window.__mockChain);
        return null;
      }
      if (args.method === "wallet_addEthereumChain") {
        window.__unknownChain = false;
        return null;
      }
      if (args.method === "eth_sendTransaction") {
        if (window.__reject)
          throw Object.assign(new Error("User rejected"), { code: 4001 });
        return txHash;
      }
      throw new Error(`Unexpected wallet method: ${args.method}`);
    },
    on(event, listener) {
      listeners.set(event, listener);
    },
    removeListener(event) {
      listeners.delete(event);
    },
  };
  window.__walletEmit = (event, payload) => listeners.get(event)?.(payload);
  const announce = () => {
    for (const [uuid, name, rdns] of [
      ["mock-metamask", "MetaMask", "io.metamask"],
      ["mock-rabby", "Rabby", "io.rabby"],
    ]) {
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid,
              name,
              rdns,
              icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"%3E%3Crect width="28" height="28" fill="orange"/%3E%3C/svg%3E',
            },
            provider,
          },
        }),
      );
    }
  };
  window.addEventListener("eip6963:requestProvider", announce);
}
