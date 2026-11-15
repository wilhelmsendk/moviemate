import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
const {JSDOM}=require('jsdom');
test('external metadata requires opt-in, ambiguous title selection and a final commit of server-owned row keys',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
 for(const name of ['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'])Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name],configurable:true,writable:true});
 const prior=globalThis.fetch;const resolveCalls:any[]=[],commits:any[]=[];
 const row={rowKey:'row:0',title:'Outside',year:0,itemId:null,matchedTitle:null,value:3,watched:true,issue:'unmatched'};
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);if(url.endsWith('/status'))return new Response('{"tmdbConfigured":true,"externalCount":0}');
  if(url.endsWith('/preview'))return new Response(JSON.stringify({previewId:'private-preview',tmdbConfigured:true,rows:[row]}));
  const b=JSON.parse(init!.body as string);
  if(url.endsWith('/resolve')){resolveCalls.push(b);return new Response(JSON.stringify({row:b.selectedId?{...row,externalId:'imdb:tt42',metadata:{title:'Outside',year:2000,genres:['Comedy'],providerIds:{Tmdb:'42'}},candidates:[{id:42,title:'Outside',year:2000}]}:{...row,candidates:[{id:42,title:'Outside',year:2000}]}}));}
  commits.push(b);return new Response('{"ok":true,"externalSaved":1}');
 }) as typeof fetch;
 const {render,fireEvent,cleanup,act}=await import('@testing-library/react');const {default:HistoryImport}=await import('../components/HistoryImport');
 try{const screen=render(React.createElement(HistoryImport,{onImported:()=>{}}));fireEvent.change(screen.getByLabelText('Vælg CSV-fil'),{target:{files:[{size:100,text:async()=>'Title,Date\nOutside,today'}]}});await screen.findByText('Outside');assert.equal(resolveCalls.length,0);assert.equal(screen.queryByRole('button',{name:'Find metadata'}),null);
 fireEvent.click(screen.getByRole('checkbox',{name:/Tillad metadataopslag/}));await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Find metadata'}));});assert.equal(resolveCalls.length,1);assert.equal(commits.length,0);
 await act(async()=>{fireEvent.change(screen.getByLabelText('Vælg det korrekte filmmatch'),{target:{value:'42'}});});assert.equal(resolveCalls[1].selectedId,42);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Godkend import (1)'}));});assert.deepEqual(commits,[{previewId:'private-preview',rows:[{rowKey:'row:0'}]}]);assert.ok(screen.getByText('Importen er gemt. Dine forslag er opdateret.'));
 }finally{cleanup();globalThis.fetch=prior;dom.window.close();}
});
