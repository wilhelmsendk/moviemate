import { randomBytes, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { pool, ready } from '@/lib/db';
import { jelly, library, JellyfinError } from '@/lib/jellyfin';
import { recommend, pairRank } from '@/lib/recommend';
import type { Rating } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const failures = new Map<string,{n:number;until:number}>();
class HttpError extends Error { constructor(public status:number,message:string) { super(message); } }
const json = (data:unknown,status=200) => NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function body(req:NextRequest) {
  if (Number(req.headers.get('content-length') || 0)>12000) throw new HttpError(413,'For stor forespørgsel');
  const text = await req.text();
  if (text.length>12000) throw new HttpError(413,'For stor forespørgsel');
  try { return JSON.parse(text); } catch { throw new HttpError(400,'Ugyldige data'); }
}
async function session(req:NextRequest) {
  const sid = req.cookies.get('mm_session')?.value;
  if (!sid) throw new HttpError(401,'Log ind for at fortsætte');
  const result = await pool.query('SELECT s.*,p.name FROM sessions s JOIN profiles p ON p.id=s.user_id WHERE hash=$1 AND expires>now()',[hash(sid)]);
  if (!result.rows[0]) throw new HttpError(401,'Din session er udløbet. Log ind igen.');
  return result.rows[0] as {hash:string;user_id:string;token:string;name:string};
}
async function state(userId:string) {
  const [r,d] = await Promise.all([
    pool.query<Rating>('SELECT item_id,value FROM ratings WHERE user_id=$1',[userId]),
    pool.query('SELECT item_id FROM dismissals WHERE user_id=$1 AND expires>now()',[userId])
  ]);
  return {ratings:r.rows,excluded:d.rows.map(x=>x.item_id)};
}
async function handle(req:NextRequest) {
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
    if (path==='logout' && req.method==='POST') {
      await pool.query('DELETE FROM sessions WHERE hash=$1',[s.hash]);
      const response=json({ok:true}); response.cookies.delete('mm_session');return response;
    }
    if (path==='me' && req.method==='GET') return json({id:s.user_id,name:s.name});
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
      const movie=await (await jelly(`/Users/${s.user_id}/Items/${b.id}`,s.token)).json();
      if (movie.Type!=='Movie') throw new HttpError(400,'Vælg en film');
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
      await jelly(`/Users/${s.user_id}/Items/${id}`,s.token);
      const upstream=await jelly(`/Items/${id}/Images/Primary?maxWidth=600&quality=85`,s.token);
      return new NextResponse(upstream.body,{headers:{'Content-Type':upstream.headers.get('content-type') || 'image/jpeg','Cache-Control':'private, max-age=3600'}});
    }
    if (path==='rooms' && req.method==='POST') {
      const code=randomBytes(6).toString('hex').toUpperCase();
      await pool.query('DELETE FROM rooms WHERE expires<now()');
      await pool.query("INSERT INTO rooms(code,host_id,expires) VALUES($1,$2,now()+interval '2 hours')",[code,s.user_id]);
      return json({code});
    }
    if (path==='rooms/join' && req.method==='POST') {
      const b=await body(req),code=String(b.code||'').toUpperCase().trim();
      const r=await pool.query('UPDATE rooms SET guest_id=$1 WHERE code=$2 AND expires>now() AND host_id<>$1 AND (guest_id IS NULL OR guest_id=$1) RETURNING code',[s.user_id,code]);
      if (!r.rows.length) throw new HttpError(404,'Koden er udløbet, optaget eller din egen');
      return json({code});
    }
    if (path.startsWith('rooms/') && req.method==='GET') {
      const code=path.split('/')[1];
      const r=await pool.query('SELECT * FROM rooms WHERE code=$1 AND expires>now() AND (host_id=$2 OR guest_id=$2)',[code,s.user_id]);
      const room=r.rows[0]; if (!room) throw new HttpError(404,'Filmaftenen findes ikke længere');
      if (!room.guest_id) return json({waiting:true});
      const otherId=room.host_id===s.user_id?room.guest_id:room.host_id;
      const other=await pool.query('SELECT s.token,p.name FROM sessions s JOIN profiles p ON p.id=s.user_id WHERE user_id=$1 AND expires>now() ORDER BY expires DESC LIMIT 1',[otherId]);
      if (!other.rows[0]) return json({waiting:true});
      const [myMovies,theirMovies,myState,theirState]=await Promise.all([library(s.user_id,s.token),library(otherId,other.rows[0].token),state(s.user_id),state(otherId)]);
      // Both users must have access; watched/rated/dismissed titles are excluded separately.
      const a=recommend(myMovies,myState.ratings,0,myState.excluded,myMovies.length);
      const b=recommend(theirMovies,theirState.ratings,0,theirState.excluded,theirMovies.length);
      return json({waiting:false,name:other.rows[0].name,movies:pairRank(a,b).slice(0,5)});
    }
    throw new HttpError(404,'Siden findes ikke');
  } catch(e) {
    if (e instanceof HttpError) return json({error:e.message},e.status);
    if (e instanceof JellyfinError) return json({error:e.status===401?'Log ind igen: Jellyfin-sessionen er udløbet.':'Jellyfin kunne ikke fuldføre forespørgslen.'},e.status===401?401:502);
    // Never log request bodies, passwords, connection strings or Jellyfin tokens.
    console.error('MovieMate request failed:',e instanceof Error?e.name:'unknown');
    return json({error:'Forbindelsen kunne ikke gennemføres. Kontrollér Jellyfin og databasen.'},503);
  }
}
export {handle as GET,handle as POST};
