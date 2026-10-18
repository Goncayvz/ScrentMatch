import perfumesData from "../../data/perfumes.json";
import type { Perfume } from "./types/parfum";

export const perfumes: Perfume[] = perfumesData;

export function searchPerfumes(query: string): Perfume[] {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");

    if (!normalizedQuery) {
        return perfumes;
    }

    return perfumes.filter((perfume) => {
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
}