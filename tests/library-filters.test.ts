import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterMovies,isDanishProduction,genreKey} from '../lib/library-filters';
import type {Movie} from '../lib/types';
const movie=(id:string,title:string,genres:string[],year:number,minutes:number,played=false):Movie=>({id,title,genres,year,minutes,played,people:[],audio:[],overview:'',favorite:false});
const movies=[movie('a','Zulu',['Action','Romantik'],2000,100),movie('b','Alpha',['Romance'],2020,90,true),movie('c','Beta',['Action'],0,0)];
const defaults={search:'',genre:'',seen:'',sort:'title'};
test('genre aliases combine with search, watched status and a Danish facet without mutating movies',()=>{
 assert.equal(genreKey('Romantik'),'romance');
 assert.deepEqual(filterMovies(movies,{...defaults,genre:'romance'}).map(m=>m.id),['b','a']);
 assert.deepEqual(filterMovies(movies,{...defaults,genre:'action',search:' ZU ',seen:'unwatched',facetIds:new Set(['a'])}).map(m=>m.id),['a']);
 assert.deepEqual(filterMovies(movies,{...defaults,facetIds:new Set()}).map(m=>m.id),[]);
 assert.deepEqual(movies.map(m=>m.id),['a','b','c']);
});
test('sorts titles, years and runtimes with unknown metadata last and respects ratings-only',()=>{
 assert.deepEqual(filterMovies(movies,{...defaults,sort:'newest'}).map(m=>m.id),['b','a','c']);
 assert.deepEqual(filterMovies(movies,{...defaults,sort:'oldest'}).map(m=>m.id),['a','b','c']);
 assert.deepEqual(filterMovies(movies,{...defaults,sort:'shortest'}).map(m=>m.id),['b','a','c']);
 assert.deepEqual(filterMovies(movies,{...defaults,sort:'title-desc'}).map(m=>m.id),['a','c','b']);
 assert.deepEqual(filterMovies([{...movies[0],rated:-2},movies[1]],{...defaults,ratingsOnly:true}).map(m=>m.id),['a']);
});
test('Danish production is determined by country metadata, not Danish dubbing or a title',()=>{
 assert.equal(isDanishProduction(['Denmark']),true);assert.equal(isDanishProduction(['USA','Danmark']),true);
 assert.equal(isDanishProduction(['United States']),false);assert.equal(isDanishProduction(),false);
});
