import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAsyncCache} from '../lib/cache';
test('coalesces concurrent reads, reuses recent data, and refreshes after TTL',async()=>{
 let now=0,calls=0;const cache=createAsyncCache<number>(30,2,()=>now);
 const loader=async()=>{calls++;return calls;};
 assert.deepEqual(await Promise.all([cache.get('alice',loader),cache.get('alice',loader)]),[1,1]);
 assert.equal(await cache.get('alice',loader),1);assert.equal(calls,1);
 now=31;assert.equal(await cache.get('alice',loader),2);
});
test('never shares entries between sessions or caches failures',async()=>{
 const cache=createAsyncCache<string>(1000);
 assert.equal(await cache.get('alice',async()=>'Alice private'),'Alice private');
 assert.equal(await cache.get('bob',async()=>'Bob private'),'Bob private');
 await assert.rejects(cache.get('bad',async()=>{throw Error('offline');}));
 assert.equal(await cache.get('bad',async()=>'recovered'),'recovered');
});
test('bounds memory and evicts old sessions',async()=>{
 const cache=createAsyncCache<number>(1000,1);let calls=0;
 await cache.get('a',async()=>++calls);await cache.get('b',async()=>++calls);
 assert.equal(await cache.get('a',async()=>++calls),3);
});
