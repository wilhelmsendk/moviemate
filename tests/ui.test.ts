import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
const {JSDOM}=require('jsdom');
test('home navigation preserves library, and another film can be rated before the first request finishes',async()=>{
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:3210'});
 const priorFetch=globalThis.fetch;
 const names=['window','document','navigator','HTMLElement','MutationObserver','getComputedStyle','IS_REACT_ACT_ENVIRONMENT'];
 for(const name of names)Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name],configurable:true,writable:true});
 const {render,fireEvent,waitFor,cleanup,act,within}=await import('@testing-library/react');
 const {default:Home}=await import('../app/page');
 const movies=['first','second','third'].map(id=>({id,title:id,year:2020,minutes:100,genres:['Comedy'],people:[],overview:'',played:false,favorite:false,audio:[]}));
 let libraryCalls=0,meCalls=0,recCalls=0;
 const writes:{id:string;resolve:(response:Response)=>void}[]=[];
 const shares:unknown[]=[];
 const recResolvers:((response:Response)=>void)[]=[];
 const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url==='/api/me'){meCalls++;return response({id:'alice',name:'Alice'});}
  if(url==='/api/library'){libraryCalls++;return response({movies,ratingCount:0});}
  if(url.split('?')[0]==='/api/recommendations'){
    recCalls++;if(recCalls===1)return response({movies:[{...movies[2],reason:'Et bud'}],personalized:false});
    return new Promise<Response>(resolve=>recResolvers.push(resolve));
  }
  if(url.startsWith('/api/movie/'))return response({movie:{...movies.find(m=>m.id===url.split('/').at(-1)),overview:'En hel beskrivelse',audio:['dan'],people:[{id:'p',name:'Test Director',type:'Director'}],trailers:[{name:'Trailer',url:'https://www.youtube.com/watch?v=test'}]}});
  if(url==='/api/recipients')return response({users:[{id:'bob',name:'Bob'}]});
  if(url==='/api/recommendations/send'){shares.push(JSON.parse(init!.body as string));return response({ok:true});}
  if(url==='/api/rate'){const b=JSON.parse(init!.body as string);return new Promise<Response>(resolve=>writes.push({id:b.id,resolve}));}
  throw Error(`Unexpected fetch ${url}`);
 }) as typeof fetch;
 try{
  const screen=render(React.createElement(Home));
  await waitFor(()=>assert.ok(screen.getByRole('heading',{name:/Hvad skal vi se/})));
  fireEvent.click(await screen.findByRole('button',{name:/Se filmen nærmere/}));
  assert.ok(within(screen.getByRole('dialog')).getByRole('heading',{name:'Om filmen'}));
  assert.equal(within(screen.getByRole('dialog')).queryByRole('button',{name:/Favorit/}),null);
  await waitFor(()=>assert.ok(within(screen.getByRole('dialog')).getByText('Dansk')));
  assert.ok(within(screen.getByRole('dialog')).getByRole('link',{name:/Trailer/}));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:/Del med bruger/}));
  await within(screen.getByRole('dialog')).findByRole('option',{name:'Bob'});
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('combobox'),{target:{value:'bob'}});
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox'),{target:{value:'Se den her!'}});
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:/Send anbefaling/}));
  await waitFor(()=>assert.equal(shares.length,1));
  assert.deepEqual(shares[0],{itemId:'third',recipientId:'bob',note:'Se den her!'});
  fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button',{name:'Færdig'}));
  fireEvent.click(screen.getByRole('button',{name:/Bibliotek/}));
  fireEvent.click(await screen.findByRole('button',{name:/first/}));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Bedøm filmen'}));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:/Favorit/}));
  await waitFor(()=>assert.equal(writes.length,1));
  assert.equal(screen.queryByRole('dialog'),null);
  fireEvent.click(screen.getByRole('button',{name:/second/}));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Bedøm filmen'}));
  const favorite=within(screen.getByRole('dialog')).getByRole('button',{name:/Favorit/}) as HTMLButtonElement;
  assert.equal(favorite.disabled,false);
  fireEvent.click(favorite);
  await waitFor(()=>assert.equal(writes.length,2));
  assert.deepEqual(writes.map(w=>w.id),['first','second']);
  await act(async()=>{writes.forEach(w=>w.resolve(response({ok:true})));});
  await waitFor(()=>assert.equal(recResolvers.length,2));
  await act(async()=>{recResolvers.forEach(resolve=>resolve(response({movies:[],personalized:true})));});
  fireEvent.click(screen.getByRole('button',{name:/Min smag/}));
  assert.ok(screen.getByRole('button',{name:/first/}));assert.ok(screen.getByRole('button',{name:/second/}));
  fireEvent.click(screen.getByRole('link',{name:'MovieMate forside'}));
  assert.ok(screen.getByRole('heading',{name:/Hvad skal vi se/}));
  assert.equal(libraryCalls,1);assert.equal(meCalls,1);
  // An unsuccessful save must roll back the optimistic rating.
  fireEvent.click(screen.getByRole('button',{name:/Bibliotek/}));
  fireEvent.click(screen.getByRole('button',{name:/third/}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Bedøm filmen'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:/Favorit/}));
  await waitFor(()=>assert.equal(writes.length,3));
  await act(async()=>writes[2].resolve(response({error:'offline'},503)));
  await waitFor(()=>assert.match(screen.getByRole('alert').textContent||'',/ikke gemt/));
  fireEvent.click(screen.getByRole('button',{name:/Min smag/}));assert.equal(screen.queryByRole('button',{name:/third/}),null);
 }finally{
  cleanup();globalThis.fetch=priorFetch;
  await new Promise(resolve=>setImmediate(resolve));
  dom.window.close();
  // Node test files run in separate processes; retain the closed DOM globals for React cleanup tasks.
 }
});
