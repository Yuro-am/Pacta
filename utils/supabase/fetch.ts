export const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(10_000);
  const existing = init?.signal ?? (input instanceof Request ? input.signal : undefined);

  return fetch(input, {
    ...init,
    signal: existing ? AbortSignal.any([existing, timeout]) : timeout,
  });
};
