import type { Movie, Rating, Pick } from './types';
function features(movie: Movie): Map<string, number> {
  const f = new Map<string, number>();
  movie.genres.forEach(g => f.set(`genre:${g.toLowerCase()}`, 1));
  movie.people.filter(p => p.type === 'Director').forEach(p => f.set(`director:${p.id || p.name}`, 1.8));
  movie.people.filter(p => p.type === 'Actor').slice(0, 5).forEach(p => f.set(`actor:${p.id || p.name}`, .55));
  if (movie.year) f.set(`decade:${Math.floor(movie.year / 10)}`, .35);
  const norm=Math.sqrt([...f.values()].reduce((sum,v)=>sum+v*v,0));
  if(norm) f.forEach((v,k)=>f.set(k,v/norm));
  return f;
}
function dot(x:Map<string,number>,y:Map<string,number>) {
  let result=0;x.forEach((v,k)=>{result+=v*(y.get(k)||0);});return result;
}
export function similarity(a: Movie,b:Movie):number {return dot(features(a),features(b));}
export function recommend(movies: Movie[], ratings: Rating[], maxMinutes = 0, excluded: string[] = [], limit = 12): Pick[] {
  const own = new Map(ratings.map(r => [r.item_id, r.value]));
  const excludedIds=new Set(excluded);
  const vectors=new Map(movies.map(m=>[m.id,features(m)]));
  const sim=(a:Movie,b:Movie)=>dot(vectors.get(a.id)!,vectors.get(b.id)!);
  const liked = movies.filter(m => (own.get(m.id) ?? (m.favorite ? 3 : m.played ? .25 : 0)) > 0);
  const disliked = movies.filter(m => own.get(m.id) === -2);
  const candidates = movies.filter(m => !m.played && !own.has(m.id) && !excludedIds.has(m.id) && (!maxMinutes || (m.minutes > 0 && m.minutes <= maxMinutes)));
  const ranked:Pick[] = candidates.map(m => {
    const anchors = liked.map(a => ({ movie: a, score: sim(m,a) * (own.get(a.id) === 3 || (own.get(a.id) === undefined && a.favorite) ? 1.2 : own.get(a.id) === 1 ? 1 : .25) })).sort((a,b) => b.score-a.score);
    const positive = anchors.slice(0,3).reduce((s,a,i) => s + a.score / (i+1), 0);
    const negative = Math.max(0, ...disliked.map(a => sim(m,a))) * .3;
    return { ...m, score: positive-negative, reason: anchors[0]?.score > .1 ? `${own.has(anchors[0].movie.id) || anchors[0].movie.favorite ? 'Fordi du kunne lide' : 'Med afsæt i din historik:'} ${anchors[0].movie.title}` : liked.length ? 'Et andet bud fra dit bibliotek' : 'Lær din smag: bedøm nogle film for personlige forslag' };
  });
  // Pairing needs every candidate's raw score, not an expensive complete MMR ordering.
  if(limit>=ranked.length)return ranked.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'da'));
  // Incremental diversity: compare each remaining item only with the newest selection.
  const penalties=new Map<string,number>();
  const selected:Pick[]=[];
  while(ranked.length&&selected.length<limit){
    let best=0;
    for(let i=1;i<ranked.length;i++){
      const a=ranked[i],b=ranked[best];
      const delta=(a.score-(penalties.get(a.id)||0))-(b.score-(penalties.get(b.id)||0));
      if(delta>0||(delta===0&&a.title.localeCompare(b.title,'da')<0))best=i;
    }
    const chosen=ranked.splice(best,1)[0];selected.push(chosen);
    for(const candidate of ranked)penalties.set(candidate.id,Math.max(penalties.get(candidate.id)||0,sim(candidate,chosen)*.22));
  }
  return selected;
}
export function pairRank(a:Pick[],b:Pick[]):Pick[]{
  const bm=new Map(b.map(m=>[m.id,m]));
  function normalizer(list:Pick[]){
    let lo=Infinity,hi=-Infinity;
    for(const m of list){lo=Math.min(lo,m.score);hi=Math.max(hi,m.score);}
    return (score:number)=>hi>lo?(score-lo)/(hi-lo):.5;
  }
  const na=normalizer(a),nb=normalizer(b);
  return a.filter(m=>bm.has(m.id)).map(m=>{
    const x=na(m.score),y=nb(bm.get(m.id)!.score);
    return {...m,score:Math.min(x,y)*.7+(x+y)/2*.3,reason:'Et fælles bud ud fra begge jeres bedømmelser'};
  }).sort((x,y)=>y.score-x.score||x.title.localeCompare(y.title,'da'));
}
