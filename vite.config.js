import { resolve } from "node:path";

export default {
  base: "./",
  build: { target: "es2022", sourcemap: false },
  // Allows contributor tooling to live outside the submission. Normal npm installs need no override.
  resolve: {
    alias: process.env.SQUEEK_DEPS_ROOT
      ? {
          "@coinbase/wallet-sdk": resolve(
            process.env.SQUEEK_DEPS_ROOT,
            "@coinbase/wallet-sdk/dist/index.js",
          ),
        }
      : {},
  },
};
