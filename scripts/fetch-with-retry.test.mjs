import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithRetry } from "./fetch-with-retry.mjs";

const silentLogger = { warn() {} };

test("retries network failures with exponential backoff", async () => {
  const delays = [];
  let attempts = 0;

  const response = await fetchWithRetry(
    "https://example.test/data.csv",
    {},
    {
      baseDelayMs: 10,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts < 3) throw new TypeError("fetch failed");
        return new Response("ok");
      },
      sleepImpl: async (delayMs) => delays.push(delayMs),
      logger: silentLogger,
    },
  );

  assert.equal(await response.text(), "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("retries transient HTTP responses", async () => {
  const statuses = [503, 429, 200];
  let attempts = 0;

  const response = await fetchWithRetry(
    "https://example.test/data.json",
    {},
    {
      baseDelayMs: 0,
      fetchImpl: async () => {
        const status = statuses[attempts];
        attempts += 1;
        return new Response(status === 200 ? "ok" : "retry", { status });
      },
      sleepImpl: async () => {},
      logger: silentLogger,
    },
  );

  assert.equal(await response.text(), "ok");
  assert.equal(attempts, 3);
});

test("does not retry a permanent HTTP response", async () => {
  let attempts = 0;

  await assert.rejects(
    fetchWithRetry(
      "https://example.test/missing",
      {},
      {
        fetchImpl: async () => {
          attempts += 1;
          return new Response("missing", {
            status: 404,
            statusText: "Not Found",
          });
        },
        sleepImpl: async () => {},
        logger: silentLogger,
      },
    ),
    /after 1 attempts: Error: HTTP 404 Not Found/,
  );

  assert.equal(attempts, 1);
});

test("reports the URL and attempt count after exhausting retries", async () => {
  let attempts = 0;

  await assert.rejects(
    fetchWithRetry(
      "https://example.test/unavailable",
      {},
      {
        maxAttempts: 3,
        baseDelayMs: 0,
        fetchImpl: async () => {
          attempts += 1;
          throw new TypeError("connect timeout");
        },
        sleepImpl: async () => {},
        logger: silentLogger,
      },
    ),
    /https:\/\/example\.test\/unavailable after 3 attempts: TypeError: connect timeout/,
  );

  assert.equal(attempts, 3);
});
