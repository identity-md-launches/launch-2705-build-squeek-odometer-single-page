declare module "@coinbase/wallet-sdk" {
  export function createCoinbaseWalletSDK(options: {
    appName: string;
    appLogoUrl?: string;
    appChainIds?: number[];
    preference?: { options: "smartWalletOnly" | "all" };
  }): { getProvider(): import("./types").Provider };
}
