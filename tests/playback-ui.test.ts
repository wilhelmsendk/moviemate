import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
const {JSDOM}=require('jsdom');
test('start command waits for confirmed playback rather than claiming success',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
 for(const name of ['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'])Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name],configurable:true,writable:true});
 const prior=globalThis.fetch;let playing=false,commands=0;
 globalThis.fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==='POST'){commands++;assert.deepEqual(JSON.parse(init.body as string),{itemId:'film',sessionId:'tv'});return new Response(JSON.stringify({accepted:true}));}
  return new Response(JSON.stringify({targets:[{id:'tv',name:'Living room'}],status:playing?'playing':'idle',device:playing?'Living room':''}));
 }) as typeof fetch;
 const {render,fireEvent,waitFor,cleanup}=await import('@testing-library/react');const {default:PlaybackControls}=await import('../components/PlaybackControls');
 try{const screen=render(React.createElement(PlaybackControls,{itemId:'film'}));await screen.findByRole('option',{name:'Living room'});fireEvent.change(screen.getByRole('combobox'),{target:{value:'tv'}});fireEvent.click(screen.getByRole('button',{name:'Start filmen →'}));await screen.findByText('Venter på TV’et…');assert.equal(commands,1);assert.equal(screen.queryByText(/Afspilles nu/),null);playing=true;await waitFor(()=>assert.ok(screen.getByText(/Afspilles nu/)),{timeout:4000});}finally{cleanup();globalThis.fetch=prior;dom.window.close();}
});
