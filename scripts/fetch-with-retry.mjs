const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429]);

function isRetryableHttpStatus(status) {
  return RETRYABLE_HTTP_STATUSES.has(status) || status >= 500;
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function describeError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function createRequestError(url, attempts, error) {
  return new Error(
    `Request failed for ${url} after ${attempts} attempts: ${describeError(error)}`,
    { cause: error },
  );
}

export async function fetchWithRetry(
  url,
  options = {},
  {
    maxAttempts = 4,
    baseDelayMs = 1_000,
    timeoutMs = 30_000,
    fetchImpl = globalThis.fetch,
    sleepImpl = sleep,
    logger = console,
  } = {},
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;

    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;

      response = await fetchImpl(url, { ...options, signal });
    } catch (error) {
      if (options.signal?.aborted || attempt === maxAttempts) {
        throw createRequestError(url, attempt, error);
      }

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      logger.warn(
        `Request attempt ${attempt}/${maxAttempts} failed for ${url}: ${describeError(error)}. Retrying in ${delayMs}ms.`,
      );
      await sleepImpl(delayMs);
      continue;
    }

    if (response.ok) {
      return response;
    }

    const error = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    if (!isRetryableHttpStatus(response.status)) {
      throw createRequestError(url, attempt, error);
    }

    if (attempt === maxAttempts) {
      throw createRequestError(url, attempt, error);
    }

    await response.body?.cancel().catch(() => {});
    const delayMs = baseDelayMs * 2 ** (attempt - 1);
    logger.warn(
      `Request attempt ${attempt}/${maxAttempts} received HTTP ${response.status} from ${url}. Retrying in ${delayMs}ms.`,
    );
    await sleepImpl(delayMs);
  }

  throw new Error(`Request failed for ${url}`);
}
