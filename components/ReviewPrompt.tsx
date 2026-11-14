'use client';
import {useEffect,useState} from 'react';
import {useLocale} from './LocaleProvider';
import {languageHeaders} from '../lib/client';
import type {Movie} from '../lib/types';
export default function ReviewPrompt({onRated}:{onRated:()=>void}){
 const {t}=useLocale();const [movies,setMovies]=useState<Movie[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true,pending=false;let controller:AbortController|undefined;async function poll(){if(pending||document.visibilityState==='hidden')return;pending=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),7000);try{const r=await fetch('/api/reviews',{headers:languageHeaders(),signal:controller.signal});if(r.ok){const data=await r.json();if(alive)setMovies(data.movies);}}catch{}finally{clearTimeout(timeout);pending=false;}}void poll();const timer=setInterval(()=>void poll(),15000);return()=>{alive=false;controller?.abort();clearInterval(timer);};},[]);
 const movie=movies[0];if(!movie)return null;
 async function respond(value:number|null){if(!movie)return;setBusy(true);setError('');try{const r=await fetch(value===null?'/api/reviews/dismiss':'/api/rate',{method:'POST',headers:{'Content-Type':'application/json',...languageHeaders()},body:JSON.stringify(value===null?{itemId:movie.id}:{id:movie.id,value})});const data=await r.json();if(!r.ok)throw Error(data.error);setMovies(current=>current.filter(m=>m.id!==movie.id));if(value!==null)onRated();}catch(e){setError(e instanceof Error?e.message:'');}finally{setBusy(false);}}
 return <section className="panel review-prompt" aria-label={t('Bedøm filmen')}><span className="eyebrow">{t('TAK FOR I AFTEN')}</span><h2>{t('Hvad syntes du om filmen?')}</h2><p>{movie.title}</p><div className="detail-actions">{([[-2,'↓ Ikke mig'],[1,'↑ God'],[3,'♥ Favorit']] as const).map(([value,label])=><button className="secondary" key={value} disabled={busy} onClick={()=>void respond(value)}>{t(label)}</button>)}<button className="text-button" disabled={busy} onClick={()=>void respond(null)}>{t('Spring over')}</button></div>{error&&<p role="alert" className="error">{t(error)}</p>}</section>;
}
