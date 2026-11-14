import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotCache,type Snapshot} from '../lib/snapshot-cache';
test('persisted film data survives a new cache instance and stale reads do not wait for Jellyfin',async()=>{
 let now=100,loads=0;const saved=new Map<string,Snapshot<number>>([['alice',{value:1,updated:100}]]);
 let finish:(n:number)=>void=()=>{};
 const options={clock:()=>now,softTtl:30,hardTtl:100,read:async(key:string)=>saved.get(key)||null,write:async(key:string,s:Snapshot<number>)=>{saved.set(key,s);},load:async()=>{loads++;return new Promise<number>(resolve=>{finish=resolve;});}};
 const a=createSnapshotCache<number,string>(options);
 assert.equal(await a.get('alice','token'),1);assert.equal(loads,0);
 now=140;assert.equal(await a.get('alice','token'),1);assert.equal(loads,1);
 assert.equal(await a.get('alice','token'),1);assert.equal(loads,1);
 finish(2);await a.refresh('alice','token');
 const restarted=createSnapshotCache<number,string>(options);
 assert.equal(await restarted.get('alice','new-token'),2);assert.equal(loads,1);
});
test('missing and hard-expired snapshots wait for refresh, and users never share movies',async()=>{
 let now=1000;const saved=new Map<string,Snapshot<string>>([['alice',{value:'old-private',updated:0}]]);
 const cache=createSnapshotCache<string,string>({clock:()=>now,softTtl:10,hardTtl:100,read:async k=>saved.get(k)||null,write:async(k,v)=>{saved.set(k,v);},load:async(k)=>`${k}-private`});
 assert.equal(await cache.get('alice','token'),'alice-private');
 assert.equal(await cache.get('bob','token'),'bob-private');
 now=2000;assert.equal(await cache.get('alice','token'),'alice-private');
});
test('background refresh failures retain a recent snapshot without retrying every poll',async()=>{
 let now=100,loads=0;
 const cache=createSnapshotCache<number,string>({clock:()=>now,softTtl:10,hardTtl:100000,read:async()=>({value:3,updated:0}),write:async()=>{},load:async()=>{loads++;throw Error('offline');}});
 assert.equal(await cache.get('alice','token'),3);
 await new Promise(r=>setImmediate(r));now=200;
 assert.equal(await cache.get('alice','token'),3);assert.equal(loads,1);
});
test('library mode serves a day-old persisted snapshot immediately while a slow refresh is pending',async()=>{
 let loads=0,finish!:(n:number)=>void;
 const cache=createSnapshotCache<number,string>({hardTtl:Infinity,read:async()=>({value:42,updated:Date.now()-86400000}),write:async()=>{},load:async()=>{loads++;return new Promise<number>(resolve=>{finish=resolve;});}});
 assert.equal(await Promise.race([cache.get('alice','token'),new Promise(resolve=>setTimeout(()=>resolve('blocked'),100))]),42);
 assert.equal(loads,1);assert.equal(await cache.get('alice','token'),42);assert.equal(loads,1);
 finish(43);await cache.refresh('alice','token');assert.equal(await cache.get('alice','token'),43);
});
