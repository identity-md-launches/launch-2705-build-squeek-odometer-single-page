export interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
  disconnect?(): Promise<void>;
}
export interface Wallet {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Provider;
}
export interface CheckIn {
  time: number;
  hash: string;
  distanceMm: number | null;
  address: string;
  status: "pending" | "success" | "failed";
}
export interface Guess {
  date: string;
  km: number;
  savedAt: number;
  actualMm?: number;
}
export interface Night {
  date: string;
  distanceMm: number | null;
  coverage: {
    coverageBps: number;
    expectedRoundCount: number;
    observedRoundCount: number;
  };
}
export interface LiveStatus {
  generatedAt?: string;
  measurement: {
    coreStatus: string;
    rpmMilli: number;
    speedMmPerSecond: number;
    distanceMm: number;
    cumulativeWorkUnits: string;
    freshness: string;
    observedAt?: string;
    staleAfterSeconds?: number;
  };
  builder: { anchor: { blockHeight: string; blockProgress: string } };
}
export interface Economy {
  identities: { token: string };
  chain?: { chainId: string };
  supply: { totalMintedBaseUnits: string };
}
export interface Stats {
  generatedAt?: string;
  window?: { startAt: string; endAt: string };
  timezone?: string;
  lifetime: { observedDistanceMm: string };
  activity: { days: Night[] };
}
export interface Settlements {
  buckets: {
    workAdded: string;
    settlementCount: string;
    completedBlockCount: string;
  }[];
}
export interface Dataset<T> {
  data: T | null;
  updatedAt: number;
  failed: boolean;
}
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
