const readerUrl = "https://r.jina.ai/";
const minimumRequestInterval = 100;
let lastRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function readWithReader(sourceUrl: string): Promise<string> {
  const request = requestQueue.then(async () => {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const interval = minimumRequestInterval - (Date.now() - lastRequestAt);
      if (interval > 0) await wait(interval);
      lastRequestAt = Date.now();

      try {
        const response = await fetch(`${readerUrl}${sourceUrl}`, {
          headers: { "X-Return-Format": "html" },
        });
        if (response.ok) return response.text();

        lastError = new Error(
          `Kaynak sayfası ${response.status} yanıtı verdi.`,
        );
        if (response.status !== 429 && response.status < 500) throw lastError;
      } catch (error) {
        if (error === lastError) throw error;
        lastError =
          error instanceof Error ? error : new Error("Kaynak sayfası alınamadı.");
      }

      if (attempt < 3) await wait(5000 * (attempt + 1));
    }

    throw lastError ?? new Error("Kaynak sayfası alınamadı.");
  });

  requestQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}
