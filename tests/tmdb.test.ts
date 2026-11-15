import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapTmdb} from '../lib/tmdb';
test('TMDB metadata becomes name-based features without inventing a Jellyfin playback item',()=>{
 const m=mapTmdb({id:42,title:'Outside',release_date:'2001-01-01',runtime:100,external_ids:{imdb_id:'tt42'},genres:[{name:'Comedy'}],credits:{crew:[{job:'Director',name:'Jane Director'}],cast:[{name:'An Actor'}]}});
 assert.equal(m.id,'external:tmdb:42');assert.equal(m.providerIds?.Imdb,'tt42');assert.equal(m.people[0].id,'');assert.equal(m.year,2001);assert.equal(m.played,true);
});
test('online matching uses exact IMDb or unique title/year, while title-only and ambiguous searches stay manual',async()=>{
 const {findTmdb}=await import('../lib/tmdb');const prior=globalThis.fetch,oldToken=process.env.TMDB_API_TOKEN;
 process.env.TMDB_API_TOKEN='test-only-token';let results:any={results:[{id:42,title:'Outside',release_date:'2001-01-01'}]};
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input));assert.equal(url.origin,'https://api.themoviedb.org');assert.equal(url.searchParams.has('api_key'),false);assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-only-token');return new Response(JSON.stringify(results));}) as typeof fetch;
 const base={title:'Outside',year:2001,itemId:null,matchedTitle:null,value:3,watched:true,issue:'unmatched' as const};
 try{assert.equal((await findTmdb(base)).exact,42);assert.equal((await findTmdb({...base,year:0})).exact,null);results={results:[{id:42,title:'Outside',release_date:'2001-01-01'},{id:43,title:'Outside',release_date:'2001-05-01'}]};assert.equal((await findTmdb(base)).exact,null);results={movie_results:[{id:42,title:'Translated title',release_date:'2001-01-01'}]};assert.equal((await findTmdb({...base,imdb:'tt42'})).exact,42);}finally{globalThis.fetch=prior;if(oldToken===undefined)delete process.env.TMDB_API_TOKEN;else process.env.TMDB_API_TOKEN=oldToken;}
});
