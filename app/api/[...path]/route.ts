import {playbackSessions,playbackStatus} from '@/lib/playback';
import {resolveLanguage,translate} from '@/lib/i18n';
import { randomBytes, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { pool, ready } from '@/lib/db';
import { jelly, library, mapMovie, JellyfinError } from '@/lib/jellyfin';
import { createAsyncCache } from '@/lib/cache';
import { recommend, pairRank } from '@/lib/recommend';
import type { Rating } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const pairCache=createAsyncCache<ReturnType<typeof pairRank>>(60000,48);
const posterCache=createAsyncCache<{bytes:Uint8Array;type:string}>(600000,128);
const failures = new Map<string,{n:number;until:number}>();
class HttpError extends Error { constructor(public status:number,message:string) { super(message); } }
async function body(req:NextRequest) {
  if (Number(req.headers.get('content-length') || 0)>12000) throw new HttpError(413,'For stor forespørgsel');
  const text = await req.text();
  if (text.length>12000) throw new HttpError(413,'For stor forespørgsel');
  try { return JSON.parse(text); } catch { throw new HttpError(400,'Ugyldige data'); }
}
async function session(req:NextRequest) {
  const sid = req.cookies.get('mm_session')?.value;
  if (!sid) throw new HttpError(401,'Log ind for at fortsætte');
  const result = await pool.query('SELECT s.*,p.name,p.receive_recommendations,p.language FROM sessions s JOIN profiles p ON p.id=s.user_id WHERE hash=$1 AND expires>now()',[hash(sid)]);
  if (!result.rows[0]) throw new HttpError(401,'Din session er udløbet. Log ind igen.');
  return result.rows[0] as {hash:string;user_id:string;token:string;name:string;receive_recommendations:boolean;language:'da'|'en'|null};
}
async function state(userId:string) {
  const [r,d] = await Promise.all([
    pool.query<Rating>('SELECT item_id,value FROM ratings WHERE user_id=$1',[userId]),
    pool.query('SELECT item_id FROM dismissals WHERE user_id=$1 AND expires>now()',[userId])
  ]);
  return {ratings:r.rows,excluded:d.rows.map(x=>x.item_id)};
}
async function handle(req:NextRequest) {
  const started=performance.now();
  const language=resolveLanguage(req.headers.get('accept-language'));
  const json=(data:any,status=200)=>{
    if(data?.error)data={...data,error:translate(data.error,language)};
    return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
  };
  try {
    if (req.method==='POST') {
      const origin=req.headers.get('origin');
      if (!origin || new URL(origin).host!==req.headers.get('host')) throw new HttpError(403,'Forespørgslen skal komme fra MovieMate');
    }
    const path=req.nextUrl.pathname.replace(/^\/api\//,'');
    if (path==='health') return json({ok:true});
    await ready();
    if (path==='login' && req.method==='POST') {
      const b=await body(req);
      if (typeof b.username!=='string' || typeof b.password!=='string' || !b.username.trim() || b.username.length>200 || b.password.length>1000) throw new HttpError(400,'Udfyld brugernavn og adgangskode');
      const key=b.username.toLowerCase().trim(), fail=failures.get(key);
      if (fail && fail.until>Date.now() && fail.n>=8) throw new HttpError(429,'For mange forsøg. Vent 10 minutter.');
      let data;
      try { data=await (await jelly('/Users/AuthenticateByName',undefined,{method:'POST',body:JSON.stringify({Username:b.username,Pw:b.password})})).json(); }
      catch(e) {
        if (e instanceof JellyfinError && [400,401,403].includes(e.status)) {
          if (failures.size>10000) failures.clear();
          failures.set(key,{n:fail && fail.until>Date.now()?fail.n+1:1,until:Date.now()+600000});
          throw new HttpError(401,'Jellyfin afviste login. Kontrollér brugernavn og adgangskode.');
        }
        throw e;
      }
      if (!data.AccessToken || !data.User?.Id) throw new HttpError(502,'Uventet svar fra Jellyfin');
      failures.delete(key);
      await pool.query('INSERT INTO profiles(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=excluded.name',[data.User.Id,data.User.Name]);
      const sid=randomBytes(32).toString('hex');
      await pool.query('DELETE FROM sessions WHERE expires<now()');
      await pool.query("INSERT INTO sessions(hash,user_id,token,expires) VALUES($1,$2,$3,now()+interval '7 days')",[hash(sid),data.User.Id,data.AccessToken]);
      const response=json({name:data.User.Name});
      response.cookies.set('mm_session',sid,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',maxAge:604800,path:'/'});
      return response;
    }
    const s=await session(req);
    if(path==='playback'&&req.method==='GET'){
      const itemId=req.nextUrl.searchParams.get('itemId')||'';
      if(!(await library(s.user_id,s.token)).some(m=>m.id===itemId))throw new HttpError(403,'Filmen er ikke tilgængelig for dig');
      const mine=await playbackSessions(s.user_id,s.token);
      let status=playbackStatus(mine,itemId);
      const code=req.nextUrl.searchParams.get('code');
      if(code&&status.status==='idle'){
        const room=await pool.query('SELECT CASE WHEN host_id=$1 THEN guest_id ELSE host_id END AS partner FROM rooms WHERE code=$2 AND selected_item_id=$3 AND (host_id=$1 OR guest_id=$1)',[s.user_id,code,itemId]);
        if(room.rows[0]?.partner){
          const partner=await pool.query('SELECT token FROM sessions WHERE user_id=$1 AND expires>now() ORDER BY expires DESC LIMIT 1',[room.rows[0].partner]);
          if(partner.rows[0])try{status=playbackStatus(await playbackSessions(room.rows[0].partner,partner.rows[0].token),itemId);}catch{}
        }
      }
      return json({...status,targets:mine.map(d=>({id:d.Id,name:d.DeviceName||d.Client||'Jellyfin'}))});
    }
    if(path==='playback/start'&&req.method==='POST'){
      const b=await body(req);
      if(typeof b.itemId!=='string'||typeof b.sessionId!=='string')throw new HttpError(400,'Ugyldig film');
      const movie=await(await jelly(`/Users/${encodeURIComponent(s.user_id)}/Items/${encodeURIComponent(b.itemId)}`,s.token)).json();
      if(movie.Type!=='Movie')throw new HttpError(403,'Filmen er ikke tilgængelig for dig');
      const targets=await playbackSessions(s.user_id,s.token);
      if(!targets.some(d=>d.Id===b.sessionId))throw new HttpError(403,'Enheden er ikke tilgængelig for fjernstyring');
      await jelly(`/Sessions/${encodeURIComponent(b.sessionId)}/Playing?${new URLSearchParams({playCommand:'PlayNow',itemIds:b.itemId,startPositionTicks:'0'})}`,s.token,{method:'POST'});
      return json({accepted:true});
    }
    if (path==='logout' && req.method==='POST') {
      await pool.query('DELETE FROM sessions WHERE hash=$1',[s.hash]);
      const response=json({ok:true}); response.cookies.delete('mm_session');return response;
    }
    if (path==='me' && req.method==='GET') return json({id:s.user_id,name:s.name,receiveRecommendations:s.receive_recommendations,language:s.language});
    if(path==='tonight'&&req.method==='GET'){
      const result=await pool.query(`SELECT r.*,p.name AS partner_name FROM rooms r
        JOIN profiles p ON p.id=CASE WHEN r.host_id=$1 THEN r.guest_id ELSE r.host_id END
        WHERE (r.host_id=$1 OR r.guest_id=$1) AND r.selected_at IS NOT NULL
        ORDER BY r.selected_at DESC,r.code DESC LIMIT 1`,[s.user_id]);
      const selected=result.rows[0];
      if(!selected?.selected_item_id)return json({choice:null});
      const movie=(await library(s.user_id,s.token)).find(m=>m.id===selected.selected_item_id);
      return json({choice:movie?{code:selected.code,version:Number(selected.revision),partner:selected.partner_name,movie}:null});
    }
    if(path==='tonight/end'&&req.method==='POST'){
      const b=await body(req);
      if(typeof b.code!=='string'||typeof b.itemId!=='string'||!Number.isSafeInteger(b.version))throw new HttpError(400,'Ugyldigt filmvalg');
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const ended=await client.query('UPDATE rooms SET selected_item_id=NULL,revision=revision+1 WHERE code=$1 AND selected_item_id=$2 AND (host_id=$3 OR guest_id=$3) AND revision=$4 RETURNING revision',[b.code,b.itemId,s.user_id,b.version]);
        if(!ended.rows.length)throw new HttpError(409,'Filmvalget er allerede afsluttet eller ændret');
        await client.query('DELETE FROM room_votes WHERE code=$1',[b.code]);
        await client.query('COMMIT');
        return json({ok:true,version:Number(ended.rows[0].revision)});
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }
    if(path==='preferences'&&req.method==='POST'){
      const b=await body(req);
      if(b.receiveRecommendations===undefined&&b.language===undefined)throw new HttpError(400,'Ugyldig indstilling');
      if(b.receiveRecommendations!==undefined&&typeof b.receiveRecommendations!=='boolean')throw new HttpError(400,'Ugyldig indstilling');
      if(b.language!==undefined&&!['da','en'].includes(b.language))throw new HttpError(400,'Ugyldig indstilling');
      await pool.query('UPDATE profiles SET receive_recommendations=COALESCE($1,receive_recommendations),language=COALESCE($2,language) WHERE id=$3',[b.receiveRecommendations??null,b.language??null,s.user_id]);
      return json({ok:true});
    }
    if(path.startsWith('movie/')&&req.method==='GET'){
      const id=path.split('/')[1];
      if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw new HttpError(400,'Ugyldig film');
      const data=await(await jelly(`/Users/${s.user_id}/Items/${id}`,s.token)).json();
      if(data.Type!=='Movie')throw new HttpError(400,'Vælg en film');
      return json({movie:mapMovie(data)});
    }
    if(path==='recipients'&&req.method==='GET'){
      const users=await pool.query('SELECT id,name FROM profiles WHERE id<>$1 AND receive_recommendations=true ORDER BY name',[s.user_id]);
      return json({users:users.rows});
    }
    if(path==='recommendations/send'&&req.method==='POST'){
      const b=await body(req);
      if(typeof b.itemId!=='string'||typeof b.recipientId!=='string'||typeof b.note!=='string'||b.note.length>500||b.recipientId===s.user_id)throw new HttpError(400,'Vælg en anden bruger og en besked på højst 500 tegn');
      const ownMovies=await library(s.user_id,s.token);
      if(!ownMovies.some(m=>m.id===b.itemId))throw new HttpError(403,'Filmen er ikke tilgængelig for dig');
      const target=await pool.query('SELECT s.token FROM profiles p JOIN sessions s ON s.user_id=p.id WHERE p.id=$1 AND p.receive_recommendations=true AND s.expires>now() ORDER BY s.expires DESC LIMIT 1',[b.recipientId]);
      if(!target.rows[0])throw new HttpError(409,'Brugeren skal logge ind i MovieMate og slå anbefalinger til');
      let allowed;
      try{allowed=(await library(b.recipientId,target.rows[0].token)).some(m=>m.id===b.itemId);}
      catch{throw new HttpError(409,'Modtagerens Jellyfin-adgang kunne ikke bekræftes. Prøv igen senere.');}
      if(!allowed)throw new HttpError(403,'Filmen kan ikke anbefales til denne bruger');
      const recent=await pool.query("SELECT count(*)::int AS n FROM recommendations WHERE sender_id=$1 AND created>now()-interval '1 day'",[s.user_id]);
      if(recent.rows[0].n>=20)throw new HttpError(429,'Du kan sende op til 20 anbefalinger om dagen');
      const duplicate=await pool.query("SELECT id FROM recommendations WHERE sender_id=$1 AND recipient_id=$2 AND item_id=$3 AND created>now()-interval '1 day'",[s.user_id,b.recipientId,b.itemId]);
      if(duplicate.rows.length)throw new HttpError(409,'Du har allerede anbefalet filmen til denne bruger i dag');
      await pool.query('INSERT INTO recommendations(id,sender_id,recipient_id,item_id,note) VALUES($1,$2,$3,$4,$5)',[randomBytes(16).toString('hex'),s.user_id,b.recipientId,b.itemId,b.note.trim()]);
      return json({ok:true});
    }
    if(path==='inbox'&&req.method==='GET'){
      const [result,movies]=await Promise.all([pool.query('SELECT r.id,r.item_id,r.note,r.created,r.read_at,p.name AS sender FROM recommendations r JOIN profiles p ON p.id=r.sender_id WHERE r.recipient_id=$1 ORDER BY r.created DESC LIMIT 100',[s.user_id]),library(s.user_id,s.token)]);
      const available=new Map(movies.map(m=>[m.id,m]));
      return json({messages:result.rows.filter(r=>available.has(r.item_id)).map(r=>({id:r.id,note:r.note,created:r.created,read_at:r.read_at,sender:r.sender,movie:available.get(r.item_id)}))});
    }
    if(path==='inbox/read'&&req.method==='POST'){
      const b=await body(req);
      if(typeof b.id!=='string')throw new HttpError(400,'Ugyldig anbefaling');
      await pool.query('UPDATE recommendations SET read_at=now() WHERE id=$1 AND recipient_id=$2',[b.id,s.user_id]);
      return json({ok:true});
    }
    if(path==='library/refresh'&&req.method==='POST'){
      const movies=await library(s.user_id,s.token,true);return json({count:movies.length});
    }
    if (path==='library' && req.method==='GET') {
      const [movies,own]=await Promise.all([library(s.user_id,s.token),state(s.user_id)]);
      return json({movies:movies.map(m=>({...m,rated:own.ratings.find(r=>r.item_id===m.id)?.value})),ratingCount:own.ratings.length});
    }
    if (path==='recommendations' && req.method==='GET') {
      const [movies,own]=await Promise.all([library(s.user_id,s.token),state(s.user_id)]);
      const max=Number(req.nextUrl.searchParams.get('minutes')) || 0;
      return json({movies:recommend(movies,own.ratings,max,own.excluded),personalized:own.ratings.some(r=>r.value>0)||movies.some(m=>m.favorite)});
    }
    if ((path==='rate'||path==='dismiss') && req.method==='POST') {
      const b=await body(req);
      if (typeof b.id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(b.id)) throw new HttpError(400,'Ugyldig film');
      // Check the user's actual library permissions, not a supplied user ID.
      const visible=await library(s.user_id,s.token);
      if (!visible.some(movie=>movie.id===b.id)) throw new HttpError(403,'Filmen findes ikke i dit tilgængelige bibliotek');
      if (path==='dismiss') await pool.query("INSERT INTO dismissals(user_id,item_id,expires) VALUES($1,$2,now()+interval '12 hours') ON CONFLICT(user_id,item_id) DO UPDATE SET expires=excluded.expires",[s.user_id,b.id]);
      else if (b.value===null) await pool.query('DELETE FROM ratings WHERE user_id=$1 AND item_id=$2',[s.user_id,b.id]);
      else {
        if (![-2,1,3].includes(b.value)) throw new HttpError(400,'Ugyldig bedømmelse');
        await pool.query('INSERT INTO ratings(user_id,item_id,value) VALUES($1,$2,$3) ON CONFLICT(user_id,item_id) DO UPDATE SET value=excluded.value,updated=now()',[s.user_id,b.id,b.value]);
      }
      return json({ok:true});
    }
    if (path.startsWith('image/') && req.method==='GET') {
      const id=path.split('/')[1];
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new HttpError(400,'Ugyldigt billede');
      if(!(await library(s.user_id,s.token)).some(m=>m.id===id))throw new HttpError(403,'Billedet er ikke tilgængeligt');
      const image=await posterCache.get(hash(`${s.user_id}:${s.token}:${id}`),async()=>{
        const upstream=await jelly(`/Items/${id}/Images/Primary?maxWidth=600&quality=85`,s.token);
        const type=upstream.headers.get('content-type')||'';
        if(!type.startsWith('image/')||Number(upstream.headers.get('content-length')||0)>2000000)throw new HttpError(502,'Ugyldigt plakatbillede');
        const bytes=new Uint8Array(await upstream.arrayBuffer());if(bytes.length>2000000)throw new HttpError(502,'Plakaten er for stor');
        return {bytes,type};
      });
      return new NextResponse(Buffer.from(image.bytes),{headers:{'Content-Type':image.type,'Cache-Control':'private, max-age=3600'}});
    }
    if (path==='rooms' && req.method==='POST') {
      const code=randomBytes(6).toString('hex').toUpperCase();
      await pool.query('DELETE FROM rooms WHERE expires<now() AND selected_at IS NULL');
      await pool.query("INSERT INTO rooms(code,host_id,expires) VALUES($1,$2,now()+interval '2 hours')",[code,s.user_id]);
      return json({code});
    }
    if (path==='rooms/join' && req.method==='POST') {
      const b=await body(req),code=String(b.code||'').toUpperCase().trim();
      const r=await pool.query('UPDATE rooms SET guest_id=$1 WHERE code=$2 AND expires>now() AND host_id<>$1 AND (guest_id IS NULL OR guest_id=$1) RETURNING code',[s.user_id,code]);
      if (!r.rows.length) throw new HttpError(404,'Koden er udløbet, optaget eller din egen');
      return json({code});
    }
    if(/^rooms\/[^/]+\/(vote|reset)$/.test(path)&&req.method==='POST'){
      const [,code,action]=path.split('/'),b=await body(req);
      const membership=await pool.query('SELECT * FROM rooms WHERE code=$1 AND expires>now() AND (host_id=$2 OR guest_id=$2)',[code,s.user_id]);
      const room=membership.rows[0];if(!room||!room.guest_id)throw new HttpError(404,'Filmaftenen er ikke klar');
      let movie;
      if(action==='vote'){
        if(typeof b.itemId!=='string'||typeof b.approved!=='boolean')throw new HttpError(400,'Ugyldigt filmvalg');
        const otherId=room.host_id===s.user_id?room.guest_id:room.host_id;
        const other=await pool.query('SELECT token FROM sessions WHERE user_id=$1 AND expires>now() ORDER BY expires DESC LIMIT 1',[otherId]);
        if(!other.rows[0])throw new HttpError(409,'Din filmmakker skal logge ind igen');
        const [mine,theirs]=await Promise.all([library(s.user_id,s.token),library(otherId,other.rows[0].token)]);
        movie=mine.find(m=>m.id===b.itemId);
        if(!movie||!theirs.some(m=>m.id===b.itemId))throw new HttpError(403,'Filmen er ikke tilgængelig for jer begge');
      }
      const client=await pool.connect();let selected=null,version=0;
      try{
        await client.query('BEGIN');
        const locked=await client.query('SELECT * FROM rooms WHERE code=$1 AND expires>now() AND (host_id=$2 OR guest_id=$2) FOR UPDATE',[code,s.user_id]);
        if(!locked.rows[0])throw new HttpError(404,'Filmaftenen er udløbet');
        if(action==='reset'){
          await client.query('DELETE FROM room_votes WHERE code=$1',[code]);
          await client.query('UPDATE rooms SET selected_item_id=NULL WHERE code=$1',[code]);
        }else{
          if(locked.rows[0].selected_item_id)throw new HttpError(409,'I har allerede valgt en film. Vælg en anden for at starte forfra.');
          if(b.approved)await client.query('INSERT INTO room_votes(code,user_id,item_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[code,s.user_id,b.itemId]);
          else await client.query('DELETE FROM room_votes WHERE code=$1 AND user_id=$2 AND item_id=$3',[code,s.user_id,b.itemId]);
          const votes=await client.query('SELECT user_id FROM room_votes WHERE code=$1 AND item_id=$2 AND user_id=ANY($3::text[])',[code,b.itemId,[room.host_id,room.guest_id]]);
          if(votes.rowCount===2){await client.query('UPDATE rooms SET selected_item_id=$1,selected_at=now() WHERE code=$2',[b.itemId,code]);selected=movie;}
        }
        const revision=await client.query('UPDATE rooms SET revision=revision+1 WHERE code=$1 RETURNING revision',[code]);version=Number(revision.rows[0].revision);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
      return json({ok:true,selected,version});
    }
    if (path.startsWith('rooms/') && req.method==='GET') {
      const code=path.split('/')[1];
      const r=await pool.query('SELECT * FROM rooms WHERE code=$1 AND expires>now() AND (host_id=$2 OR guest_id=$2)',[code,s.user_id]);
      const room=r.rows[0]; if (!room) throw new HttpError(404,'Filmaftenen findes ikke længere');
      if (!room.guest_id) return json({waiting:true});
      const otherId=room.host_id===s.user_id?room.guest_id:room.host_id;
      const other=await pool.query('SELECT s.token,p.name FROM sessions s JOIN profiles p ON p.id=s.user_id WHERE user_id=$1 AND expires>now() ORDER BY expires DESC LIMIT 1',[otherId]);
      if (!other.rows[0]) return json({waiting:true});
      const [myMovies,theirMovies,myState,theirState]=await Promise.all([library(s.user_id,s.token),library(otherId,other.rows[0].token).catch(e=>{
        if(e instanceof JellyfinError && e.status===401) throw new HttpError(409,'Din filmmakker skal logge ind igen. Dine egne forbindelsesoplysninger er stadig gyldige.');
        throw e;
      }),state(s.user_id),state(otherId)]);
      // Both users must have access; watched/rated/dismissed titles are excluded separately.
      const key=hash(JSON.stringify([code,s.user_id,myMovies.map(m=>[m.id,m.played,m.favorite]),theirMovies.map(m=>[m.id,m.played,m.favorite]),myState,theirState]));
      const movies=await pairCache.get(key,async()=>pairRank(recommend(myMovies,myState.ratings,0,myState.excluded,myMovies.length),recommend(theirMovies,theirState.ratings,0,theirState.excluded,theirMovies.length)).slice(0,5));
      const voted=await pool.query('SELECT item_id,user_id FROM room_votes WHERE code=$1',[code]);
      const votes=[...new Set<string>(voted.rows.map(v=>v.item_id))].map(itemId=>({itemId,mine:voted.rows.some(v=>v.item_id===itemId&&v.user_id===s.user_id),partner:voted.rows.some(v=>v.item_id===itemId&&v.user_id===otherId)}));
      const selected=room.selected_item_id?myMovies.find(m=>m.id===room.selected_item_id&&theirMovies.some(t=>t.id===m.id))||null:null;
      return json({waiting:false,name:other.rows[0].name,movies,votes,selected,version:Number(room.revision)});
    }
    throw new HttpError(404,'Siden findes ikke');
  } catch(e) {
    if (e instanceof HttpError) return json({error:e.message},e.status);
    if (e instanceof JellyfinError) return json({error:e.status===401?'Log ind igen: Jellyfin-sessionen er udløbet.':'Jellyfin kunne ikke fuldføre forespørgslen.'},e.status===401?401:502);
    // Never log request bodies, passwords, connection strings or Jellyfin tokens.
    console.error('MovieMate request failed:',e instanceof Error?e.name:'unknown');
    return json({error:'Forbindelsen kunne ikke gennemføres. Kontrollér Jellyfin og databasen.'},503);
  } finally {
    const duration=performance.now()-started;
    if(duration>1500)console.warn(`[MovieMate slow] ${req.method} ${req.nextUrl.pathname.split('/')[2]||'api'} ${Math.round(duration)}ms`);
  }
}
export {handle as GET,handle as POST};
