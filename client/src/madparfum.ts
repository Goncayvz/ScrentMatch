import madCatalogUrl from "../../data/mad-perfumes.json?url";
import type { Perfume } from "./types/parfum";
import { readWithReader } from "./reader";

type MadEnrichment = Partial<
  Pick<
    Perfume,
    | "gender"
    | "fragranceFamily"
    | "description"
    | "topNotes"
    | "middleNotes"
    | "baseNotes"
    | "imageUrl"
    | "price"
  >
>;

const enrichmentCache = new Map<string, Promise<MadEnrichment>>();

function splitNotes(value: string | undefined): string[] {
  return (
    value
      ?.split(/[,;|]/)
      .map((note) => note.trim())
      .filter(Boolean) ?? []
  );
}

function getSafeMadUrl(value: string, baseUrl: string): string | undefined {
  const url = new URL(value, baseUrl);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "www.madparfum.com" &&
      url.hostname !== "madparfum.com" &&
      !url.hostname.endsWith(".akinoncloud.com"))
  ) {
    return undefined;
  }
  return url.href;
}

function parsePrice(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const amount = value.replace(/[^\d,.-]/g, "");
  const normalized = amount.includes(",")
    ? amount.replace(/\./g, "").replace(",", ".")
    : amount;
  const price = Number(normalized);
  return Number.isFinite(price) ? price : undefined;
}

export function loadMadPerfumes(
  onProducts: (perfumes: Perfume[]) => void,
  onProgress: (page: number, pageCount: number) => void,
): Promise<void> {
  return fetch(madCatalogUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `MAD kataloğu ${response.status} yanıtı verdi.`,
        );
      }
      return response.json() as Promise<unknown>;
    })
    .then((data) => {
      if (
        !Array.isArray(data) ||
        !data.every(
          (product): product is Perfume =>
            typeof product === "object" &&
            product !== null &&
            "id" in product &&
            typeof product.id === "string" &&
            "name" in product &&
            typeof product.name === "string" &&
            "brand" in product &&
            typeof product.brand === "string",
        )
      ) {
        throw new Error("MAD kataloğu beklenen ürün biçiminde değil.");
      }
      onProducts(data);
      onProgress(1, 1);
    });
}

function readInfoRows(container: Element | null): Map<string, string> {
  const rows = new Map<string, string>();
  if (!container) return rows;

  for (const row of container.children) {
    const label = row.querySelector("span.font-bold")?.textContent?.trim();
    const values = [...row.querySelectorAll("span")]
      .map((span) => span.textContent?.trim() ?? "")
      .filter((text) => text && text !== label);
    const value = values.at(-1);
    if (label && value) rows.set(label, value);
  }
  return rows;
}

async function fetchMadDetails(sourceUrl: string): Promise<MadEnrichment> {
  const safeSourceUrl = getSafeMadUrl(
    sourceUrl,
    "https://www.madparfum.com/",
  );
  if (
    !safeSourceUrl ||
    new URL(safeSourceUrl).hostname !== "www.madparfum.com" ||
    !new URL(safeSourceUrl).pathname.startsWith("/urun/")
  ) {
    throw new Error("MAD ürün bağlantısı güvenli değil.");
  }

  const document = new DOMParser().parseFromString(
    await readWithReader(safeSourceUrl),
    "text/html",
  );
  const notes = readInfoRows(
    document.querySelector('[data-testid="product-note-info-container"]'),
  );
  const details = readInfoRows(
    document.querySelector('[data-testid="product-other-info"]'),
  );
  const imageElement = [
    ...document.querySelectorAll<HTMLImageElement>("img"),
  ].find((image) => image.getAttribute("src")?.includes("/products/"));
  const imageUrl = imageElement
    ? getSafeMadUrl(imageElement.getAttribute("src") ?? "", safeSourceUrl)
    : undefined;
  const description =
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") ?? undefined;
  const price = parsePrice(
    document.querySelector('[data-testid="price"]')?.textContent ?? undefined,
  );

  return {
    gender: details.get("Cinsiyet"),
    fragranceFamily: details.get("Koku Ailesi"),
    topNotes: splitNotes(notes.get("Üst Nota")),
    middleNotes: splitNotes(notes.get("Kalp Nota")),
    baseNotes: splitNotes(notes.get("Dip Nota")),
    imageUrl,
    description,
    price,
  };
}

export function loadMadDetails(sourceUrl: string): Promise<MadEnrichment> {
  const cached = enrichmentCache.get(sourceUrl);
  if (cached) return cached;

  const request = fetchMadDetails(sourceUrl).catch((error: unknown) => {
    enrichmentCache.delete(sourceUrl);
    throw error;
  });
  enrichmentCache.set(sourceUrl, request);
  return request;
}
