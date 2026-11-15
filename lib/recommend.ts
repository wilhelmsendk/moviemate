import {genreKey} from './library-filters';
import type { Movie, Rating, Pick, ExternalTaste } from './types';
function personKey(value:string){return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function features(movie: Movie): Map<string, number> {
  const f = new Map<string, number>();
  movie.genres.forEach(g => f.set(`genre:${genreKey(g)}`, 1));
  movie.people.filter(p => p.type === 'Director').forEach(p => f.set(`director:${personKey(p.name)}`, 1.8));
  movie.people.filter(p => p.type === 'Actor').slice(0, 5).forEach(p => f.set(`actor:${personKey(p.name)}`, .55));
  if (movie.year) f.set(`decade:${Math.floor(movie.year / 10)}`, .35);
  const norm=Math.sqrt([...f.values()].reduce((sum,v)=>sum+v*v,0));
  if(norm) f.forEach((v,k)=>f.set(k,v/norm));
  return f;
}
function dot(x:Map<string,number>,y:Map<string,number>) {
  let result=0;x.forEach((v,k)=>{result+=v*(y.get(k)||0);});return result;
}
export function similarity(a: Movie,b:Movie):number {return dot(features(a),features(b));}
export function recommend(movies: Movie[], ratings: Rating[], maxMinutes = 0, excluded: string[] = [], limit = 12, external:ExternalTaste[]=[]): Pick[] {
  const own = new Map(ratings.map(r => [r.item_id, r.value]));
  const extras:Movie[]=[];
  const libraryIds=new Map<string,Movie[]>();
  const index=(key:string,m:Movie)=>libraryIds.set(key,[...(libraryIds.get(key)||[]),m]);
  for(const m of movies){for(const [provider,id]of Object.entries(m.providerIds||{}))if(id)index(`${provider.toLowerCase()}:${id}`,m);if(m.year)index(`title:${personKey(m.title)}:${m.year}`,m);}
  const importedWatched=new Set<string>();
  for(const taste of external.slice(0,500)){
    const m=taste.movie;let matches:Movie[]=[];let byProvider=false;
    for(const [provider,id]of Object.entries(m.providerIds||{})){const found=libraryIds.get(`${provider.toLowerCase()}:${id}`);if(found?.length){matches=found;byProvider=true;break;}}
    if(!matches.length&&m.year)matches=(libraryIds.get(`title:${personKey(m.title)}:${m.year}`)||[]).filter(local=>!local.providerIds?.Imdb||!m.providerIds?.Imdb||local.providerIds.Imdb===m.providerIds.Imdb);
    const linked=byProvider?matches:matches.length===1?matches:[];
    if(linked.length){for(const match of linked){if(taste.watched)importedWatched.add(match.id);if(taste.value!==null&&!own.has(match.id))own.set(match.id,taste.value);}}
    else{extras.push({...m,played:taste.watched});if(taste.value!==null)own.set(m.id,taste.value);}
  }
  const all=[...movies.map(m=>importedWatched.has(m.id)?{...m,played:true}:m),...extras];
  const excludedIds=new Set([...excluded,...importedWatched]);
  const vectors=new Map(all.map(m=>[m.id,features(m)]));
  const sim=(a:Movie,b:Movie)=>dot(vectors.get(a.id)!,vectors.get(b.id)!);
  const liked = all.filter(m => (own.get(m.id) ?? (m.favorite ? 3 : m.played ? .25 : 0)) > 0);
  const disliked = all.filter(m => own.get(m.id) === -2);
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
