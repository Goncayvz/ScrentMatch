import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadCsvPerfumes } from "../csvPerfumes";
import PerfumeImage from "../features/perfumes/PerfumeImage";
import {
  loadFragranticaEnrichment,
  type FragranticaEnrichment,
} from "../fragrantica";
import { loadMadDetails, loadMadPerfumes } from "../madparfum";
import type { Perfume } from "../types/parfum";

type PerfumeEnrichment = Partial<
  Pick<
    Perfume,
    | "gender"
    | "releaseYear"
    | "rating"
    | "mainAccords"
    | "topNotes"
    | "middleNotes"
    | "baseNotes"
    | "fragranceFamily"
    | "description"
    | "imageUrl"
    | "price"
  >
> & {
  fragranticaUrl?: string;
};

function needsRemoteEnrichment(perfume: Perfume): boolean {
  if (perfume.id.startsWith("mad-")) return false;

  return (
    !perfume.imageUrl ||
    !perfume.releaseYear ||
    typeof perfume.rating !== "number" ||
    !perfume.fragranceFamily ||
    !perfume.mainAccords?.length ||
    !perfume.topNotes?.length ||
    !perfume.middleNotes?.length ||
    !perfume.baseNotes?.length
  );
}

function mergeEnrichment(
  perfume: Perfume,
  enrichment: PerfumeEnrichment | null,
): Perfume {
  if (!enrichment) return perfume;

  return {
    ...perfume,
    gender: perfume.gender ?? enrichment.gender,
    releaseYear: perfume.releaseYear ?? enrichment.releaseYear,
    rating: perfume.rating ?? enrichment.rating,
    mainAccords: perfume.mainAccords?.length
      ? perfume.mainAccords
      : enrichment.mainAccords,
    topNotes: perfume.topNotes?.length
      ? perfume.topNotes
      : enrichment.topNotes,
    middleNotes: perfume.middleNotes?.length
      ? perfume.middleNotes
      : enrichment.middleNotes,
    baseNotes: perfume.baseNotes?.length
      ? perfume.baseNotes
      : enrichment.baseNotes,
    fragranceFamily: perfume.fragranceFamily ?? enrichment.fragranceFamily,
    description: perfume.description ?? enrichment.description,
    imageUrl: perfume.imageUrl ?? enrichment.imageUrl,
    price: perfume.price ?? enrichment.price,
    fragranticaUrl: perfume.fragranticaUrl ?? enrichment.fragranticaUrl,
  };
}

type PerfumeResultCardProps = {
  perfume: Perfume;
  onImageStatus: (
    perfumeId: string,
    status: "found" | "missing" | "error",
  ) => void;
  onEnriched: (perfume: Perfume) => void;
  onSelect: (perfume: Perfume) => void;
};

function PerfumeResultCard({
  perfume,
  onImageStatus,
  onEnriched,
  onSelect,
}: PerfumeResultCardProps) {
  const articleRef = useRef<HTMLElement>(null);
  const perfumeRef = useRef(perfume);
  useEffect(() => {
    perfumeRef.current = perfume;
  }, [perfume]);
  const { id: perfumeId, name: perfumeName, brand: perfumeBrand, sourceUrl } =
    perfume;
  const shouldLookup = needsRemoteEnrichment(perfume);
  const lookupStarted = useRef(false);
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "done"
  >(shouldLookup ? "idle" : "done");
  const [enrichment, setEnrichment] =
    useState<FragranticaEnrichment | null>(null);
  const enrichedPerfume = mergeEnrichment(perfume, enrichment);

  useEffect(() => {
    if (!shouldLookup) return;

    const article = articleRef.current;
    let active = true;

    const lookup = () => {
      if (lookupStarted.current) return;
      lookupStarted.current = true;
      setLookupState("loading");
      const request =
        perfumeId.startsWith("mad-") && sourceUrl
          ? loadMadDetails(sourceUrl)
          : loadFragranticaEnrichment(perfumeName, perfumeBrand);
      request
        .then((result) => {
          if (!active) return;

          setEnrichment(result);
          const currentPerfume = perfumeRef.current;
          const mergedPerfume = mergeEnrichment(currentPerfume, result);
          onEnriched(mergedPerfume);
          if (result?.imageUrl) onImageStatus(perfumeId, "found");
        })
        .catch((error: unknown) => {
          console.error(
            `Parfüm bilgileri alınamadı (${perfumeName}):`,
            error,
          );
          if (active) onImageStatus(perfumeId, "error");
        })
        .finally(() => {
          if (active) setLookupState("done");
        });
    };

    if (!article || !("IntersectionObserver" in window)) {
      lookup();
      return () => {
        active = false;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        observer.disconnect();
        lookup();
      },
      { rootMargin: "200px" },
    );

    observer.observe(article);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [
    onEnriched,
    onImageStatus,
    perfumeBrand,
    perfumeId,
    perfumeName,
    sourceUrl,
    shouldLookup,
  ]);

  const imagePending = shouldLookup && lookupState !== "done";

  return (
    <article
      ref={articleRef}
      className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
    >
      <PerfumeImage
        perfumeId={perfume.id}
        imageUrl={enrichedPerfume.imageUrl}
        sourceUrl={
          imagePending || enrichedPerfume.imageUrl
            ? undefined
            : perfume.sourceUrl
        }
        pending={imagePending}
        name={perfumeName}
        brand={perfumeBrand}
        className="h-44 w-full"
        onImageStatus={onImageStatus}
      />

      <p className="text-xs font-medium uppercase tracking-wider text-[#987653]">
        {perfume.brand}
      </p>

      <h2 className="mt-2 text-lg font-semibold">{perfume.name}</h2>

      {typeof enrichedPerfume.rating === "number" &&
        Number.isFinite(enrichedPerfume.rating) && (
          <p className="mt-2 text-sm text-stone-600">
            ★ {enrichedPerfume.rating.toFixed(1)} / 10
          </p>
        )}

      {enrichedPerfume.releaseYear && (
        <p className="mt-1 text-sm text-stone-500">
          Çıkış yılı: {enrichedPerfume.releaseYear}
        </p>
      )}

      {(enrichedPerfume.gender || enrichedPerfume.fragranceFamily) && (
        <p className="mt-1 text-sm text-stone-500">
          {[enrichedPerfume.gender, enrichedPerfume.fragranceFamily]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {typeof enrichedPerfume.price === "number" && (
        <p className="mt-1 text-sm font-semibold text-[#76583d]">
          {enrichedPerfume.price.toLocaleString("tr-TR")} TL
        </p>
      )}

      {enrichedPerfume.mainAccords &&
        enrichedPerfume.mainAccords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {enrichedPerfume.mainAccords.slice(0, 3).map((accord, index) => (
              <span
                key={`${perfume.id}-accord-${index}`}
                className="rounded-full bg-[#f0e5d8] px-3 py-1 text-xs text-[#76583d]"
              >
                {accord}
              </span>
            ))}
          </div>
        )}

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          ...(enrichedPerfume.topNotes ?? []),
          ...(enrichedPerfume.middleNotes ?? []),
          ...(enrichedPerfume.baseNotes ?? []),
        ]
          .slice(0, 5)
          .map((note, index) => (
            <span
              key={`${perfume.id}-${note}-${index}`}
              className="rounded-full bg-[#f5eee5] px-3 py-1 text-xs text-[#76583d]"
            >
              {note}
            </span>
          ))}
      </div>

      <button
        type="button"
        onClick={() => onSelect(enrichedPerfume)}
        className="mt-5 w-full rounded-xl bg-[#76583d] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#5f452f] focus:outline-none focus:ring-2 focus:ring-[#987653] focus:ring-offset-2"
      >
        Detayları incele
      </button>
    </article>
  );
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(60);
  const [imageStatuses, setImageStatuses] = useState<
    Record<string, "found" | "missing" | "error">
  >({});
  const [showMissingImages, setShowMissingImages] = useState(false);
  const [selectedPerfume, setSelectedPerfume] =
    useState<Perfume | null>(null);

  const [perfumes, setPerfumes] = useState<Perfume[]>([]);
  const [madPerfumes, setMadPerfumes] = useState<Perfume[]>([]);
  const [madProgress, setMadProgress] = useState({ page: 0, pageCount: 0 });
  const [madError, setMadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    loadCsvPerfumes()
      .then((data) => {
        if (active) setPerfumes(data);
      })
      .catch((err: unknown) => {
        console.error("CSV yüklenemedi:", err);

        if (active) {
          setError(
            "Parfümler yüklenemedi. CSV dosyasının yolunu ve bağlantısını kontrol et."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    loadMadPerfumes(
      (data) => {
        if (active) setMadPerfumes(data);
      },
      (page, pageCount) => {
        if (active) setMadProgress({ page, pageCount });
      },
    ).catch((err: unknown) => {
      console.error("MAD ürünleri yüklenemedi:", err);
      if (active) {
        setMadError(
          "MAD parfümleri alınamadı. İnternet bağlantısını kontrol edip sayfayı yenile.",
        );
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const catalog = useMemo(
    () => [...perfumes, ...madPerfumes],
    [madPerfumes, perfumes],
  );

  const results = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .toLocaleLowerCase("tr-TR");

    if (!normalizedQuery) return catalog;

    return catalog.filter((perfume) => {
      const searchableText = [
        perfume.name,
        perfume.brand,
        ...(perfume.topNotes ?? []),
        ...(perfume.middleNotes ?? []),
        ...(perfume.baseNotes ?? []),
        ...(perfume.mainAccords ?? []),
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return searchableText.includes(normalizedQuery);
    });
  }, [catalog, query]);

  const visibleResults = results.slice(0, visibleCount);
  const missingImages = visibleResults.filter(
    (perfume) =>
      !perfume.imageUrl &&
      imageStatuses[perfume.id] !== "found",
  );
  const reportImageStatus = useCallback(
    (perfumeId: string, status: "found" | "missing" | "error") => {
      setImageStatuses((current) => {
        if (current[perfumeId] === status) return current;
        return { ...current, [perfumeId]: status };
      });
    },
    [],
  );
  const updateEnrichedPerfume = useCallback((perfume: Perfume) => {
    const update = (current: Perfume[]) =>
      current.map((item) => (item.id === perfume.id ? perfume : item));
    setPerfumes(update);
    setMadPerfumes(update);
    setSelectedPerfume((current) =>
      current?.id === perfume.id ? perfume : current,
    );
  }, []);

  return (
    <main className="min-h-screen bg-[#faf7f2] px-5 py-10 text-[#29231f]">
      <section className="mx-auto max-w-5xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.3em] text-[#987653]">
          ScentMatch
        </p>

        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Sana özel kokuyu keşfet.
        </h1>

        <p className="mt-4 max-w-xl text-base text-stone-600">
          Sevdiğin parfümü, markayı veya koku notasını ara.
          Sana uygun kokuları birlikte keşfedelim.
        </p>

        <div className="mt-8">
          <label htmlFor="perfume-search" className="sr-only">
            Parfüm ara
          </label>

          <input
            id="perfume-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(60);
              setShowMissingImages(false);
            }}
            placeholder="Örn. vanilya, Chanel, gül..."
            className="w-full rounded-2xl border border-stone-200 bg-white px-5 py-4 outline-none transition focus:border-[#987653] focus:ring-2 focus:ring-[#987653]/20"
          />

          <p className="mt-3 text-sm text-stone-500">
            {loading
              ? "Parfümler yükleniyor..."
              : error
                ? "Veriler yüklenemedi."
                : query.trim()
                ? `${results.length} sonuç bulundu · ${visibleResults.length} tanesi gösteriliyor`
                : `${results.length} parfüm · ${visibleResults.length} tanesi gösteriliyor`}
            {!loading && !error && madProgress.page < madProgress.pageCount && (
              <span className="ml-2">
                · MAD ürünleri yükleniyor ({madProgress.page}/{madProgress.pageCount})
              </span>
            )}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-700"
            >
              {error}
              <p className="mt-2 text-stone-600">
                Ayrıntılar için VS Code terminalini ve tarayıcı
                konsolunu kontrol et.
              </p>
            </div>
          )}

          {madError && (
            <div
              role="status"
              className="mt-3 rounded-xl border border-amber-200 bg-white p-4 text-sm text-amber-800"
            >
              {madError}
            </div>
          )}
        </div>

        <section className="mt-8" aria-label="Parfüm sonuçları">
          {loading ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
              <p className="text-stone-600">
                Koku dünyası hazırlanıyor...
              </p>
            </div>
          ) : error ? null : results.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
              <h2 className="text-xl font-semibold">
                Parfüm bulamadık
              </h2>
              <p className="mt-2 text-stone-500">
                Başka bir isim, marka veya nota deneyebilirsin.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleResults.map((perfume) => (
                <PerfumeResultCard
                  key={perfume.id}
                  perfume={perfume}
                  onImageStatus={reportImageStatus}
                  onEnriched={updateEnrichedPerfume}
                  onSelect={setSelectedPerfume}
                />
              ))}
            </div>
          )}

          {!loading && !error && visibleResults.length < results.length && (
            <div className="mt-8 text-center">
              <p className="mb-3 text-sm text-stone-500">
                {visibleResults.length} / {results.length} sonuç gösteriliyor
              </p>
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((count) => Math.min(count + 60, results.length))
                }
                className="rounded-xl bg-[#76583d] px-6 py-3 font-medium text-white transition hover:bg-[#5f452f] focus:outline-none focus:ring-2 focus:ring-[#987653] focus:ring-offset-2"
              >
                60 sonuç daha göster
              </button>
            </div>
          )}

          {!loading && !error && missingImages.length > 0 && (
            <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5">
              <button
                type="button"
                onClick={() => setShowMissingImages((shown) => !shown)}
                aria-expanded={showMissingImages}
                className="font-semibold text-[#76583d] underline underline-offset-4"
              >
                Görseli bulunamayanlar ({missingImages.length})
              </button>
              {showMissingImages && (
                <>
                  <p className="mt-2 text-sm text-stone-500">
                    Şu ana kadar yüklenen sonuçlar içinde görseli bulunmayanlar.
                    Uygun bir görsel URL’si bulduğunda parfüm adıyla birlikte
                    gönderebilirsin.
                  </p>
                  <ul className="mt-4 space-y-2">
                    {missingImages.map((perfume) => (
                      <li
                        key={perfume.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                      >
                        <span>
                          <span className="font-medium">{perfume.brand}</span>{" "}
                          — {perfume.name}
                        </span>
                        {perfume.sourceUrl && (
                          <a
                            href={perfume.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#76583d] underline underline-offset-4"
                          >
                            Kaynak sayfası
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </section>
      </section>

      {selectedPerfume && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedPerfume(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="perfume-detail-title"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[#faf7f2] p-6 shadow-2xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-[#987653]">
                  {selectedPerfume.brand}
                </p>

                <h2
                  id="perfume-detail-title"
                  className="mt-2 text-2xl font-bold"
                >
                  {selectedPerfume.name}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPerfume(null)}
                aria-label="Detay penceresini kapat"
                className="rounded-full px-3 py-1 text-2xl text-stone-500 hover:bg-stone-200"
              >
                ×
              </button>
            </div>

            <PerfumeImage
              key={selectedPerfume.id}
              perfumeId={selectedPerfume.id}
              imageUrl={selectedPerfume.imageUrl}
              sourceUrl={selectedPerfume.sourceUrl}
              name={selectedPerfume.name}
              brand={selectedPerfume.brand}
              className="mt-5 h-64 w-full"
            />

            {selectedPerfume.releaseYear && (
              <p className="mt-3 text-sm text-stone-600">
                Çıkış yılı: {selectedPerfume.releaseYear}
              </p>
            )}

            {typeof selectedPerfume.rating === "number" &&
              Number.isFinite(selectedPerfume.rating) && (
                <p className="mt-2 text-sm text-stone-600">
                  Puan: {selectedPerfume.rating.toFixed(1)} / 10
                </p>
              )}

            {selectedPerfume.fragranceFamily && (
              <p className="mt-2 text-sm text-stone-600">
                Koku ailesi: {selectedPerfume.fragranceFamily}
              </p>
            )}

            {selectedPerfume.gender && (
              <p className="mt-2 text-sm text-stone-600">
                Kullanım: {selectedPerfume.gender}
              </p>
            )}

            {selectedPerfume.mainAccords &&
              selectedPerfume.mainAccords.length > 0 && (
                <div className="mt-5">
                  <h3 className="font-semibold text-[#76583d]">
                    Ana koku akorları
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedPerfume.mainAccords.map((accord, index) => (
                      <span
                        key={`${accord}-${index}`}
                        className="rounded-full bg-[#f0e5d8] px-3 py-1.5 text-sm"
                      >
                        {accord}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            <div className="mt-6 space-y-5">
              {[
                {
                  title: "Üst notalar",
                  notes: selectedPerfume.topNotes,
                },
                {
                  title: "Orta notalar",
                  notes: selectedPerfume.middleNotes,
                },
                {
                  title: "Alt notalar",
                  notes: selectedPerfume.baseNotes,
                },
              ].map((group) => (
                <div key={group.title}>
                  <h3 className="font-semibold text-[#76583d]">
                    {group.title}
                  </h3>

                  {group.notes && group.notes.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.notes.map((note, index) => (
                        <span
                          key={`${group.title}-${note}-${index}`}
                          className="rounded-full bg-[#f0e5d8] px-3 py-1.5 text-sm"
                        >
                          {note}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-stone-500">
                      Bu bilgi henüz eklenmemiş.
                    </p>
                  )}
                </div>
              ))}
            </div>

            {selectedPerfume.description && (
              <div className="mt-6">
                <h3 className="font-semibold text-[#76583d]">
                  Parfüm hakkında
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {selectedPerfume.description}
                </p>
              </div>
            )}

            {selectedPerfume.sourceUrl && (
              <a
                href={selectedPerfume.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-6 block text-sm font-medium text-[#76583d] underline underline-offset-4"
              >
                Parfümün kaynak sayfasını aç
              </a>
            )}

            {selectedPerfume.fragranticaUrl && (
              <a
                href={selectedPerfume.fragranticaUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block text-sm font-medium text-[#76583d] underline underline-offset-4"
              >
                Fragrantica.fr sayfasını aç
              </a>
            )}

            {typeof selectedPerfume.price === "number" && (
              <p className="mt-6 text-lg font-bold">
                {selectedPerfume.price.toLocaleString("tr-TR")} TL
              </p>
            )}

            <button
              type="button"
              onClick={() => setSelectedPerfume(null)}
              className="mt-7 w-full rounded-xl bg-[#76583d] px-4 py-3 font-medium text-white transition hover:bg-[#5f452f]"
            >
              Kapat
            </button>
          </section>
        </div>
      )}
    </main>
  );
}