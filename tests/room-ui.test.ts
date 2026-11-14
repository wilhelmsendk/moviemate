import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
const {JSDOM}=require('jsdom');
test('couples approve a film and see a shared confirmed choice, with an explicit reset',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost:3210',pretendToBeVisual:true});
 for(const name of ['window','document','navigator','HTMLElement','MutationObserver','getComputedStyle','IS_REACT_ACT_ENVIRONMENT'])Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name],configurable:true,writable:true});
 const {render,fireEvent,waitFor,cleanup,act,within}=await import('@testing-library/react');
 const {default:Home}=await import('../app/page');const prior=globalThis.fetch;
 const movie={id:'shared',title:'Shared film',year:2020,minutes:100,genres:['Comedy'],people:[],overview:'',played:false,favorite:false,audio:[]};
 let selected:typeof movie|null=null,approved=false;const calls:string[]=[];
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);calls.push(url);let data:unknown;
  if(url==='/api/me')data={id:'alice',name:'Alice'};
  else if(url==='/api/tonight')data={choice:selected?{code:'ROOM',version:0,partner:'Bob',movie:selected}:null};
  else if(url==='/api/tonight/end'){selected=null;data={ok:true,version:1};}
  else if(url==='/api/library')data={movies:[movie],ratingCount:0};
  else if(url.startsWith('/api/recommendations?'))data={movies:[movie],personalized:true};
  else if(url==='/api/rooms')data={code:'ROOM'};
  else if(url==='/api/rooms/ROOM')data={waiting:false,name:'Bob',movies:[movie],votes:[{itemId:'shared',mine:approved,partner:true}],selected};
  else if(url==='/api/rooms/ROOM/vote'){assert.deepEqual(JSON.parse(init!.body as string),{itemId:'shared',approved:true});approved=true;selected=movie;data={ok:true,selected};}
  else if(url==='/api/rooms/ROOM/reset'){selected=null;approved=false;data={ok:true,selected:null};}
  else throw Error(url);
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 }) as typeof fetch;
 try{
  const screen=render(React.createElement(Home));await screen.findByRole('heading',{name:/Hvad skal vi se/});
  fireEvent.click(screen.getByRole('button',{name:'♡Sammen'}));
  await waitFor(()=>assert.equal((screen.getByRole('button',{name:/Opret filmaften/}) as HTMLButtonElement).disabled,false));
  fireEvent.click(screen.getByRole('button',{name:/Opret filmaften/}));
  await screen.findByText('Bob vil se den ✓');
  fireEvent.click(screen.getByText('Den vil jeg se',{selector:'button'}));
  await screen.findByText('Aftenens film: Shared film',{selector:'h2'});
  assert.ok(screen.getByText('I ER ENIGE ✓'));
  fireEvent.click(screen.getByRole('button',{name:'✦I aften'}));
  const chosen=await screen.findByRole('region',{name:'Jeres valgte film'});
  assert.ok(within(chosen).getByRole('heading',{name:'Shared film'}));
  fireEvent.click(screen.getByRole('button',{name:'♡Sammen'}));
  await act(async()=>{fireEvent.click(screen.getByText('Vælg en anden film',{selector:'button'}));});
  assert.equal(screen.queryByText('I ER ENIGE ✓'),null);
  assert.ok(screen.getByText('Den vil jeg se',{selector:'button'}));assert.ok(calls.includes('/api/rooms/ROOM/reset'));
  fireEvent.click(screen.getByRole('button',{name:'✦I aften'}));
  await waitFor(()=>assert.equal(screen.queryByRole('region',{name:'Jeres valgte film'}),null));
  // A fresh app instance restores the selected film from the server, with no room open.
  selected=movie;cleanup();
  const reloaded=render(React.createElement(Home));
  const restored=await reloaded.findByRole('region',{name:'Jeres valgte film'});
  assert.ok(within(restored).getByRole('heading',{name:'Shared film'}));
  await act(async()=>{fireEvent.click(within(restored).getByRole('button',{name:'Afslut filmvalget'}));});
  assert.equal(reloaded.queryByRole('region',{name:'Jeres valgte film'}),null);
  assert.equal(selected,null);

 }finally{cleanup();globalThis.fetch=prior;await new Promise(r=>setImmediate(r));dom.window.close();}
});
