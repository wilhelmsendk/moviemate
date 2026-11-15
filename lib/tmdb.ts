import {tmdbCredential,tmdbSettings,type TmdbCredential} from './tmdb-settings';
import {pool} from './db';
import type {ImportPreview} from './import-history';
import type {Movie} from './types';
export async function tmdbConfigured(){return (await tmdbSettings()).configured;}
export async function tmdbRequest(path:string,params:Record<string,string>={},provided?:TmdbCredential){
 const credential=provided||await tmdbCredential();
 if(!credential)throw Error('Online metadata er ikke sat op. Åbn TMDB-opsætning.');
 const url=new URL(`https://api.themoviedb.org/3${path}`);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
 const headers:Record<string,string>={Accept:'application/json'};
 if(credential.kind==='token')headers.Authorization=`Bearer ${credential.value}`;else url.searchParams.set('api_key',credential.value);
 try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(5000),redirect:'error'});
 if(!r.ok)throw Error('upstream');return await r.json();
 }catch{throw Error('TMDB kunne ikke hente metadata. Kontrollér API-adgang og prøv igen.');}
}
export function mapTmdb(data:any):Movie{
 return {id:`external:tmdb:${data.id}`,providerIds:{Tmdb:String(data.id),...(data.external_ids?.imdb_id?{Imdb:data.external_ids.imdb_id}:{})},title:data.title||data.original_title,year:Number(data.release_date?.slice(0,4))||0,minutes:data.runtime||0,genres:(data.genres||[]).map((g:any)=>g.name),people:[...(data.credits?.crew||[]).filter((p:any)=>p.job==='Director').map((p:any)=>({id:'',name:p.name,type:'Director'})),...(data.credits?.cast||[]).slice(0,5).map((p:any)=>({id:'',name:p.name,type:'Actor'}))],overview:'',played:true,favorite:false,audio:[]};
}
export async function tmdbMovie(id:number):Promise<Movie>{
 if(!Number.isSafeInteger(id)||id<=0)throw Error('Ugyldig film');
 const cached=await pool.query("SELECT movie FROM external_metadata WHERE external_id=$1 AND updated>now()-interval '30 days'",[`tmdb:${id}`]);
 if(cached.rows[0])return cached.rows[0].movie;
 const movie=mapTmdb(await tmdbRequest(`/movie/${id}`,{append_to_response:'credits,external_ids',language:'en-US'}));
 await pool.query('INSERT INTO external_metadata(external_id,movie) VALUES($1,$2) ON CONFLICT(external_id) DO UPDATE SET movie=excluded.movie,updated=now()',[`tmdb:${id}`,JSON.stringify(movie)]);return movie;
}
export async function findTmdb(row:ImportPreview,provided?:TmdbCredential){
 const get=(path:string,params:Record<string,string>)=>tmdbRequest(path,params,provided);
 const data=row.imdb&&/^tt[0-9]+$/.test(row.imdb)?await get(`/find/${row.imdb}`,{external_source:'imdb_id'}):await get('/search/movie',{query:row.title,include_adult:'false',...(row.year?{year:String(row.year)}:{})});
 const list=(data.movie_results||data.results||[]).slice(0,5).map((m:any)=>({id:m.id,title:m.title||m.original_title,year:Number(m.release_date?.slice(0,4))||0}));
 // An IMDb ID is an exact identifier. Text matches remain explicit user choices.
 const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const exactTitles=(data.results||[]).filter((m:any)=>row.year&&Number(m.release_date?.slice(0,4))===row.year&&[m.title,m.original_title].some(title=>title&&normalize(title)===normalize(row.title)));
 return {candidates:list,exact:row.imdb&&list.length===1?list[0].id:!row.imdb&&exactTitles.length===1?exactTitles[0].id:null};
}

export async function testTmdbCredential(value:TmdbCredential){const data=await tmdbRequest('/authentication',{},value);if(data.success!==true)throw Error('TMDB afviste nøglen. Kontrollér den og prøv igen.');}
