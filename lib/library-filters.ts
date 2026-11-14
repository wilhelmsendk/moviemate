import type {Movie} from './types';
export const genreNames:Record<string,string>={action:'Action',adventure:'Eventyr',animation:'Animation',comedy:'Komedie',crime:'Krimi',documentary:'Dokumentar',drama:'Drama',family:'Familie',fantasy:'Fantasy',history:'Historie',horror:'Gyser',music:'Musik',mystery:'Mysterie',romance:'Romantik','science fiction':'Science fiction',thriller:'Thriller',war:'Krig',western:'Western'};
const aliases:Record<string,string>={eventyr:'adventure',komedie:'comedy',krimi:'crime',dokumentar:'documentary',familie:'family',historie:'history',gyser:'horror',musik:'music',mysterie:'mystery',romantik:'romance','sci-fi':'science fiction',krig:'war'};
export function genreKey(value:string){const key=value.trim().toLowerCase();return aliases[key]||key;}
export type LibraryFilter={search:string;genre:string;seen:string;sort:string;ratingsOnly?:boolean;facetIds?:Set<string>};
export function filterMovies<T extends Movie&{rated?:number}>(movies:T[],filter:LibraryFilter,language='da'):T[]{
 const search=filter.search.trim().toLocaleLowerCase();
 const result=movies.filter(m=>(!filter.ratingsOnly||m.rated!==undefined)&&m.title.toLocaleLowerCase().includes(search)&&(!filter.genre||m.genres.some(g=>genreKey(g)===filter.genre))&&(!filter.facetIds||filter.facetIds.has(m.id))&&(filter.seen!=='unwatched'||!m.played)&&(filter.seen!=='watched'||m.played));
 const title=new Intl.Collator(language,{sensitivity:'base',numeric:true});
 return result.sort((a,b)=>{
  if(filter.sort==='title-desc')return title.compare(b.title,a.title);
  if(filter.sort==='newest'||filter.sort==='oldest'){if(!a.year!==!b.year)return a.year?-1:1;const delta=filter.sort==='newest'?b.year-a.year:a.year-b.year;if(delta)return delta;}
  if(filter.sort==='shortest'){if(!a.minutes!==!b.minutes)return a.minutes?-1:1;if(a.minutes!==b.minutes)return a.minutes-b.minutes;}
  return title.compare(a.title,b.title);
 });
}
export function isDanishProduction(locations:string[]=[]){return locations.some(l=>['denmark','danmark','dk','dnk'].includes(l.trim().toLowerCase()));}
