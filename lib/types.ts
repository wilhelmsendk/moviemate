export type Movie = {
  id: string; title: string; year: number; minutes: number; genres: string[];
  people: { id: string; name: string; type: string }[]; overview: string;
  played: boolean; favorite: boolean; imageTag?: string; audio: string[]; trailers?: {name:string;url:string}[];
};
export type Rating = { item_id: string; value: number };
export type Pick = Movie & { score: number; reason: string; rated?: number };

export type InboxRecommendation={id:string;sender:string;note:string;created:string;read_at:string|null;movie:Movie};
