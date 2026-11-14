import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {LocaleProvider,useLocale} from '../components/LocaleProvider';
const {JSDOM}=require('jsdom');
test('language selection persists and updates the page immediately',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
 for(const name of ['window','document','navigator','HTMLElement','MutationObserver','localStorage','IS_REACT_ACT_ENVIRONMENT'])Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name],configurable:true,writable:true});
 localStorage.setItem('moviemate.language','da');
 const {render,fireEvent,cleanup,waitFor}=await import('@testing-library/react');
 function Example(){const {t,setLanguage}=useLocale();return React.createElement('button',{onClick:()=>setLanguage('en')},t('Velkommen ind'));}
 try{const screen=render(React.createElement(LocaleProvider,{children:React.createElement(Example)}));fireEvent.click(screen.getByRole('button',{name:'Velkommen ind'}));await waitFor(()=>assert.ok(screen.getByRole('button',{name:'Welcome in'})));assert.equal(localStorage.getItem('moviemate.language'),'en');assert.equal(document.documentElement.lang,'en');}finally{cleanup();dom.window.close();}
});
