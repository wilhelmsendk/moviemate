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
