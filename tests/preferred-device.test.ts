import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deviceIdentity,preferredSession,deviceLabel} from '../lib/playback';
test('remembered TV survives a new session ID and does not switch to Chrome when offline',()=>{
 const tv={Id:'old-session',DeviceId:'stable-tv',DeviceName:'Samsung TV',Client:'Moonfin',UserId:'plexi',UserName:'plexi'};
 const preference=deviceIdentity(tv);assert.equal(preferredSession([{...tv,Id:'new-session'}],preference),'new-session');
 assert.equal(preferredSession([{Id:'chrome',DeviceId:'browser',DeviceName:'Chrome'}],preference),null);
 assert.equal(deviceLabel(tv),'Samsung TV · Moonfin · plexi');
});
test('devices without a device ID are only restored when their identity is unambiguous',()=>{
 const tv={Id:'one',DeviceName:'TV',Client:'Moonfin',UserId:'a'},preference=deviceIdentity(tv);
 assert.equal(preferredSession([{...tv,Id:'two'}],preference),'two');assert.equal(preferredSession([tv,{...tv,Id:'two'}],preference),null);
 assert.equal(preferredSession([{...tv,UserId:'b'}],preference),null);
});
