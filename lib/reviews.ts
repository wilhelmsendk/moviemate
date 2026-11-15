import {pool} from './db';
import {jelly} from './jellyfin';
import {playbackSessions} from './playback';
export function reviewComplete(progress:number,baselinePlayed:boolean|null,played:boolean){return progress>=.85||(baselinePlayed===false&&played);}
// Reconcile persisted observations with live Jellyfin state, including when the phone missed the end.
export async function reconcileReviews(userId:string){
 const result=await pool.query('SELECT w.* FROM watch_reviews w WHERE w.user_id=$1 AND w.pending=false AND w.dismissed=false AND w.play_owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ratings r WHERE r.user_id=w.user_id AND r.item_id=w.item_id) ORDER BY w.last_seen DESC LIMIT 5',[userId]);
 const actors=new Map<string,Promise<Awaited<ReturnType<typeof playbackSessions>>|null>>();
 await Promise.all(result.rows.map(async watch=>{try{
  let observed=actors.get(watch.play_owner);
  if(!observed){observed=(async()=>{const actor=await pool.query('SELECT token FROM sessions WHERE user_id=$1 AND expires>now() ORDER BY expires DESC LIMIT 1',[watch.play_owner]);return actor.rows[0]?playbackSessions(watch.play_owner,actor.rows[0].token):null;})();actors.set(watch.play_owner,observed);}
  const sessions=await observed;if(!sessions)return; // Unavailable is not stopped.
  const active=sessions.find(d=>d.NowPlayingItem?.Id===watch.item_id);
  if(active){
   const duration=active.NowPlayingItem?.RunTimeTicks||0;
   if(duration>0)await pool.query('UPDATE watch_reviews SET progress=GREATEST(progress,$3),confirmed=true,last_seen=now() WHERE user_id=$1 AND item_id=$2',[userId,watch.item_id,Math.min(1,(active.PlayState?.PositionTicks||0)/duration)]);
   return;
  }
  let played=false;
  if(watch.progress<.85&&watch.baseline_played===false){
   const own=await pool.query('SELECT token FROM sessions WHERE user_id=$1 AND expires>now() ORDER BY expires DESC LIMIT 1',[userId]);
   if(own.rows[0]){const item=await(await jelly(`/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(watch.item_id)}`,own.rows[0].token,{},3000)).json();played=item.UserData?.Played===true;}
  }
  if(reviewComplete(watch.progress,watch.baseline_played,played))await pool.query('UPDATE watch_reviews SET pending=true,confirmed=true WHERE user_id=$1 AND item_id=$2',[userId,watch.item_id]);
 }catch{/* A failed server read must never imply completion. */}}));
}
