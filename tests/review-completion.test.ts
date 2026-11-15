import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewComplete} from '../lib/reviews';
test('completion accepts sampled progress or a fresh Jellyfin watched transition, not an old watched flag',()=>{
 assert.equal(reviewComplete(.9,null,false),true);
 assert.equal(reviewComplete(0,false,true),true);
 assert.equal(reviewComplete(.1,false,false),false);
 assert.equal(reviewComplete(0,true,true),false);
 assert.equal(reviewComplete(0,null,true),false);
});
