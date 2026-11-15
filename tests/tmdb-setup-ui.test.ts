import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{useState} from 'react';
import TmdbSetup from '../components/TmdbSetup';
const {JSDOM}=require('jsdom');
test('administrator can test and save a masked key without rendering it after save; attribution is collapsed',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
 for(const name of ['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'])Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name],configurable:true,writable:true});
 const prior=globalThis.fetch;const writes:any[]=[];
 globalThis.fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{writes.push(JSON.parse(init!.body as string));return new Response(JSON.stringify({configured:true,canManage:true,canRemove:true}));}) as typeof fetch;
 const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
 function Example(){const [state,setState]=useState({configured:false,canManage:true,canRemove:false});return React.createElement(TmdbSetup,{state,onChange:setState});}
 try{const screen=render(React.createElement(Example));const input=screen.getByLabelText('TMDB API-nøgle eller Read Access Token') as HTMLInputElement;assert.equal(input.type,'password');fireEvent.change(input,{target:{value:'test-only-sensitive-credential'}});await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Test og gem'}));});assert.equal(writes[0].credential,'test-only-sensitive-credential');assert.equal(input.value,'');assert.ok(screen.getByText('TMDB er tilsluttet ✓'));assert.equal(screen.queryByText(/\.env/),null);const attribution=screen.getByText('Om filmoplysningerne').closest('details');assert.equal(attribution?.hasAttribute('open'),false);
 cleanup();const regular=render(React.createElement(TmdbSetup,{state:{configured:false,canManage:false,canRemove:false},onChange:()=>{}}));assert.equal(regular.queryByLabelText('TMDB API-nøgle eller Read Access Token'),null);assert.ok(regular.getByText('En Jellyfin-administrator kan tilslutte TMDB her.'));
 }finally{cleanup();globalThis.fetch=prior;dom.window.close();}
});
