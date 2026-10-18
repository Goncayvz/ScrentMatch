import Papa from "papaparse";
import csvUrl from "../../data/02_Parfumo_Perfumes.csv?url";
import type { Perfume } from "./types/parfum";

type CsvPerfume = {
  Number?: string;
  Name?: string;
  Brand?: string;
  Release_Year?: string;
  Rating_Value?: string;
  Main_Accords?: string;
  Top_Notes?: string;
  Middle_Notes?: string;
  Base_Notes?: string;
  URL?: string;
  Image_URL?: string;
};

function splitNotes(value?: string): string[] {
  if (!value?.trim()) return [];

  return value
    .split(/[;,|]/)
    .map((note) => note.trim())
    .filter(Boolean);
}

export async function loadCsvPerfumes(): Promise<Perfume[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<CsvPerfume>(csvUrl, {
      download: true,
      header: true,
      skipEmptyLines: true,

      complete: (results) => {
        const seenIds = new Set<string>();
        const perfumes: Perfume[] = results.data
          .filter((row) => row.Name?.trim() && row.Brand?.trim())
          .map((row, index) => {
            const baseId = row.Number?.trim() || `perfume-${index}`;
            let id = baseId;
            let duplicateIndex = 1;

            while (seenIds.has(id)) {
              id = `${baseId}-${index}-${duplicateIndex}`;
              duplicateIndex += 1;
            }
            seenIds.add(id);

            return {
              id,
              name: row.Name!.trim(),
              brand: row.Brand!.trim(),
              releaseYear: row.Release_Year
                ? Number(row.Release_Year)
                : undefined,
              rating: row.Rating_Value
                ? Number(row.Rating_Value)
                : undefined,
              mainAccords: splitNotes(row.Main_Accords),
              topNotes: splitNotes(row.Top_Notes),
              middleNotes: splitNotes(row.Middle_Notes),
              baseNotes: splitNotes(row.Base_Notes),
              imageUrl: row.Image_URL?.trim() || undefined,
              sourceUrl: row.URL?.trim() || undefined,
            };
          });

        resolve(perfumes);
      },

      error: (error) => reject(error),
    });
  });
}