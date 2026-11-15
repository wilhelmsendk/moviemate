import {createHash} from 'node:crypto';
import {createAsyncCache} from './cache';
import {jelly} from './jellyfin';
export type PlaybackSession={Id:string;DeviceId?:string;UserId?:string;UserName?:string;DeviceName?:string;Client?:string;SupportsRemoteControl?:boolean;IsActive?:boolean;NowPlayingItem?:{Id?:string;Name?:string;RunTimeTicks?:number};PlayState?:{IsPaused?:boolean;PositionTicks?:number};};
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

export type PreferredDevice={deviceId?:string;name:string;client:string;userId:string};
export function deviceIdentity(s:PlaybackSession):PreferredDevice{return {deviceId:s.DeviceId||undefined,name:s.DeviceName||'',client:s.Client||'',userId:s.UserId||''};}
export function preferredSession(sessions:PlaybackSession[],preferred?:PreferredDevice|null){
 if(!preferred)return null;
 const matches=sessions.filter(s=>preferred.deviceId?s.DeviceId===preferred.deviceId:s.DeviceName===preferred.name&&s.Client===preferred.client&&(s.UserId||'')===preferred.userId);
 return matches.length===1?matches[0].Id:null;
}
export function deviceLabel(s:PlaybackSession){return [...new Set([s.DeviceName,s.Client,s.UserName].filter(Boolean))].join(' · ')||'Jellyfin';}
