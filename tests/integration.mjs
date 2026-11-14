// Uses an isolated PostgreSQL database supplied by TEST_DATABASE_URL. Never use production data.
import {Client} from 'pg';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to an isolated test database');
const film=(Id,Name)=>({Id,Name,Type:'Movie',ProductionYear:2020,RunTimeTicks:60000000000,Genres:['Comedy'],People:[],UserData:{Played:false},ImageTags:{}});
const catalogs={alice:[film('shared','Shared'),film('alice-only','Alice private'),film('alice-liked','Liked')],bob:[film('shared','Shared'),film('bob-only','Bob private')],charlie:[]};
let destination,playing=false,paused=false,playCommands=0;
const devices=new Map(),validTokens=new Set(),libraryReads=new Map();
const fake=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fake');let user=(req.headers.authorization||'').match(/Token="([^"]+)"/)?.[1];
 if(url.pathname==='/Users/AuthenticateByName'){
  let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw);
  if(!catalogs[b.Username]||b.Pw!=='test-password'){res.writeHead(401);return res.end('{}');}
  const device=(req.headers.authorization||'').match(/DeviceId="([^"]+)"/)?.[1];
  assert.ok(device,'Authentication must identify a device');
  if(devices.has(device))validTokens.delete(devices.get(device));
  devices.set(device,b.Username);validTokens.add(b.Username);
  return res.end(JSON.stringify({AccessToken:b.Username,User:{Id:b.Username,Name:b.Username}}));
 }
 if(!catalogs[user]||!validTokens.has(user)){res.writeHead(401);return res.end('{}');}
 if(url.pathname==='/Sessions'){
  assert.equal(url.searchParams.get('controllableByUserId'),user);
  return res.end(JSON.stringify([{Id:`tv-${user}`,DeviceName:`${user} TV`,Client:'Moonfin',SupportsRemoteControl:true,NowPlayingItem:playing&&user==='alice'?{Id:'shared'}:null,PlayState:{IsPaused:paused}}]));
 }
 if(url.pathname.startsWith('/Sessions/')&&req.method==='POST'){
  assert.equal(url.pathname,`/Sessions/tv-${user}/Playing`);assert.equal(url.searchParams.get('playCommand'),'PlayNow');assert.equal(url.searchParams.get('itemIds'),'shared');playCommands++;res.writeHead(204);return res.end();
 }
 if(url.pathname==='/Items'){libraryReads.set(user,(libraryReads.get(user)||0)+1);return res.end(JSON.stringify({Items:catalogs[user],TotalRecordCount:catalogs[user].length}));}
 const id=url.pathname.split('/').at(-1),item=catalogs[user].find(m=>m.Id===id);
 if(!item){res.writeHead(404);return res.end('{}');}
 return res.end(JSON.stringify(item));
});
await new Promise(r=>fake.listen(0,'127.0.0.1',r));
destination=`http://127.0.0.1:${fake.address().port}`;
const port=process.env.TEST_PORT||'33219',base=`http://127.0.0.1:${port}`;
let child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',port],{env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,JELLYFIN_URL:destination},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
async function call(path,cookie,body,origin=base){return fetch(`${base}/api/${path}`,{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body!==undefined?{'Content-Type':'application/json',Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function login(username){const r=await call('login',null,{username,password:'test-password'});assert.equal(r.status,200,await r.clone().text());assert.ok(!JSON.stringify(await r.json()).includes('test-password'));return r.headers.get('set-cookie').split(';')[0];}
try{
 let up=false;for(let i=0;i<100;i++){try{if((await call('health')).ok){up=true;break;}}catch{}await delay(100);}
 assert.ok(up,output);
 assert.equal((await call('me')).status,401);
 assert.equal((await call('login',null,{username:'alice',password:'test-password'},'http://evil.invalid')).status,403);
 assert.equal((await call('login',null,{username:'alice',password:'wrong'})).status,401);
 const alice=await login('alice'),bob=await login('bob'),charlie=await login('charlie');
 assert.equal((await call('preferences',alice,{language:'en'})).status,200);
 assert.equal((await(await call('me',alice)).json()).language,'en');
 assert.equal((await call('preferences',alice,{language:'de'})).status,400);
 assert.equal((await call('playback/start',alice,{itemId:'shared',sessionId:'tv-bob'})).status,403);
 assert.equal(playCommands,0);
 assert.equal((await call('playback/start',alice,{itemId:'shared',sessionId:'tv-alice'})).status,200);
 assert.equal((await(await call('playback?itemId=shared',alice)).json()).status,'idle','Accepted commands must not imply playback');
 playing=true;
 assert.equal((await(await call('playback?itemId=shared',alice)).json()).status,'playing');
 paused=true;assert.equal((await(await call('playback?itemId=shared',alice)).json()).status,'paused');paused=false;
 assert.equal((await call('playback?itemId=alice-only',bob)).status,403);
 assert.equal(devices.size,3,'Each user must authenticate as an independent Jellyfin device');
 assert.equal((await (await call('library',alice)).json()).movies.length,3);
 assert.equal((await call('rate',alice,{id:'alice-liked',value:3})).status,200);
 assert.equal((await call('rate',alice,{id:'alice-liked',value:999})).status,400);
 assert.notEqual((await call('rate',bob,{id:'alice-only',value:3})).status,200);
 const own=await (await call('library',alice)).json();assert.equal(own.movies.find(m=>m.id==='alice-liked').rated,3);
 const other=await (await call('library',bob)).json();assert.ok(other.movies.every(m=>m.rated===undefined));
 const exit=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exit;
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',port],{env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,JELLYFIN_URL:destination},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 let restarted=false;for(let i=0;i<100;i++){try{if((await call('health')).ok){restarted=true;break;}}catch{}await delay(100);}
 assert.ok(restarted,output);
 assert.equal((await(await call('library',alice)).json()).movies.length,3);
 assert.equal(libraryReads.get('alice'),1,'Restart must reuse persisted library rather than fetch Jellyfin');
 const code=(await (await call('rooms',alice,{})).json()).code;
 assert.equal((await call(`rooms/${code}`,charlie)).status,404);
 assert.equal((await call('rooms/join',bob,{code})).status,200);
 assert.equal((await call('rooms/join',charlie,{code})).status,404);
 const pair=await (await call(`rooms/${code}`,alice)).json();assert.deepEqual(pair.movies.map(m=>m.id),['shared']);
 assert.equal((await call(`rooms/${code}/vote`,charlie,{itemId:'shared',approved:true})).status,404);
 assert.equal((await call(`rooms/${code}/vote`,alice,{itemId:'alice-only',approved:true})).status,403);
 assert.equal((await call(`rooms/${code}/vote`,alice,{itemId:'shared',approved:true})).status,200);
 let view=await(await call(`rooms/${code}`,bob)).json();assert.equal(view.selected,null);assert.deepEqual(view.votes,[{itemId:'shared',mine:false,partner:true}]);
 const agreed=await call(`rooms/${code}/vote`,bob,{itemId:'shared',approved:true});assert.equal(agreed.status,200);assert.equal((await agreed.json()).selected.id,'shared');
 for(const cookie of [alice,bob]){const tonight=await(await call('tonight',cookie)).json();assert.equal(tonight.choice.movie.id,'shared');assert.equal(tonight.choice.code,code);}
 assert.equal((await(await call('tonight',charlie)).json()).choice,null);
 assert.equal((await(await call(`playback?itemId=shared&code=${code}`,bob)).json()).status,'playing','Partners can see confirmed playback of their chosen film');
 assert.equal((await(await call('playback?itemId=shared&code=invalid',bob)).json()).status,'idle');
 playing=false;


 view=await(await call(`rooms/${code}`,alice)).json();assert.equal(view.selected.id,'shared');
 assert.equal((await call(`rooms/${code}/vote`,alice,{itemId:'shared',approved:false})).status,409);
 assert.equal((await call(`rooms/${code}/reset`,charlie,{})).status,404);
 assert.equal((await call(`rooms/${code}/reset`,bob,{})).status,200);
 view=await(await call(`rooms/${code}`,alice)).json();assert.equal(view.selected,null);assert.deepEqual(view.votes,[]);
 assert.equal((await(await call('tonight',alice)).json()).choice,null,'Reset must clear the home card');
 const simultaneous=await Promise.all([call(`rooms/${code}/vote`,alice,{itemId:'shared',approved:true}),call(`rooms/${code}/vote`,bob,{itemId:'shared',approved:true})]);
 assert.ok(simultaneous.every(r=>r.status===200),'Concurrent approvals must serialize safely');
 const mutual=await(await call(`rooms/${code}`,bob)).json();assert.equal(mutual.selected.id,'shared');assert.ok(mutual.version>view.version);
 const homeChoice=(await(await call('tonight',alice)).json()).choice;
 assert.equal(homeChoice.movie.id,'shared');
 const dbClient=new Client({connectionString:process.env.TEST_DATABASE_URL});await dbClient.connect();
 try{await dbClient.query("UPDATE rooms SET expires=now()-interval '1 hour' WHERE code=$1",[code]);}finally{await dbClient.end();}
 assert.equal((await(await call('tonight',bob)).json()).choice.movie.id,'shared','Selection must outlive the joining window');
 assert.equal((await call('tonight/end',charlie,{code,itemId:'shared',version:homeChoice.version})).status,409);
 assert.equal((await call('tonight/end',alice,{code,itemId:'shared',version:homeChoice.version-1})).status,409);
 assert.equal((await call('tonight/end',alice,{code,itemId:'shared',version:homeChoice.version})).status,200);
 for(const cookie of [alice,bob])assert.equal((await(await call('tonight',cookie)).json()).choice,null);

 assert.equal((await call('dismiss',alice,{id:'shared'})).status,200);
 assert.ok(!(await (await call('recommendations',alice)).json()).movies.some(m=>m.id==='shared'));
 assert.equal((await call('rate',alice,{id:'alice-liked',value:null})).status,200);
 assert.equal(libraryReads.get('alice'),1,'Ratings and recommendations must reuse Alice metadata');
 assert.equal(libraryReads.get('bob'),1,'Private library cache must be scoped to Bob');
 assert.deepEqual((await(await call('recipients',alice)).json()).users,[],'Receiving is opt-in');
 assert.equal((await call('preferences',bob,{receiveRecommendations:true})).status,200);
 assert.equal((await(await call('recipients',alice)).json()).users[0].id,'bob');
 assert.equal((await call('recommendations/send',alice,{itemId:'shared',recipientId:'alice',note:''})).status,400);
 assert.equal((await call('recommendations/send',alice,{itemId:'alice-only',recipientId:'bob',note:''})).status,403);
 assert.equal((await call('recommendations/send',alice,{itemId:'shared',recipientId:'charlie',note:''})).status,409);
 assert.equal((await call('recommendations/send',alice,{itemId:'shared',recipientId:'bob',note:'This is for you'})).status,200);
 assert.equal((await call('recommendations/send',alice,{itemId:'shared',recipientId:'bob',note:''})).status,409);
 const inbox=(await(await call('inbox',bob)).json()).messages;
 assert.equal(inbox.length,1);assert.equal(inbox[0].movie.id,'shared');assert.equal(inbox[0].sender,'alice');assert.equal(inbox[0].note,'This is for you');
 assert.equal((await(await call('inbox',alice)).json()).messages.length,0);
 await call('inbox/read',alice,{id:inbox[0].id});
 assert.equal((await(await call('inbox',bob)).json()).messages[0].read_at,null,'Another user cannot mark a private message read');
 await call('inbox/read',bob,{id:inbox[0].id});
 assert.ok((await(await call('inbox',bob)).json()).messages[0].read_at);
 assert.equal((await(await call('movie/shared',bob)).json()).movie.title,'Shared');
 assert.notEqual((await call('movie/alice-only',bob)).status,200);
 assert.equal((await call('logout',alice,{})).status,200);
 assert.equal((await call('me',alice)).status,401);
 console.log('PASS: selected home film, expired-room finish, stale/unauthorized finish rejection, persistent library across restart, mutual film selection and reset, opt-in sharing, recipient access, private inbox, film details, per-session metadata reuse, independent Jellyfin sessions, login, CSRF, authorization, persistent ratings, isolation, room consent, intersection, snooze, undo and logout');
}catch(e){console.error(output);throw e;}finally{child.kill('SIGTERM');await new Promise(r=>fake.close(r));}
