// Uses an isolated PostgreSQL database supplied by TEST_DATABASE_URL. Never use production data.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to an isolated test database');
const film=(Id,Name)=>({Id,Name,Type:'Movie',ProductionYear:2020,RunTimeTicks:60000000000,Genres:['Comedy'],People:[],UserData:{Played:false},ImageTags:{}});
const catalogs={alice:[film('shared','Shared'),film('alice-only','Alice private'),film('alice-liked','Liked')],bob:[film('shared','Shared'),film('bob-only','Bob private')],charlie:[]};
let destination;
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
 if(url.pathname==='/Items'){libraryReads.set(user,(libraryReads.get(user)||0)+1);return res.end(JSON.stringify({Items:catalogs[user],TotalRecordCount:catalogs[user].length}));}
 const id=url.pathname.split('/').at(-1),item=catalogs[user].find(m=>m.Id===id);
 if(!item){res.writeHead(404);return res.end('{}');}
 return res.end(JSON.stringify(item));
});
await new Promise(r=>fake.listen(0,'127.0.0.1',r));
destination=`http://127.0.0.1:${fake.address().port}`;
const port=process.env.TEST_PORT||'33219',base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',port],{env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,JELLYFIN_URL:destination},stdio:['ignore','pipe','pipe']});
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
 assert.equal(devices.size,3,'Each user must authenticate as an independent Jellyfin device');
 assert.equal((await (await call('library',alice)).json()).movies.length,3);
 assert.equal((await call('rate',alice,{id:'alice-liked',value:3})).status,200);
 assert.equal((await call('rate',alice,{id:'alice-liked',value:999})).status,400);
 assert.notEqual((await call('rate',bob,{id:'alice-only',value:3})).status,200);
 const own=await (await call('library',alice)).json();assert.equal(own.movies.find(m=>m.id==='alice-liked').rated,3);
 const other=await (await call('library',bob)).json();assert.ok(other.movies.every(m=>m.rated===undefined));
 const code=(await (await call('rooms',alice,{})).json()).code;
 assert.equal((await call(`rooms/${code}`,charlie)).status,404);
 assert.equal((await call('rooms/join',bob,{code})).status,200);
 assert.equal((await call('rooms/join',charlie,{code})).status,404);
 const pair=await (await call(`rooms/${code}`,alice)).json();assert.deepEqual(pair.movies.map(m=>m.id),['shared']);
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
 console.log('PASS: opt-in sharing, recipient access, private inbox, film details, per-session metadata reuse, independent Jellyfin sessions, login, CSRF, authorization, persistent ratings, isolation, room consent, intersection, snooze, undo and logout');
}catch(e){console.error(output);throw e;}finally{child.kill('SIGTERM');await new Promise(r=>fake.close(r));}
