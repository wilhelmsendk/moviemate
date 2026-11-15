import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommend,pairRank} from '../lib/recommend';
import type {Movie} from '../lib/types';
const movie=(id:string,genre:string,extra:Partial<Movie>={}):Movie=>({id,title:id,year:2020,minutes:100,genres:[genre],people:[],overview:'',played:false,favorite:false,audio:[],...extra});
test('ratings influence ranking; watched, rated and snoozed films are excluded',()=>{
 const library=[movie('liked','Comedy'),movie('comedy','Comedy'),movie('horror','Horror'),movie('seen','Comedy',{played:true}),movie('later','Comedy')];
 const r=recommend(library,[{item_id:'liked',value:3}],0,['later']);
 assert.equal(r[0].id,'comedy');assert.deepEqual(new Set(r.map(x=>x.id)),new Set(['comedy','horror']));
});
test('runtime is a hard constraint, unknown lengths do not pass a time limit',()=>{
 assert.deepEqual(recommend([movie('short','Comedy',{minutes:80}),movie('long','Comedy',{minutes:150}),movie('unknown','Comedy',{minutes:0})],[],90).map(x=>x.id),['short']);
});
test('a dislike never becomes a positive anchor even if Jellyfin favorite is set',()=>{
 const r=recommend([movie('bad','Horror',{favorite:true}),movie('horror','Horror'),movie('comedy','Comedy')],[{item_id:'bad',value:-2}]);
 assert.equal(r[0].id,'comedy');assert.ok(r.every(x=>!x.reason.includes('Fordi du kunne lide')));
});
test('empty history and empty library are safe',()=>{
 assert.deepEqual(recommend([],[]),[]); assert.equal(recommend([movie('a','Comedy')],[]).length,1);
});
test('pair recommendations use intersection only, preserving access and seen constraints',()=>{
 const a=recommend([movie('private','Comedy'),movie('shared','Comedy')],[]);
 const b=recommend([movie('shared','Comedy'),movie('other','Comedy')],[]);
 assert.deepEqual(pairRank(a,b).map(x=>x.id),['shared']);assert.deepEqual(pairRank(a,[]),[]);
});
test('pair candidates beyond the solo top twelve remain eligible',()=>{
 const movies=Array.from({length:20},(_,i)=>movie(`film${i}`,'Comedy'));
 assert.equal(recommend(movies,[],0,[],movies.length).length,20);
});
test('history without ratings is a weak positive signal, not claimed as an explicit like',()=>{
 const r=recommend([movie('seen','Comedy',{played:true}),movie('comedy','Comedy'),movie('horror','Horror')],[]);
 assert.equal(r[0].id,'comedy');assert.match(r[0].reason,/historik/);
});
test('two full-sized libraries can be ranked together without blocking the server',()=>{
 const library=Array.from({length:500},(_,i)=>movie(`film-${i}`,['Comedy','Drama','Action','Adventure'][i%4],{
   people:[{id:`director-${i%20}`,name:'Director',type:'Director'},...Array.from({length:5},(_,j)=>({id:`actor-${(i+j)%70}`,name:'Actor',type:'Actor'}))],
   played:i<100
 }));
 const ratings=library.slice(0,30).map((m,i)=>({item_id:m.id,value:i%4===0?-2:3}));
 const started=performance.now();
 const a=recommend(library,ratings,0,[],library.length),b=recommend(library,ratings,0,[],library.length);
 const result=pairRank(a,b);
 assert.equal(result.length,400);
 assert.ok(performance.now()-started<2500,'Pair ranking blocked for more than 2.5 seconds');
});
test('external likes and dislikes influence local picks, match people by name, and never become playback candidates',()=>{
 const ext=movie('external:imdb:tt999','Science Fiction',{title:'Arrival',year:2016,people:[{id:'tmdb-person',name:'Denis Villeneuve',type:'Director'}]});
 const library=[movie('blade','Science Fiction',{people:[{id:'jellyfin-person',name:'Denis Villeneuve',type:'Director'}]}),movie('other','Romance')];
 const picks=recommend(library,[],0,[],12,[{movie:ext,value:3,watched:true}]);
 assert.equal(picks[0].id,'blade');assert.equal(picks[0].reason,'Fordi du kunne lide Arrival');assert.ok(picks.every(p=>library.some(m=>m.id===p.id)));
 const disliked=recommend(library,[],0,[],12,[{movie:ext,value:-2,watched:true}]);assert.equal(disliked[0].id,'other');
});
test('external watch history stays a weak signal and excludes the same film if it later joins the library',()=>{
 const external=movie('external:imdb:tt123','Comedy',{title:'Known',providerIds:{Imdb:'tt123'}});
 const local=movie('known','Comedy',{title:'Known',providerIds:{Imdb:'tt123'}});
 const picks=recommend([local,movie('next','Comedy')],[],0,[],12,[{movie:external,value:null,watched:true}]);
 assert.deepEqual(picks.map(p=>p.id),['next']);assert.match(picks[0].reason,/Med afsæt i din historik/);
 const explicit=recommend([local,movie('next','Comedy'),movie('horror','Horror')],[{item_id:'known',value:-2}],0,[],12,[{movie:external,value:3,watched:true}]);assert.equal(explicit[0].id,'horror');
});
test('500 external tastes and 500 library films remain practical without an external API during ranking',()=>{
 const library=Array.from({length:500},(_,i)=>movie(`local-${i}`,i%2?'Comedy':'Drama'));
 const taste=Array.from({length:500},(_,i)=>({movie:movie(`external-${i}`,i%3?'Comedy':'Drama'),value:i%4===0?-2:3,watched:true}));
 const started=performance.now();assert.equal(recommend(library,[],0,[],12,taste).length,12);assert.ok(performance.now()-started<2000);
});
