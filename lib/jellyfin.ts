import { randomUUID, createHash } from 'node:crypto';
import type { Movie } from './types';
import { createSnapshotCache } from './snapshot-cache';
import { pool,ready } from './db';
const libraryCache=createSnapshotCache<Movie[],{userId:string;token:string}>({
 async read(key){await ready();const r=await pool.query('SELECT movies,updated FROM library_snapshots WHERE cache_key=$1',[key]);return r.rows[0]?{value:r.rows[0].movies,updated:new Date(r.rows[0].updated).getTime()}:null;},
 async write(key,snapshot){const userId=JSON.parse(key)[1];await pool.query('INSERT INTO library_snapshots(cache_key,user_id,movies,updated) VALUES($1,$2,$3,$4) ON CONFLICT(cache_key) DO UPDATE SET movies=excluded.movies,updated=excluded.updated',[key,userId,JSON.stringify(snapshot.value),new Date(snapshot.updated)]);},
 load:(_key,context)=>fetchLibrary(context.userId,context.token)
});

export function serverUrl() {
  const url = new URL(process.env.JELLYFIN_URL || 'http://host.docker.internal:8096');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Ugyldig JELLYFIN_URL');
  return url.toString().replace(/\/$/, '');
}
export async function jelly(path: string, token?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  // Jellyfin can replace a device's session when another user signs in.
  // Every authentication gets its own device; later calls identify that session by token.
  headers.set('Authorization', token
    ? `MediaBrowser Token="${token.replace(/["\r\n]/g,'')}"`
    : `MediaBrowser Client="MovieMate", Device="MovieMate", DeviceId="moviemate-${randomUUID()}", Version="0.1.5"`);
  if (init.body) headers.set('Content-Type','application/json');
  const res = await fetch(`${serverUrl()}${path}`, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!res.ok) throw new JellyfinError(res.status);
  return res;
}
export class JellyfinError extends Error { constructor(public status: number) { super(`Jellyfin svarede ${status}`); } }
export function library(userId:string,token:string,force=false):Promise<Movie[]> {
  const key=JSON.stringify([createHash('sha256').update(serverUrl()).digest('hex'),userId]);
  return force?libraryCache.refresh(key,{userId,token}):libraryCache.get(key,{userId,token});
}
async function fetchLibrary(userId: string, token: string): Promise<Movie[]> {
  const items: Movie[] = [];
  for (let start = 0; ; start += 500) {
    const query = new URLSearchParams({ userId, includeItemTypes:'Movie', recursive:'true', fields:'Genres,People,Overview,MediaStreams', enableUserData:'true', startIndex:String(start), limit:'500' });
    const data = await (await jelly(`/Items?${query}`,token)).json();
    for (const m of data.Items || []) items.push(mapMovie(m));
    if (!data.Items?.length || items.length >= (data.TotalRecordCount ?? items.length)) break;
    if (start >= 49500) throw new Error('Biblioteket overskrider grænsen på 50.000 film');
  }
  return items;
}

export function mapMovie(m:Record<string,any>):Movie {
  return {
      id:m.Id, title:m.Name || 'Ukendt titel', year:m.ProductionYear || 0,
      minutes:Math.round((m.RunTimeTicks || 0)/600000000), genres:m.Genres || [],
      people:(m.People || []).map((p: {Id?:string;Name:string;Type:string}) => ({id:p.Id || '',name:p.Name,type:p.Type})),
      overview:m.Overview || '', played:!!m.UserData?.Played, favorite:!!m.UserData?.IsFavorite,
      imageTag:m.ImageTags?.Primary,
      audio:[...new Set<string>((m.MediaStreams || []).filter((s:{Type:string}) => s.Type==='Audio').map((s:{Language?:string}) => s.Language || 'und'))],
    trailers:(m.RemoteTrailers||[]).filter((t:{Url?:string})=>{
      try{const u=new URL(t.Url||'');return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
    }).map((t:{Name?:string;Url:string})=>({name:t.Name||'Se trailer',url:t.Url}))
  };
}
