import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importRows,parseCsv,previewImport} from '../lib/import-history';
import type {Movie} from '../lib/types';
const movie=(id:string,title:string,year=2000,imdb?:string):Movie=>({id,title,year,providerIds:imdb?{Imdb:imdb}:{},minutes:100,genres:[],people:[],overview:'',played:false,favorite:false,audio:[]});
test('CSV supports BOM, escaped quotes, CRLF, commas and embedded newlines',()=>{
 assert.deepEqual(parseCsv('\uFEFFName,Rating\r\n"A, B",4\r\n"A ""quote""\nand newline",5'),[['Name','Rating'],['A, B','4'],['A "quote"\nand newline','5']]);
 assert.throws(()=>parseCsv('Name\n"Unclosed'));assert.throws(()=>importRows('foo,bar\na,b'));
});
test('IMDb and Letterboxd ratings map to explicit taste, Netflix history never means liked',()=>{
 const imdb=importRows('Const,Your Rating,Title,Year\ntt1,10,One,2000\ntt2,7,Two,2001\ntt3,2,Three,2002');assert.deepEqual(imdb.map(r=>r.value),[3,1,-2]);
 assert.equal(importRows('Date,Name,Year,Letterboxd URI,Rating\n2020,One,2000,https://letterboxd.com/film/one,4.5')[0].value,3);
 assert.equal(importRows('Date,Name,Year,Letterboxd URI\n2020,One,2000,https://letterboxd.com/film/one')[0].value,null);
 assert.equal(importRows('Title,Date\nOne,01/01/2020')[0].value,null);
 assert.throws(()=>importRows('Const,Your Rating,Title\ntt1,11,One'));
});
test('matching uses provider IDs, then exact normalized title/year; ambiguity and missing titles are skipped',()=>{
 const library=[movie('a','Local title',2000,'tt1'),movie('b','Remake',2000),movie('c','Remake',2020)];
 const rows=previewImport([{title:'Other title',year:2000,imdb:'tt1',value:3,watched:true},{title:'Remake',year:0,value:null,watched:true},{title:'Remake',year:2020,value:1,watched:true},{title:'Missing',year:0,value:null,watched:true}],library);
 assert.equal(rows[0].itemId,'a');assert.equal(rows[1].issue,'ambiguous');assert.equal(rows[2].itemId,'c');assert.equal(rows[3].issue,'unmatched');
 assert.equal(previewImport([importRows('Title,Date\nRemake,today\nRemake,today')[0],importRows('Title,Date\nRemake,today')[0]],library).length,1);
});
