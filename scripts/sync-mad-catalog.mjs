import { unlink, writeFile, rename } from "node:fs/promises";
import { load } from "cheerio";

const baseUrl = "https://www.madparfum.com";
const listingUrl = `${baseUrl}/tum-urunlerde-indirim/`;
const outputPath = new URL("../data/mad-perfumes.json", import.meta.url);
const temporaryPath = new URL("../data/mad-perfumes.json.tmp", import.meta.url);
const requestInterval = 1000;
let lastRequestAt = 0;

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchHtml(url) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const interval = requestInterval - (Date.now() - lastRequestAt);
    if (interval > 0) await wait(interval);
    lastRequestAt = Date.now();

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "ScentMatch catalog updater (manual on-demand sync)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.text();

      lastError = new Error(`${url} returned HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      if (error === lastError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < 3) {
      const delay = 5000 * (attempt + 1);
      console.warn(`Request failed; retrying in ${delay / 1000}s: ${url}`);
      await wait(delay);
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

function parsePrice(value) {
  if (!value) return undefined;
  const amount = value.replace(/[^\d,.-]/g, "");
  const normalized = amount.includes(",")
    ? amount.replace(/\./g, "").replace(",", ".")
    : amount;
  const price = Number(normalized);
  return Number.isFinite(price) ? price : undefined;
}

function parseListingPage(html, pageUrl) {
  const $ = load(html);
  const products = new Map();

  $('[data-testid="product-box"]').each((_, box) => {
    const product = $(box);
    const name = product
      .find('a[data-testid][href^="/urun/"]')
      .first()
      .text()
      .trim();
    const relativeUrl = product
      .find('a[href^="/urun/"]')
      .first()
      .attr("href");
    if (!name || !relativeUrl || !/parf[uü]m/i.test(name)) return;

    const sourceUrl = new URL(relativeUrl, pageUrl);
    if (
      sourceUrl.protocol !== "https:" ||
      sourceUrl.hostname !== "www.madparfum.com" ||
      !sourceUrl.pathname.startsWith("/urun/")
    ) {
      return;
    }

    const slug = sourceUrl.pathname.split("/").filter(Boolean).at(-1);
    if (!slug) return;

    const imageUrl = product
      .find('img[src*="/products/"]')
      .first()
      .attr("src");
    const record = {
      id: `mad-${slug}`,
      name,
      brand: "MAD Parfüm",
      imageUrl,
      sourceUrl: sourceUrl.href,
      price: parsePrice(product.find('[data-testid="price"]').first().text()),
    };

    products.set(record.id, record);
  });

  const pageCount = Number(html.match(/\\"num_pages\\":(\d+)/)?.[1]);
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error(`Unable to read pagination data from ${pageUrl}`);
  }

  return { products: [...products.values()], pageCount };
}

function parseProductDetails(html) {
  const $ = load(html);
  const readRows = (selector) => {
    const values = new Map();
    $(`${selector} > div`).each((_, row) => {
      const element = $(row);
      const label = element.find("span.font-bold").first().text().trim();
      const value = element.find("span").last().text().trim();
      if (label && value) values.set(label, value);
    });
    return values;
  };
  const noteRows = readRows('[data-testid="product-note-info-container"]');
  const infoRows = readRows('[data-testid="product-other-info"]');
  const imageUrl = $('img[src*="/products/"]').first().attr("src");
  const safeImageUrl = imageUrl ? new URL(imageUrl, baseUrl) : undefined;
  const price = parsePrice($('[data-testid="price"]').first().text());

  return {
    imageUrl:
      safeImageUrl?.protocol === "https:" &&
      safeImageUrl.hostname.endsWith(".akinoncloud.com")
        ? safeImageUrl.href
        : undefined,
    price,
    gender: infoRows.get("Cinsiyet"),
    fragranceFamily: infoRows.get("Koku Ailesi"),
    topNotes: noteRows.get("Üst Nota")
      ?.split(/[,;|]/)
      .map((note) => note.trim())
      .filter(Boolean),
    middleNotes: noteRows.get("Kalp Nota")
      ?.split(/[,;|]/)
      .map((note) => note.trim())
      .filter(Boolean),
    baseNotes: noteRows.get("Dip Nota")
      ?.split(/[,;|]/)
      .map((note) => note.trim())
      .filter(Boolean),
    description:
      $('meta[name="description"]').attr("content")?.trim() || undefined,
  };
}

async function main() {
  const firstPage = parseListingPage(await fetchHtml(listingUrl), listingUrl);
  const catalog = new Map(
    firstPage.products.map((product) => [product.id, product]),
  );
  console.log(`MAD page 1/${firstPage.pageCount}: ${catalog.size} products`);

  try {
    for (let page = 2; page <= firstPage.pageCount; page += 1) {
      const url = new URL(listingUrl);
      url.searchParams.set("page", String(page));
      const result = parseListingPage(await fetchHtml(url.href), url.href);
      for (const product of result.products) catalog.set(product.id, product);
      console.log(
        `MAD listing page ${page}/${firstPage.pageCount}: ${catalog.size} products`,
      );
    }

    const products = [...catalog.values()];
    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      const details = parseProductDetails(await fetchHtml(product.sourceUrl));
      catalog.set(product.id, {
        ...product,
        ...details,
        imageUrl: details.imageUrl ?? product.imageUrl,
        price: details.price ?? product.price,
      });

      await writeFile(
        temporaryPath,
        `${JSON.stringify([...catalog.values()], null, 2)}\n`,
        "utf8",
      );
      console.log(
        `MAD product details ${index + 1}/${products.length}: ${product.name}`,
      );
    }

    await rename(temporaryPath, outputPath);
    console.log(
      `Saved ${catalog.size} MAD products with details to data/mad-perfumes.json`,
    );
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error("MAD catalog update failed:", error);
  process.exitCode = 1;
});
