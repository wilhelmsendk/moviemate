import {createHash} from 'node:crypto';
import {createAsyncCache} from './cache';
import {jelly} from './jellyfin';
export type PlaybackSession={Id:string;DeviceName?:string;Client?:string;SupportsRemoteControl?:boolean;IsActive?:boolean;NowPlayingItem?:{Id?:string;Name?:string};PlayState?:{IsPaused?:boolean;PositionTicks?:number};};
export function controllable(sessions:PlaybackSession[]){return sessions.filter(s=>s.Id&&s.SupportsRemoteControl===true&&s.IsActive!==false&&s.Client!=='MovieMate');}
const sessionCache=createAsyncCache<PlaybackSession[]>(1000,48);
export async function playbackSessions(userId:string,token:string,fresh=false):Promise<PlaybackSession[]>{
 const key=createHash('sha256').update(JSON.stringify([userId,token])).digest('hex');
 const load=async()=>{
  const data=await(await jelly(`/Sessions?${new URLSearchParams({controllableByUserId:userId})}`,token,{},3000)).json();
  return controllable(Array.isArray(data)?data:[]);
 };
 return fresh?load():sessionCache.get(key,load);
}
export function playbackStatus(sessions:PlaybackSession[],itemId:string){const active=sessions.find(s=>s.NowPlayingItem?.Id===itemId);return {status:active?(active.PlayState?.IsPaused?'paused':'playing'):'idle',device:active?.DeviceName||active?.Client||''};}
