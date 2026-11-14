import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
const {JSDOM}=require('jsdom');
test('post-film review saves feedback and offers an explicit skip',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
 for(const name of ['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'])Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name],configurable:true,writable:true});
 const prior=globalThis.fetch;const writes:unknown[]=[];let refreshed=0;
 globalThis.fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST'){writes.push(JSON.parse(init.body as string));return new Response('{"ok":true}');}return new Response(JSON.stringify({movies:[{id:'a',title:'First'},{id:'b',title:'Second'}]}));}) as typeof fetch;
 const {render,fireEvent,act,cleanup}=await import('@testing-library/react');const {default:ReviewPrompt}=await import('../components/ReviewPrompt');
 try{const screen=render(React.createElement(ReviewPrompt,{onRated:()=>refreshed++}));await screen.findByText('First');fireEvent.click(screen.getByRole('button',{name:'♥ Favorit'}));await screen.findByText('Second');assert.deepEqual(writes[0],{id:'a',value:3});assert.equal(refreshed,1);await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Spring over'}));});assert.equal(screen.queryByText('Second'),null);assert.deepEqual(writes[1],{itemId:'b'});assert.equal(refreshed,1);}finally{cleanup();globalThis.fetch=prior;dom.window.close();}
});
