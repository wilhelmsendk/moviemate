import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
const {JSDOM}=require('jsdom');
test('library filters work locally and request Danish IDs only when explicitly selected',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
 for(const name of ['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'])Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name],configurable:true,writable:true});
 const prior=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=(async(input:RequestInfo|URL)=>{calls.push(String(input));return new Response(JSON.stringify({ids:['a']}));}) as typeof fetch;
 const {render,fireEvent,cleanup,waitFor,act}=await import('@testing-library/react');const {default:LibraryBrowser}=await import('../components/LibraryBrowser');
 const movies=[{id:'a',title:'Action film',genres:['Action'],year:2000,minutes:100,played:false,people:[],audio:[],overview:'',favorite:false},{id:'b',title:'Romantic film',genres:['Romance'],year:2020,minutes:90,played:false,people:[],audio:[],overview:'',favorite:false}];
 try{const screen=render(React.createElement(LibraryBrowser,{movies,ratingsOnly:false,busy:false,search:'',onSearch:()=>{},renderMovie:m=>React.createElement('article',{key:m.id},m.title)}));assert.equal(calls.length,0);fireEvent.change(screen.getByLabelText('Genre'),{target:{value:'action'}});assert.ok(screen.getByText('Action film'));assert.equal(screen.queryByText('Romantic film'),null);assert.equal(calls.length,0);fireEvent.click(screen.getByRole('button',{name:'Nulstil filtre'}));assert.ok(screen.getByText('Romantic film'));await act(async()=>{fireEvent.change(screen.getByLabelText('Danske film og tale'),{target:{value:'danish-audio'}});});await waitFor(()=>assert.ok(screen.getByText('Action film')));assert.equal(screen.queryByText('Romantic film'),null);assert.deepEqual(calls,['/api/library/facets/danish-audio']);fireEvent.change(screen.getByLabelText('Genre'),{target:{value:'romance'}});assert.ok(screen.getByText('Ingen film matcher dine filtre.'));assert.equal(calls.length,1);}finally{cleanup();globalThis.fetch=prior;dom.window.close();}
});
