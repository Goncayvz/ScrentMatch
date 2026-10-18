import type { Perfume } from "./types/parfum";
import { readWithReader } from "./reader";

export type FragranticaEnrichment = Partial<
  Pick<
    Perfume,
    | "releaseYear"
    | "rating"
    | "mainAccords"
    | "topNotes"
    | "middleNotes"
    | "baseNotes"
    | "fragranceFamily"
    | "description"
    | "imageUrl"
    | "gender"
    | "price"
  >
> & {
  fragranticaUrl?: string;
};

type FragranticaConfig = {
  appId: string;
  apiKey: string;
};

type FragranticaHit = {
  id?: number | string;
  naslov?: string;
  dizajner?: string;
  slug?: string;
  picture?: string;
  thumbnail?: string;
  godina?: number;
  rating?: number;
  alternative_names?: unknown;
};

type AlgoliaResponse = {
  hits?: FragranticaHit[];
};

const indexUrlSuffix = "-dsn.algolia.net/1/indexes/fragrantica_perfumes/query";
const configCache = new Map<string, Promise<FragranticaConfig>>();
const enrichmentCache = new Map<
  string,
  Promise<FragranticaEnrichment | null>
>();
const pendingLookups: Array<() => void> = [];
let activeLookups = 0;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scheduleLookup<T>(lookup: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      activeLookups += 1;
      lookup().then(resolve, reject).then(finish, finish);
    };

    const finish = () => {
      activeLookups -= 1;
      const next = pendingLookups.shift();
      if (next) next();
    };

    if (activeLookups === 0) {
      start();
    } else {
      pendingLookups.push(start);
    }
  });
}

async function fetchConfig(): Promise<FragranticaConfig> {
  const html = await readWithReader("https://www.fragrantica.fr/");
  const appId = html.match(/"algoliaAppId"\s*:\s*"([^"]+)"/)?.[1];
  const apiKey = html.match(/\btoAbby\s*=\s*"([^"]+)"/)?.[1];
  if (!appId || !apiKey) {
    throw new Error("Fragrantica arama yapılandırması bulunamadı.");
  }

  return { appId, apiKey };
}

function getConfig(refresh = false): Promise<FragranticaConfig> {
  const key = "fragrantica-config";
  if (refresh) configCache.delete(key);

  let config = configCache.get(key);
  if (!config) {
    config = fetchConfig().catch((error: unknown) => {
      configCache.delete(key);
      throw error;
    });
    configCache.set(key, config);
  }

  return config;
}

async function searchFragrantica(
  query: string,
  config: FragranticaConfig,
  retryExpiredKey = true,
): Promise<FragranticaHit[]> {
  const response = await fetch(
    `https://${config.appId}${indexUrlSuffix}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Algolia-Application-Id": config.appId,
        "X-Algolia-API-Key": config.apiKey,
      },
      body: JSON.stringify({ query, hitsPerPage: 30 }),
    },
  );

  if (response.status === 403 && retryExpiredKey) {
    return searchFragrantica(query, await getConfig(true), false);
  }
  if (!response.ok) {
    throw new Error(`Fragrantica araması ${response.status} yanıtı verdi.`);
  }

  const result = (await response.json()) as AlgoliaResponse;
  return result.hits ?? [];
}

function findExactMatch(
  hits: FragranticaHit[],
  name: string,
  brand: string,
): FragranticaHit | undefined {
  const normalizedBrand = normalizeText(brand);
  const brandPattern = new RegExp(
    `\\b${normalizedBrand.split(" ").join("\\s+")}\\b`,
    "g",
  );
  const cleanBrandAndYear = (value: string) =>
    normalizeText(value)
      .replace(brandPattern, " ")
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const cleanConcentration = (value: string) =>
    cleanBrandAndYear(value)
      .replace(/\beau de (?:parfum|toilette|cologne|fraiche)\b/g, " ")
      .replace(/\b(?:edp|edt|edc)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const getConcentration = (value: string) => {
    const normalized = cleanBrandAndYear(value);
    return normalized.match(/\beau de (?:parfum|toilette|cologne|fraiche)\b/)?.[0] ??
      normalized.match(/\b(?:edp|edt|edc)\b/)?.[0];
  };
  const normalizedName = cleanBrandAndYear(name);
  const relaxedName = cleanConcentration(name);
  const requestedConcentration = getConcentration(name);
  const matchingHits = hits.filter(
    (hit) => normalizeText(hit.dizajner ?? "") === normalizedBrand,
  );

  const candidates = matchingHits.map((hit) => {
    const alternativeNames = Array.isArray(hit.alternative_names)
      ? hit.alternative_names.filter(
          (value): value is string => typeof value === "string",
        )
      : typeof hit.alternative_names === "string"
        ? [hit.alternative_names]
        : [];
    const names = [hit.naslov, ...alternativeNames]
      .filter((value): value is string => Boolean(value))
      .map((value) => ({
        exact: cleanBrandAndYear(value),
        relaxed: cleanConcentration(value),
        concentration: getConcentration(value),
      }));

    return { hit, names };
  });

  const exactMatch = candidates.find(({ names }) =>
    names.some((candidate) => candidate.exact === normalizedName),
  );
  if (exactMatch) return exactMatch.hit;

  const relaxedMatches = candidates.filter(({ names }) =>
    names.some(
      (candidate) =>
        candidate.relaxed === relaxedName &&
        (!requestedConcentration ||
          !candidate.concentration ||
          candidate.concentration === requestedConcentration),
    ),
  );

  return (
    relaxedMatches.find(({ names }) =>
      names.some(
        (candidate) => candidate.concentration === requestedConcentration,
      ),
    )?.hit ?? relaxedMatches[0]?.hit
  );
}

function splitFrenchNotes(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  return value
    .replace(/\s+et\s+/gi, ",")
    .split(",")
    .map((note) => note.trim())
    .filter(Boolean);
}

function parseProductPage(
  html: string,
  hit: FragranticaHit,
  productUrl: string,
): FragranticaEnrichment {
  const document = new DOMParser().parseFromString(html, "text/html");
  const description =
    [...document.querySelectorAll("p")]
      .map((paragraph) => paragraph.textContent?.trim() ?? "")
      .find((text) => /notes de t[êe]te sont/i.test(text)) ??
    document.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
    undefined;
  const accordsHeading = [...document.querySelectorAll("h6")].find((heading) =>
    normalizeText(heading.textContent ?? "").includes("accords principaux"),
  );
  const mainAccords = accordsHeading
    ? [...accordsHeading.parentElement?.querySelectorAll("span.truncate") ?? []]
        .map((accord) => accord.textContent?.trim() ?? "")
        .filter(Boolean)
    : [];
  const imageElement = [...document.querySelectorAll("img")].find((image) =>
    image.getAttribute("alt")?.startsWith("perfume "),
  );
  const imageUrl = hit.picture || hit.thumbnail || imageElement?.src;

  const releaseYear = description?.match(/\blanc[eé]\s+en\s+(\d{4})\b/i)?.[1];
  const fragranceFamily = description?.match(
    /est un parfum\s+(.+?)\s+pour\s+(?:femme|homme|les deux)\b/i,
  )?.[1];
  const topNotes = description?.match(/notes de t[êe]te sont ([^;.]+)/i)?.[1];
  const middleNotes = description?.match(/notes de c[œo]eur sont ([^;.]+)/i)?.[1];
  const baseNotes = description?.match(/notes de fond sont ([^;.]+)/i)?.[1];
  const rating =
    typeof hit.rating === "number" && Number.isFinite(hit.rating)
      ? hit.rating * 2
      : undefined;

  return {
    releaseYear: releaseYear ? Number(releaseYear) : hit.godina,
    rating,
    mainAccords: mainAccords.length > 0 ? mainAccords : undefined,
    topNotes: splitFrenchNotes(topNotes),
    middleNotes: splitFrenchNotes(middleNotes),
    baseNotes: splitFrenchNotes(baseNotes),
    fragranceFamily,
    description,
    imageUrl,
    fragranticaUrl: productUrl,
  };
}

async function fetchEnrichment(
  name: string,
  brand: string,
): Promise<FragranticaEnrichment | null> {
  const hits = await searchFragrantica(
    `${name} ${brand}`,
    await getConfig(),
  );
  const hit = findExactMatch(hits, name, brand);
  if (!hit || !hit.id || !hit.slug) return null;

  const productUrl = new URL(
    `/parfum/${hit.slug}-${hit.id}.html`,
    "https://www.fragrantica.fr",
  ).href;
  return parseProductPage(
    await readWithReader(productUrl),
    hit,
    productUrl,
  );
}

export function loadFragranticaEnrichment(
  name: string,
  brand: string,
): Promise<FragranticaEnrichment | null> {
  const key = `${normalizeText(brand)}\n${normalizeText(name)}`;
  const cached = enrichmentCache.get(key);
  if (cached) return cached;

  const request = scheduleLookup(() => fetchEnrichment(name, brand)).catch(
    (error: unknown) => {
      enrichmentCache.delete(key);
      throw error;
    },
  );
  enrichmentCache.set(key, request);
  return request;
}
