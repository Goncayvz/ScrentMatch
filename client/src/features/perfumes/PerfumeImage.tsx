import { useEffect, useRef, useState } from "react";
import { readWithReader } from "../../reader";

type PerfumeImageProps = {
  perfumeId?: string;
  imageUrl?: string;
  sourceUrl?: string;
  pending?: boolean;
  name: string;
  brand: string;
  className: string;
  onImageStatus?: (
    perfumeId: string,
    status: "found" | "missing" | "error",
  ) => void;
};

const imageUrlCache = new Map<string, Promise<string | null>>();
const pendingImageLookups: Array<() => void> = [];
let activeImageLookups = 0;
const maxConcurrentImageLookups = 2;

function persistentCacheKey(sourceUrl: string): string {
  return `scentmatch-perfume-image:${sourceUrl}`;
}

function readPersistentImage(sourceUrl: string): string | null {
  try {
    return localStorage.getItem(persistentCacheKey(sourceUrl));
  } catch (error) {
    console.warn("Parfüm görseli önbelleği okunamadı:", error);
    return null;
  }
}

function writePersistentImage(sourceUrl: string, imageUrl: string): void {
  try {
    localStorage.setItem(persistentCacheKey(sourceUrl), imageUrl);
  } catch (error) {
    console.warn("Parfüm görseli önbelleğe alınamadı:", error);
  }
}

function removePersistentImage(sourceUrl: string): void {
  try {
    localStorage.removeItem(persistentCacheKey(sourceUrl));
  } catch (error) {
    console.warn("Hatalı parfüm görseli önbellekten silinemedi:", error);
  }
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function fetchPerfumeImage(
  sourceUrl: string,
  name: string,
  brand: string,
): Promise<string | null> {
  const pageUrl = new URL(sourceUrl);
  if (
    pageUrl.protocol !== "https:" ||
    !["parfumo.com", "www.parfumo.com"].includes(pageUrl.hostname)
  ) {
    return null;
  }

  const page = await readWithReader(pageUrl.href);
  const firstImage = page.match(
    /!\[([^\]]*)\]\((https:\/\/media\.parfumo\.com\/perfumes\/[^)\s]+)\)/i,
  );

  if (!firstImage) return null;

  const imageDescription = normalizeText(firstImage[1]);
  if (
    !imageDescription.includes(normalizeText(name)) ||
    !imageDescription.includes(normalizeText(brand))
  ) {
    return null;
  }

  return firstImage[2];
}

async function fetchAndCachePerfumeImage(
  sourceUrl: string,
  name: string,
  brand: string,
): Promise<string | null> {
  const cachedImage = readPersistentImage(sourceUrl);
  if (cachedImage) return cachedImage;

  const imageUrl = await fetchPerfumeImage(sourceUrl, name, brand);
  if (imageUrl) writePersistentImage(sourceUrl, imageUrl);
  return imageUrl;
}

function getImageUrl(
  sourceUrl: string,
  name: string,
  brand: string,
): Promise<string | null> {
  const key = `${sourceUrl}\n${name}\n${brand}`;
  const cached = imageUrlCache.get(key);
  if (cached) return cached;

  const request = new Promise<string | null>((resolve, reject) => {
    const startLookup = () => {
      activeImageLookups += 1;
      fetchAndCachePerfumeImage(sourceUrl, name, brand)
        .then(resolve, reject)
        .finally(() => {
          activeImageLookups -= 1;
          const nextLookup = pendingImageLookups.shift();
          if (nextLookup) nextLookup();
        });
    };

    if (activeImageLookups < maxConcurrentImageLookups) {
      startLookup();
    } else {
      pendingImageLookups.push(startLookup);
    }
  }).catch((error: unknown) => {
    imageUrlCache.delete(key);
    throw error;
  });
  imageUrlCache.set(key, request);
  return request;
}

export default function PerfumeImage({
  perfumeId,
  imageUrl,
  sourceUrl,
  pending = false,
  name,
  brand,
  className,
  onImageStatus,
}: PerfumeImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string>();
  const [lookupComplete, setLookupComplete] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const displayImageUrl = imageUrl ?? resolvedImageUrl;
  const lookupFinished = Boolean(
    (imageUrl && !imageFailed) || (!pending && (!sourceUrl || lookupComplete)),
  );

  useEffect(() => {
    if (imageUrl || !sourceUrl) return;

    const container = containerRef.current;
    const loadImage = () => {
      getImageUrl(sourceUrl, name, brand)
        .then((url) => {
          setResolvedImageUrl(url ?? undefined);
          if (perfumeId) onImageStatus?.(perfumeId, url ? "found" : "missing");
        })
        .catch((error: unknown) => {
          console.error(`Parfüm görseli alınamadı (${name}):`, error);
          setLookupError(true);
          if (perfumeId) onImageStatus?.(perfumeId, "error");
        })
        .finally(() => setLookupComplete(true));
    };

    if (!container || !("IntersectionObserver" in window)) {
      loadImage();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        observer.disconnect();
        loadImage();
      },
      { rootMargin: "200px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [brand, imageUrl, name, onImageStatus, perfumeId, sourceUrl]);

  return (
    <div
      ref={containerRef}
      className={`flex items-center justify-center overflow-hidden rounded-xl bg-[#faf7f2] ${className}`}
    >
      {displayImageUrl && !imageFailed ? (
        <img
          src={displayImageUrl}
          alt={`${brand} ${name} parfüm şişesi`}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => {
            setImageFailed(true);
            if (sourceUrl) removePersistentImage(sourceUrl);
            if (perfumeId) onImageStatus?.(perfumeId, "error");
          }}
        />
      ) : (
        <p className="px-4 text-center text-sm text-stone-400">
          {lookupError
            ? "Görsel alınamadı"
            : lookupFinished
              ? "Görsel bulunamadı"
              : "Görsel aranıyor..."}
        </p>
      )}
    </div>
  );
}
