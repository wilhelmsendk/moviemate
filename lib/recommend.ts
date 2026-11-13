import type { Movie, Rating, Pick } from './types';
function features(movie: Movie): Map<string, number> {
  const f = new Map<string, number>();
  movie.genres.forEach(g => f.set(`genre:${g.toLowerCase()}`, 1));
  movie.people.filter(p => p.type === 'Director').forEach(p => f.set(`director:${p.id || p.name}`, 1.8));
  movie.people.filter(p => p.type === 'Actor').slice(0, 5).forEach(p => f.set(`actor:${p.id || p.name}`, .55));
  if (movie.year) f.set(`decade:${Math.floor(movie.year / 10)}`, .35);
  return f;
}
export function similarity(a: Movie, b: Movie): number {
  const x = features(a), y = features(b);
  let dot = 0, nx = 0, ny = 0;
  x.forEach((v, k) => { dot += v * (y.get(k) || 0); nx += v * v; });
  y.forEach(v => ny += v * v);
  return nx && ny ? dot / Math.sqrt(nx * ny) : 0;
}
export function recommend(movies: Movie[], ratings: Rating[], maxMinutes = 0, excluded: string[] = [], limit = 12): Pick[] {
  const own = new Map(ratings.map(r => [r.item_id, r.value]));
  // Keep individual positive anchors: comedy and science fiction need not become one average taste.
  const liked = movies.filter(m => (own.get(m.id) ?? (m.favorite ? 3 : m.played ? .25 : 0)) > 0);
  const disliked = movies.filter(m => own.get(m.id) === -2);
  const candidates = movies.filter(m => !m.played && !own.has(m.id) && !excluded.includes(m.id) && (!maxMinutes || (m.minutes > 0 && m.minutes <= maxMinutes)));
  const ranked = candidates.map(m => {
    const anchors = liked.map(a => ({ movie: a, score: similarity(m, a) * (own.get(a.id) === 3 || (own.get(a.id) === undefined && a.favorite) ? 1.2 : own.get(a.id) === 1 ? 1 : .25) })).sort((a,b) => b.score-a.score);
    const positive = anchors.slice(0,3).reduce((s,a,i) => s + a.score / (i+1), 0);
    // A dislike is a modest penalty, not a veto on an entire genre or cast.
    const negative = Math.max(0, ...disliked.map(a => similarity(m,a))) * .3;
    return { ...m, score: positive-negative, reason: anchors[0]?.score > .1 ? `${own.has(anchors[0].movie.id) || anchors[0].movie.favorite ? "Fordi du kunne lide" : "Med afsæt i din historik:"} ${anchors[0].movie.title}` : liked.length ? 'Et andet bud fra dit bibliotek' : 'Lær din smag: bedøm nogle film for personlige forslag' };
  });
  const selected: Pick[] = [];
  while (ranked.length && selected.length < limit) {
    ranked.sort((a,b) => (b.score - diversity(b)) - (a.score - diversity(a)) || a.title.localeCompare(b.title, 'da'));
    selected.push(ranked.shift()!);
  }
  function diversity(m: Movie) { return Math.max(0,...selected.map(s => similarity(m,s))) * .22; }
  return selected;
}
export function pairRank(a: Pick[], b: Pick[]): Pick[] {
  const bm = new Map(b.map(m => [m.id,m]));
  const normalize = (list: Pick[], score: number) => {
    const values = list.map(x => x.score), lo = Math.min(...values), hi = Math.max(...values);
    return hi > lo ? (score-lo)/(hi-lo) : .5;
  };
  return a.filter(m => bm.has(m.id)).map(m => {
    const x = normalize(a,m.score), y = normalize(b,bm.get(m.id)!.score);
    return {...m,score: Math.min(x,y)*.7 + (x+y)/2*.3, reason:'Et fælles bud ud fra begge jeres bedømmelser'};
  }).sort((x,y) => y.score-x.score);
}
