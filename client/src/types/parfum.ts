export interface Perfume {
    id:string;
    name:string;
    brand:string;

    gender?:string;
    fragranceFamily?:string;

    topNotes?:string[];
    middleNotes?:string[];
    baseNotes?:string[];

    mainAccords?:string[];
    releaseYear?:number;
    rating?:number;
    description?:string;
    price?:number;
    imageUrl?:string;
    sourceUrl?:string;
    fragranticaUrl?:string;

}