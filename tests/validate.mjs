import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import {
  fixtureData,
  injectWallets,
  account,
  token,
  txHash,
  previousNight,
} from "./fixtures.mjs";

const require = createRequire(
  process.env.SQUEEK_DEPS_ROOT
    ? resolve(process.env.SQUEEK_DEPS_ROOT, "../package.json")
    : import.meta.url,
);
const { chromium, webkit } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const output =
  process.env.SQUEEK_TEST_OUT || join(tmpdir(), "squeek-validation");
await mkdir(output, { recursive: true });
const root = resolve("dist");
const results = [];
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/preview/")) throw new Error("Outside preview");
    const file = resolve(
      root,
      decodeURIComponent(pathname.slice("/preview/".length)) || "index.html",
    );
    if (!file.startsWith(`${root}/`)) throw new Error("Outside export");
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type":
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".woff2": "font/woff2",
        }[extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
let browser;

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function pageWithData(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...options,
  });
  const data = fixtureData();
  const control = { fail: false, malformed: false, requests: [] };
  await context.route("https://api.squeekchain.com/v1/**", async (route) => {
    const requestUrl = route.request().url();
    control.requests.push(requestUrl);
    const key = requestUrl.includes("/economy/")
      ? "economy"
      : requestUrl.includes("/measurement/")
        ? "stats"
        : requestUrl.includes("/settlements")
          ? "settlements"
          : "status";
    await route.fulfill({
      status: control.fail ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(control.malformed ? {} : data[key]),
    });
  });
  const page = await context.newPage();
  return { context, page, data, control };
}

async function ready(page) {
  await page.waitForFunction(
    () => document.getElementById("speed")?.textContent === "3.60",
  );
}

try {
  browser = await chromium.launch({ headless: true });

  await check(
    "Live API mapping, all-time conversions, chart and keyboard data disclosure",
    async () => {
      const { context, page } = await pageWithData();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      await ready(page);
      assert.equal(
        await page.locator("#wheel-status").textContent(),
        "SQUEEKTOSHI IS RUNNING",
      );
      assert.equal(await page.locator("#rpm").textContent(), "90.0");
      assert.equal(
        await page.locator("#odometer").getAttribute("aria-label"),
        "12.500 kilometres tonight",
      );
      assert.equal(await page.locator("#block-height").textContent(), "#4,135");
      assert.equal(
        await page.locator("#block-progress").getAttribute("aria-valuetext"),
        "25.0 percent to the next block",
      );
      assert.equal(
        await page.locator("#minted").textContent(),
        "16,455,437.09",
      );
      assert.equal(await page.locator("#work-added").textContent(), "30");
      assert.equal(await page.locator("#settlement-count").textContent(), "3");
      assert.equal(await page.locator("#completed-blocks").textContent(), "5");
      assert.equal(await page.locator(".night-bar").count(), 30);
      assert.equal(await page.locator(".night-bar.missing").count(), 2);
      assert.match(
        await page.locator(".night-bar.record").getAttribute("aria-label"),
        /14\.000 km.*record night/,
      );
      assert.equal(await page.locator("#marathon").textContent(), "29.6");
      await page.getByRole("button", { name: "All time", exact: true }).click();
      assert.equal(await page.locator("#track").textContent(), "125.0");
      await page.locator("#show-night-data").focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.locator("#show-night-data").getAttribute("aria-expanded"),
        "true",
      );
      assert.equal(await page.locator("#night-data-rows tr").count(), 30);
      await page.locator("#show-night-data").click();
      assert.equal(await page.locator("#night-data").isVisible(), false);
      assert.deepEqual(errors, []);
      await context.close();
    },
  );

  await check(
    "Guesses validate, persist across reloads, and score the correct completed night",
    async () => {
      const { context, page } = await pageWithData();
      await page.addInitScript(
        ({ previousNight }) => {
          if (!localStorage.getItem("squeek:guesses"))
            localStorage.setItem(
              "squeek:guesses",
              JSON.stringify([
                { date: previousNight, km: 13, savedAt: Date.now() - 86400000 },
              ]),
            );
        },
        { previousNight },
      );
      await page.goto(url);
      await ready(page);
      await page.locator("#save-guess").click();
      assert.equal(
        await page.locator("#guess-km").getAttribute("aria-invalid"),
        "true",
      );
      await page.locator("#guess-km").fill("12.3456");
      await page.locator("#save-guess").click();
      assert.match(
        await page.locator("#guess-feedback").textContent(),
        /3 decimal/,
      );
      await page.locator("#guess-km").fill("12.500");
      await page.locator("#save-guess").click();
      assert.match(
        await page.locator("#guess-feedback").textContent(),
        /12\.500 km saved on this device/,
      );
      assert.match(
        await page.locator("#guess-results").textContent(),
        /13\.000 → 14\.000 km/,
      );
      assert.match(
        await page.locator("#guess-results").textContent(),
        /1\.000 km under · 7\.1% off/,
      );
      await page.reload();
      await ready(page);
      assert.equal(await page.locator("#guess-km").inputValue(), "12.5");
      assert.match(
        await page.locator("#current-guess").textContent(),
        /12\.500 km/,
      );
      await page.locator("#guess-km").fill("0");
      await page.locator("#save-guess").click();
      assert.match(
        await page.locator("#guess-feedback").textContent(),
        /0\.000 km saved/,
      );
      await context.close();
    },
  );

  await check(
    "Last-good values survive HTTP failures, malformed responses and offline reloads; 15-second refresh",
    async () => {
      const { context, page, data, control } = await pageWithData();
      await page.clock.install();
      await page.goto(url);
      await ready(page);
      const requests = control.requests.length;
      await page.clock.fastForward(16000);
      await page.waitForFunction(
        () =>
          document.getElementById("wheel-status").textContent ===
          "SQUEEKTOSHI IS RUNNING",
      );
      assert.ok(
        control.requests.length >= requests + 4,
        "All four endpoints polled",
      );
      control.fail = true;
      await page.locator("#refresh").click();
      await page.waitForFunction(
        () =>
          document.getElementById("wheel-status").textContent ===
          "WHEEL OFFLINE",
      );
      assert.equal(
        await page.locator("#odometer").getAttribute("aria-label"),
        "12.500 kilometres tonight",
      );
      assert.match(
        await page.locator("#last-updated").textContent(),
        /Last updated .*min ago/,
      );
      assert.equal(
        await page.locator("#minted").textContent(),
        "16,455,437.09",
      );
      await page.reload();
      await page.waitForFunction(
        () =>
          document.getElementById("wheel-status").textContent ===
          "WHEEL OFFLINE",
      );
      assert.equal(
        await page.locator("#odometer").getAttribute("aria-label"),
        "12.500 kilometres tonight",
      );
      control.fail = false;
      control.malformed = true;
      await page.locator("#refresh").click();
      assert.equal(
        await page.locator("#minted").textContent(),
        "16,455,437.09",
      );
      control.malformed = false;
      data.status.measurement.coreStatus = "IDLE";
      await page.locator("#refresh").click();
      await page.waitForFunction(
        () => document.getElementById("wheel-status").textContent === "RESTING",
      );
      await context.close();
    },
  );

  await check(
    "EIP-6963 picker, Sepolia switch/add, exact zero approval, receipt and durable history",
    async () => {
      const { context, page } = await pageWithData();
      await page.addInitScript(injectWallets, {
        account,
        txHash,
        unknownChain: true,
      });
      let receipts = 0;
      await context.route(
        "https://ethereum-sepolia-rpc.publicnode.com/",
        async (route) => {
          const rpc = route.request().postDataJSON();
          assert.equal(rpc.method, "eth_getTransactionReceipt");
          assert.equal(rpc.params[0], txHash);
          receipts++;
          await route.fulfill({
            json: {
              jsonrpc: "2.0",
              id: 1,
              result: { status: "0x1", transactionHash: txHash },
            },
          });
        },
      );
      await page.goto(url);
      await ready(page);
      await page.locator("#connect-wallet").click();
      assert.equal(
        await page.getByRole("button", { name: "MetaMask" }).count(),
        1,
      );
      assert.equal(
        await page.getByRole("button", { name: "Rabby", exact: true }).count(),
        1,
      );
      await page.getByRole("button", { name: "Rabby", exact: true }).click();
      await page.waitForFunction(
        () => document.getElementById("checkin").disabled === false,
      );
      assert.equal(await page.locator("#wallet-dialog").isVisible(), false);
      assert.match(
        await page.locator("#transaction-note").textContent(),
        /approves 0 SQK to yourself on Sepolia testnet\.\s+It moves no\s+funds/,
      );
      await page.locator("#checkin").click();
      await page.waitForFunction(() =>
        document
          .getElementById("transaction-status")
          .textContent.includes("confirmed"),
      );
      const calls = await page.evaluate(() => window.__walletCalls);
      const add = calls.find(
        (call) => call.method === "wallet_addEthereumChain",
      );
      assert.equal(add.params[0].chainId, "0xaa36a7");
      const sent = calls.find((call) => call.method === "eth_sendTransaction")
        .params[0];
      assert.equal(sent.from, account);
      assert.equal(sent.to, token);
      assert.equal(sent.chainId, "0xaa36a7");
      assert.equal(sent.value, "0x0");
      assert.equal(
        sent.data,
        `0x095ea7b3${account.slice(2).padStart(64, "0")}${"0".repeat(64)}`,
      );
      assert.equal(sent.data.length, 138);
      assert.ok(receipts > 0);
      assert.equal(
        await page.locator("#transaction-link").getAttribute("href"),
        `https://sepolia.etherscan.io/tx/${txHash}`,
      );
      assert.match(
        await page.locator("#checkin-history").textContent(),
        /12\.500 km/,
      );
      await page.reload();
      await ready(page);
      // This provider fixture starts on mainnet on every load; restoration must retain the account and offer a switch.
      await page.waitForFunction(
        () =>
          document.getElementById("connect-label").textContent ===
          "Switch to Sepolia",
      );
      await page.locator("#connect-wallet").click();
      await page.waitForFunction(() =>
        document.getElementById("connect-label").textContent.includes("0x1234"),
      );
      assert.match(
        await page.locator("#checkin-history").textContent(),
        /Confirmed/,
      );
      await page.locator("#connect-wallet").click();
      await page.getByRole("button", { name: "Disconnect wallet" }).click();
      assert.equal(
        await page.locator("#connect-label").textContent(),
        "Connect wallet",
      );
      await context.close();
    },
  );

  await check(
    "Declined wallet request, wrong network, account changes and on-chain failure states",
    async () => {
      const { context, page } = await pageWithData();
      await page.addInitScript(injectWallets, {
        account,
        txHash,
        reject: true,
      });
      await context.route(
        "https://ethereum-sepolia-rpc.publicnode.com/",
        (route) =>
          route.fulfill({
            json: { jsonrpc: "2.0", id: 1, result: { status: "0x0" } },
          }),
      );
      await page.goto(url);
      await ready(page);
      await page.locator("#connect-wallet").click();
      await page.getByRole("button", { name: "MetaMask" }).click();
      await page.waitForFunction(() =>
        document
          .getElementById("wallet-feedback")
          .textContent.includes("declined"),
      );
      assert.equal(
        await page.getByRole("button", { name: "MetaMask" }).isEnabled(),
        true,
      );
      await page.evaluate(() => {
        window.__reject = false;
      });
      await page.getByRole("button", { name: "MetaMask" }).click();
      await page.waitForFunction(
        () => !document.getElementById("checkin").disabled,
      );
      await page.evaluate(() => {
        window.__mockChain = "0x1";
        window.__walletEmit("chainChanged", "0x1");
      });
      assert.equal(await page.locator("#checkin").isDisabled(), true);
      assert.equal(
        await page.locator("#connect-label").textContent(),
        "Switch to Sepolia",
      );
      await page.locator("#connect-wallet").click();
      await page.waitForFunction(
        () => !document.getElementById("checkin").disabled,
      );
      await page.locator("#checkin").click();
      await page.waitForFunction(() =>
        document
          .getElementById("transaction-status")
          .textContent.includes("failed on-chain"),
      );
      assert.match(
        await page.locator("#checkin-history").textContent(),
        /Failed/,
      );
      await page.evaluate(() => window.__walletEmit("accountsChanged", []));
      assert.equal(await page.locator("#checkin").isDisabled(), true);
      await context.close();
    },
  );

  await check(
    "OBS links, clipboard fallback, transparent small/large and light/dark overlays",
    async () => {
      const { context, page, control } = await pageWithData();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          value: {
            async writeText(text) {
              window.__copied = text;
            },
          },
        });
      });
      await page.goto(url);
      await ready(page);
      await page.locator("#overlay-size").selectOption("large");
      await page.locator("#overlay-theme").selectOption("light");
      await page.locator("#copy-overlay-top").click();
      assert.equal(
        await page.evaluate(() => window.__copied),
        `${url}?overlay=1&size=large&theme=light`,
      );
      await page.evaluate(() => {
        navigator.clipboard.writeText = async () => {
          throw new Error("Denied");
        };
      });
      await page.locator("#copy-overlay").click();
      assert.equal(
        await page.locator("#overlay-url").inputValue(),
        `${url}?overlay=1&size=large&theme=light`,
      );
      for (const size of ["small", "large"])
        for (const theme of ["dark", "light"]) {
          await page.setViewportSize({
            width: size === "large" ? 540 : 380,
            height: size === "large" ? 220 : 160,
          });
          await page.goto(`${url}?overlay=1&size=${size}&theme=${theme}`);
          await page.waitForFunction(
            () =>
              document.getElementById("overlay-distance").textContent ===
              "12.500",
          );
          assert.equal(await page.locator("#dashboard").isVisible(), false);
          assert.equal(
            await page.locator("#overlay-status").textContent(),
            "RUNNING",
          );
          assert.equal(
            await page.evaluate(
              () => getComputedStyle(document.body).backgroundColor,
            ),
            "rgba(0, 0, 0, 0)",
          );
          assert.equal(
            Math.round((await page.locator("#overlay").boundingBox()).width),
            size === "large" ? 520 : 360,
          );
          assert.equal(
            await page.evaluate(
              () =>
                document.getElementById("overlay").getBoundingClientRect()
                  .bottom <= innerHeight,
            ),
            true,
            "The documented OBS canvas contains the whole card",
          );
          await page.screenshot({
            path: join(output, `overlay-${size}-${theme}.png`),
            omitBackground: true,
          });
        }
      control.fail = true;
      await page.reload();
      await page.waitForFunction(
        () =>
          document.getElementById("overlay-status").textContent ===
          "WHEEL OFFLINE",
      );
      assert.match(
        await page.locator("#overlay-health").textContent(),
        /last updated/,
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.getElementById("overlay").getBoundingClientRect().bottom <=
            innerHeight,
        ),
        true,
        "Offline status fits the OBS canvas",
      );
      await context.close();
    },
  );

  await check(
    "390px phone wallet links, keyboard dialog dismissal and focus return",
    async () => {
      const { context, page } = await pageWithData({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      });
      await page.goto(url);
      await ready(page);
      await page.locator("#connect-wallet").focus();
      await page.keyboard.press("Enter");
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        assert.equal(
          await page.getByRole("link", { name: `Open in ${name}` }).count(),
          1,
        );
      assert.equal(
        await page
          .getByRole("button", { name: "Coinbase Smart Wallet" })
          .count(),
        1,
      );
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#wallet-dialog").isVisible(), false);
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "connect-wallet",
      );
      await context.close();
    },
  );

  await check(
    "Real RPM, IDLE, manual pause and reduced-motion behavior",
    async () => {
      const { context, page, data } = await pageWithData();
      await page.goto(url);
      await ready(page);
      await page.waitForFunction(
        () =>
          document.querySelector(".wheel-rotor").getAnimations()[0]
            .playbackRate === 90,
      );
      await page.locator("#motion-toggle").click();
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector(".wheel-rotor").getAnimations()[0].playState,
        ),
        "paused",
      );
      await page.locator("#motion-toggle").click();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(
        () =>
          document.querySelector(".wheel-rotor").getAnimations()[0]
            .playState === "paused",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      data.status.measurement.coreStatus = "IDLE";
      data.status.measurement.rpmMilli = 0;
      await page.locator("#refresh").click();
      await page.waitForFunction(
        () => document.getElementById("wheel-status").textContent === "RESTING",
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector(".wheel-rotor").getAnimations()[0].playState,
        ),
        "paused",
      );
      await context.close();
    },
  );

  await check(
    "Responsive production export, first-screen action, resources and axe accessibility",
    async () => {
      const { context, page } = await pageWithData();
      const failures = [];
      page.on("response", (response) => {
        if (response.url().startsWith(url) && response.status() >= 400)
          failures.push(response.url());
      });
      await page.goto(url);
      await ready(page);
      await page.evaluate(() => document.fonts.ready);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(750); // Allow the intentional rolling digits to settle after a font-size breakpoint.
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `overflow at ${width}px`,
        );
        const escapedTips = await page.evaluate(() => {
          const escaped = [];
          document.querySelectorAll('.night-bar').forEach((bar, index) => {
            bar.focus({ preventScroll: true });
            const rect = bar.querySelector('.chart-tip').getBoundingClientRect();
            if (rect.left < 0 || rect.right > innerWidth) escaped.push(index);
          });
          document.activeElement?.blur();
          return escaped;
        });
        assert.deepEqual(escapedTips, [], `Chart tooltips escape at ${width}px`);
        await page.screenshot({
          path: join(output, `dashboard-${width}.png`),
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => scrollTo(0, 0));
      const connectBounds = await page.locator("#connect-wallet").boundingBox();
      const distanceBounds = await page.locator("#odometer").boundingBox();
      assert.ok(connectBounds.y >= 0 && connectBounds.y + connectBounds.height < 844);
      assert.ok(distanceBounds.y >= 0 && distanceBounds.y + distanceBounds.height < 844);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      await writeFile(
        join(output, "axe.json"),
        JSON.stringify(
          { violations: audit.violations, passes: audit.passes.length },
          null,
          2,
        ),
      );
      assert.deepEqual(
        audit.violations.map((v) => `${v.id}: ${v.description}`),
        [],
      );
      await page.locator("#connect-wallet").click();
      const dialogAudit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        dialogAudit.violations.map((v) => v.id),
        [],
      );
      assert.deepEqual(failures, []);
      await context.close();
    },
  );

  // A separate engine is attempted and recorded honestly if this host lacks WebKit's system libraries.
  await browser.close();
  browser = null;
  try {
    browser = await webkit.launch({ headless: true });
    await check("WebKit: primary guess and wallet picker", async () => {
      const { context, page } = await pageWithData();
      await page.goto(url);
      await ready(page);
      await page.locator("#guess-km").fill("12.5");
      await page.locator("#save-guess").click();
      assert.match(
        await page.locator("#guess-feedback").textContent(),
        /saved/,
      );
      await page.locator("#connect-wallet").click();
      assert.equal(await page.locator("#wallet-dialog").isVisible(), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#wallet-dialog").isVisible(), false);
      await context.close();
    });
  } catch (error) {
    results.push({
      name: "WebKit",
      skipped: true,
      reason: error.message.split("\n").slice(0, 8).join("\n"),
    });
    console.log(
      "LIMITATION WebKit cannot launch on this host; see results.json.",
    );
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      { results, output, testedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
}
if (results.some((r) => r.passed === false)) process.exitCode = 1;
console.log(
  `${results.filter((r) => r.passed).length} passed; ${results.filter((r) => r.passed === false).length} failed; ${results.filter((r) => r.skipped).length} limitations. Evidence: ${output}`,
);
