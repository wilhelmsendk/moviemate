import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
const {JSDOM}=require('jsdom');
test('CSV upload previews matches, permits deselection, and writes only after confirmation',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
 for(const name of ['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'])Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name],configurable:true,writable:true});
 const prior=globalThis.fetch;const writes:unknown[]=[];let imported=0;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{if(String(input).endsWith('preview')){assert.ok(JSON.parse(init!.body as string).csv.includes('Title'));return new Response(JSON.stringify({rows:[{title:'One',itemId:'one',value:3,watched:true},{title:'Two',itemId:'two',value:1,watched:true},{title:'Missing',itemId:null,value:3,watched:true,issue:'unmatched'}]}));}writes.push(JSON.parse(init!.body as string));return new Response('{"ok":true}');}) as typeof fetch;
 const {render,fireEvent,cleanup}=await import('@testing-library/react');const {default:HistoryImport}=await import('../components/HistoryImport');
 try{const screen=render(React.createElement(HistoryImport,{onImported:()=>imported++}));fireEvent.change(screen.getByLabelText('Vælg CSV-fil'),{target:{files:[{size:100,text:async()=>'Title,Date\nOne,today'}]}});await screen.findByText('Missing');assert.equal(writes.length,0);const checkboxes=screen.getAllByRole('checkbox');assert.equal((checkboxes[2] as HTMLInputElement).disabled,true);fireEvent.click(checkboxes[1]);fireEvent.click(screen.getByRole('button',{name:'Godkend import (1)'}));await screen.findByText('Importen er gemt. Dine forslag er opdateret.');assert.equal(imported,1);assert.equal((writes[0] as any).rows.length,1);assert.equal((writes[0] as any).rows[0].itemId,'one');}finally{cleanup();globalThis.fetch=prior;dom.window.close();}
});
