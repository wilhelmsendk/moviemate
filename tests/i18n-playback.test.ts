import {test} from 'node:test';
import assert from 'node:assert/strict';
import {translate,resolveLanguage} from '../lib/i18n';
import {controllable,playbackStatus} from '../lib/playback';
test('language selection translates UI and explanations while preserving film titles',()=>{
 assert.equal(resolveLanguage('en-GB'),'en');assert.equal(resolveLanguage('da-DK'),'da');
 assert.equal(translate('Velkommen ind','en'),'Welcome in');
 assert.equal(translate('Fordi du kunne lide Other Guys','en'),'Because you liked Other Guys');
 assert.equal(translate('Other Guys','en'),'Other Guys');
 assert.equal(translate('Afspilles nu','da'),'Afspilles nu');
});
test('playback is confirmed only by matching Jellyfin now-playing state',()=>{
 const tv={Id:'tv',Client:'Moonfin',SupportsRemoteControl:true};
 assert.deepEqual(controllable([tv,{Id:'other',SupportsRemoteControl:false}]),[tv]);
 assert.equal(playbackStatus([tv],'film').status,'idle');
 assert.equal(playbackStatus([{...tv,NowPlayingItem:{Id:'other'}}],'film').status,'idle');
 assert.equal(playbackStatus([{...tv,NowPlayingItem:{Id:'film'}}],'film').status,'playing');
 assert.equal(playbackStatus([{...tv,NowPlayingItem:{Id:'film'},PlayState:{IsPaused:true}}],'film').status,'paused');
});
