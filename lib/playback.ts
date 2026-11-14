import {jelly} from './jellyfin';
export type PlaybackSession={Id:string;DeviceName?:string;Client?:string;SupportsRemoteControl?:boolean;IsActive?:boolean;NowPlayingItem?:{Id?:string;Name?:string};PlayState?:{IsPaused?:boolean};};
export function controllable(sessions:PlaybackSession[]){return sessions.filter(s=>s.Id&&s.SupportsRemoteControl===true&&s.IsActive!==false&&s.Client!=='MovieMate');}
export async function playbackSessions(userId:string,token:string):Promise<PlaybackSession[]>{
 const data=await(await jelly(`/Sessions?${new URLSearchParams({controllableByUserId:userId})}`,token)).json();
 return controllable(Array.isArray(data)?data:[]);
}
export function playbackStatus(sessions:PlaybackSession[],itemId:string){const active=sessions.find(s=>s.NowPlayingItem?.Id===itemId);return {status:active?(active.PlayState?.IsPaused?'paused':'playing'):'idle',device:active?.DeviceName||active?.Client||''};}
