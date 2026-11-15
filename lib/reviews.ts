import {pool} from './db';
import {jelly} from './jellyfin';
import {playbackSessions} from './playback';
export function reviewComplete(progress:number,baselinePlayed:boolean|null,played:boolean){return progress>=.85||(baselinePlayed===false&&played);}
// Share only the physical viewing event of a mutually selected film, never ratings.
export async function syncSharedReviews(userId:string){
 await pool.query(`INSERT INTO watch_reviews(user_id,item_id,progress,play_owner,session_id,baseline_played,confirmed,pending,last_seen)
   SELECT DISTINCT ON (w.item_id) $1,w.item_id,w.progress,w.play_owner,w.session_id,w.baseline_played,w.confirmed,w.pending,w.last_seen
   FROM rooms r JOIN watch_reviews w ON w.user_id=CASE WHEN r.host_id=$1 THEN r.guest_id ELSE r.host_id END AND w.item_id=r.selected_item_id
   WHERE (r.host_id=$1 OR r.guest_id=$1) AND r.selected_item_id IS NOT NULL AND w.last_seen>=r.selected_at AND w.user_id=w.play_owner
     AND (w.confirmed OR w.pending OR w.baseline_played IS NOT NULL)
   ORDER BY w.item_id,w.last_seen DESC
   ON CONFLICT(user_id,item_id) DO UPDATE SET progress=GREATEST(watch_reviews.progress,excluded.progress),
     play_owner=excluded.play_owner,session_id=excluded.session_id,baseline_played=excluded.baseline_played,
     confirmed=watch_reviews.confirmed OR excluded.confirmed,pending=watch_reviews.pending OR excluded.pending,
     last_seen=GREATEST(watch_reviews.last_seen,excluded.last_seen)
   WHERE watch_reviews.dismissed=false AND (excluded.last_seen>=watch_reviews.last_seen OR (excluded.play_owner=watch_reviews.play_owner AND excluded.session_id=watch_reviews.session_id))`,[userId]);
}
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
   const own=await pool.query('SELECT token FROM sessions WHERE user_id=$1 AND expires>now() ORDER BY expires DESC LIMIT 1',[watch.play_owner]);
   if(own.rows[0]){const item=await(await jelly(`/Users/${encodeURIComponent(watch.play_owner)}/Items/${encodeURIComponent(watch.item_id)}`,own.rows[0].token,{},3000)).json();played=item.UserData?.Played===true;}
  }
  if(reviewComplete(watch.progress,watch.baseline_played,played))await pool.query('UPDATE watch_reviews SET pending=true,confirmed=true WHERE user_id=$1 AND item_id=$2',[userId,watch.item_id]);
 }catch{/* A failed server read must never imply completion. */}}));
}
