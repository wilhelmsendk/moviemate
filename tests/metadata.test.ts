import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapMovie} from '../lib/jellyfin';
test('detail metadata keeps audio and people, but discards unsafe trailer URLs',()=>{
 const movie=mapMovie({Id:'a',Name:'A',People:[{Id:'p',Name:'Director',Type:'Director'}],MediaStreams:[{Type:'Audio',Language:'dan'},{Type:'Subtitle',Language:'eng'}],RemoteTrailers:[{Name:'Trailer',Url:'https://www.youtube.com/watch?v=a'},{Url:'javascript:alert(1)'},{Url:'https://user:secret@example.com/video'}]});
 assert.deepEqual(movie.audio,['dan']);assert.equal(movie.people[0].name,'Director');assert.equal(movie.trailers?.length,1);
 assert.equal(movie.trailers?.[0].url,'https://www.youtube.com/watch?v=a');
});
