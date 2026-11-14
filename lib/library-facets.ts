import {createHash} from 'node:crypto';
import {createSnapshotCache} from './snapshot-cache';
import {pool,ready} from './db';
import {jelly,serverUrl} from './jellyfin';
import {isDanishProduction} from './library-filters';
export type Facet='danish-origin'|'danish-audio';
const cache=createSnapshotCache<string[],{userId:string;token:string;facet:Facet}>({
 hardTtl:Infinity,
 async read(key){await ready();const r=await pool.query('SELECT ids,updated FROM library_facets WHERE cache_key=$1',[key]);return r.rows[0]?{value:r.rows[0].ids,updated:new Date(r.rows[0].updated).getTime()}:null;},
 async write(key,snapshot){await pool.query('INSERT INTO library_facets(cache_key,ids,updated) VALUES($1,$2,$3) ON CONFLICT(cache_key) DO UPDATE SET ids=excluded.ids,updated=excluded.updated',[key,JSON.stringify(snapshot.value),new Date(snapshot.updated)]);},
 async load(_key,{userId,token,facet}){
  const ids:string[]=[];let count=0;
  for(let start=0;;start+=500){
   const query=new URLSearchParams({userId,includeItemTypes:'Movie',recursive:'true',enableUserData:'false',enableImages:'false',startIndex:String(start),limit:'500',...(facet==='danish-audio'?{audioLanguages:'dan,da'}:{fields:'ProductionLocations'})});
   const data=await(await jelly(`/Items?${query}`,token,{},10000)).json();
   const items=data.Items||[];count+=items.length;
   for(const m of items)if(facet==='danish-audio'||isDanishProduction(m.ProductionLocations))ids.push(m.Id);
   if(!items.length||count>=(data.TotalRecordCount??count))break;
   if(start>=49500)throw Error('Biblioteket overskrider grænsen på 50.000 film');
  }
  return ids;
 }
});
export function libraryFacet(userId:string,token:string,facet:Facet){return cache.get(JSON.stringify([createHash('sha256').update(serverUrl()).digest('hex'),userId,facet]),{userId,token,facet});}
