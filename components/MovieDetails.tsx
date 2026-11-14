'use client';
import PlaybackControls from './PlaybackControls';
import {useEffect,useState} from 'react';
import {useLocale} from './LocaleProvider';
import {languageHeaders} from '../lib/client';
import type {Movie} from '../lib/types';
type DetailedMovie=Movie&{rated?:number;reason?:string};
export type DetailMode='details'|'rating'|'share';
export default function MovieDetails({movie,initialMode,saving,onRate,onClose,onProfile,onSelected,selectLabel}:{
 movie:DetailedMovie;initialMode:DetailMode;saving:boolean;
 onRate:(id:string,value:number|null)=>void;onClose:()=>void;onProfile:()=>void;onSelected:(title:string)=>void;selectLabel?:string;
}){
 const {t}=useLocale();
 const [mode,setMode]=useState<DetailMode>(initialMode),[full,setFull]=useState<DetailedMovie>(movie);
 const [loading,setLoading]=useState(true),[notice,setNotice]=useState('');
 const [users,setUsers]=useState<{id:string;name:string}[]>([]),[recipient,setRecipient]=useState(''),[note,setNote]=useState('');
 const [sharing,setSharing]=useState(false),[usersLoading,setUsersLoading]=useState(false),[shareError,setShareError]=useState(''),[sent,setSent]=useState(false);
 useEffect(()=>{
   const controller=new AbortController();
   fetch(`/api/movie/${encodeURIComponent(movie.id)}`,{signal:controller.signal,headers:languageHeaders()})
    .then(async r=>{if(!r.ok)throw Error('metadata');return r.json();})
    .then(r=>setFull({...r.movie,rated:movie.rated,reason:movie.reason}))
    .catch(()=>{if(!controller.signal.aborted)setNotice(t("Ekstra filmdetaljer kunne ikke hentes. De kendte oplysninger vises stadig."));})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
   return()=>controller.abort();
 },[movie]);
 useEffect(()=>{
   if(mode!=='share')return;
   const controller=new AbortController();setUsersLoading(true);setShareError('');
   fetch('/api/recipients',{signal:controller.signal,headers:languageHeaders()}).then(async r=>{if(!r.ok)throw Error(t("Brugerne kunne ikke hentes"));return r.json();})
    .then(r=>setUsers(r.users)).catch(e=>{if(!controller.signal.aborted)setShareError(e.message);})
    .finally(()=>{if(!controller.signal.aborted)setUsersLoading(false);});
   return()=>controller.abort();
 },[mode]);
 async function send(event:React.FormEvent){
   event.preventDefault();setSharing(true);setShareError('');
   try{
     const response=await fetch('/api/recommendations/send',{method:'POST',headers:{...languageHeaders(),'Content-Type':'application/json'},body:JSON.stringify({itemId:movie.id,recipientId:recipient,note})});
     const result=await response.json();if(!response.ok)throw Error(result.error||t("Kunne ikke sende anbefalingen"));
     setSent(true);
   }catch(e){setShareError(e instanceof Error?e.message:t("Prøv igen"));}finally{setSharing(false);}
 }
 function language(code:string){const names:Record<string,string>={dan:t("Dansk"),da:t("Dansk"),eng:t("Engelsk"),en:t("Engelsk"),deu:t("Tysk"),ger:t("Tysk"),swe:t("Svensk"),nor:t("Norsk"),und:t("Ukendt sprog")};return names[code.toLowerCase()]||code;}
 const cast=full.people.filter(p=>p.type==='Actor').slice(0,8),directors=full.people.filter(p=>p.type==='Director');
 return <div className="modal-backdrop" onClick={onClose}><section className={`movie-modal movie-detail-view ${mode==='details'?'expanded-details':''}`} role="dialog" aria-modal="true" aria-label={movie.title} onClick={e=>e.stopPropagation()}>
  <button className="close" autoFocus onClick={onClose} aria-label={t("Luk")}>×</button>
  {mode!=='details'&&<button className="text-button" onClick={()=>setMode('details')}>{t("← Tilbage til filmen")}</button>}
  <div className="detail-top"><div className="poster">{full.imageTag?<img src={`/api/image/${full.id}`} alt={t(`Plakat: ${full.title}`)}/>:<span className="placeholder">{full.title}</span>}</div><div><span className="eyebrow">{mode==='rating'?t("DIN BEDØMMELSE"):mode==='share'?t("EN FILM TIL EN VEN"):t("FRA DIT JELLYFIN-BIBLIOTEK")}</span><h2>{full.title}</h2><p>{full.year||t("År ukendt")} · {full.minutes?`${full.minutes} min`:t("Spilletid ukendt")}</p><p>{full.genres.join(' · ')}</p></div></div>
  {mode==='details'&&<><div className="movie-description"><h3>{t("Om filmen")}</h3><p>{full.overview||t("Der er endnu ingen beskrivelse af filmen i Jellyfin.")}</p></div>
   {full.reason&&<p className="detail-reason">✦ {t(full.reason)}</p>}
   <div className="detail-actions"><button className="primary" onClick={()=>onSelected(full.title)}>{selectLabel||t("Det bliver den her ✓")}</button><button className="secondary" onClick={()=>setMode('share')}>{t("Del med bruger ↗")}</button><button className="secondary" onClick={()=>setMode('rating')}>{t("Bedøm filmen")}</button></div>
   {(full.trailers||[]).length>0&&<div className="trailer-links">{full.trailers!.slice(0,2).map(t=><a className="secondary" href={t.url} key={t.url} target="_blank" rel="noopener noreferrer">▶ {t.name} ↗</a>)}</div>}
   {loading&&<p className="quiet" role="status">{t("Henter flere filmdetaljer…")}</p>}{notice&&<p className="quiet">{t(notice)}</p>}
   <dl className="movie-facts">{directors.length>0&&<><dt>{t("Instruktør")}</dt><dd>{directors.map(p=>p.name).join(', ')}</dd></>}{cast.length>0&&<><dt>{t("Medvirkende")}</dt><dd>{cast.map(p=>p.name).join(', ')}</dd></>}{full.audio.length>0&&<><dt>{t("Lydsprog")}</dt><dd>{[...new Set(full.audio.map(language))].join(' · ')}</dd></>}</dl>
   <PlaybackControls itemId={full.id}/>
  </>}
  {mode==='rating'&&<><h3 className="rating-title">{t("Har du set den? Hvad syntes du?")}</h3><div className="rating-buttons">{[[-2,'👎',t("Ikke mig")],[1,'👍',t("God")],[3,'♥',t("Favorit")]].map(([value,icon,label])=><button key={value} disabled={saving} aria-pressed={movie.rated===value} onClick={()=>onRate(movie.id,Number(value))}><b>{icon}</b>{label}</button>)}</div>{movie.rated!==undefined&&<button className="text-button" disabled={saving} onClick={()=>onRate(movie.id,null)}>{t("Fjern bedømmelse")}</button>}</>}
  {mode==='share'&&(sent?<div className="share-success" role="status"><h3>{t("Anbefalingen er sendt ✓")}</h3><p>{t("Den ligger nu i modtagerens MovieMate-indbakke.")}</p><button className="primary" onClick={onClose}>{t("Færdig")}</button></div>:<form className="share-form" onSubmit={send}><h3>{t("Hvem skal se den?")}</h3><p>{t("Send filmen til en bruger på samme server, eventuelt med en kort besked.")}</p>{usersLoading?<p role="status">{t("Henter brugere…")}</p>:users.length>0?<><label>{t("Modtager")}<select value={recipient} onChange={e=>setRecipient(e.target.value)} required><option value="">{t("Vælg en bruger")}</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>{t("Din besked ")}<span className="quiet">{t("(valgfri)")}</span><textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} rows={3} placeholder={t("Den her tror jeg lige er dig…")}/></label><button className="primary" disabled={sharing||!recipient}>{sharing?t("Sender…"):t("Send anbefaling →")}</button></>:<div className="empty-recipients"><p>{t("Ingen modtagere endnu. Din ven skal logge ind i MovieMate og slå “Modtag filmanbefalinger” til under sin brugerknap.")}</p><button className="text-button" type="button" onClick={onProfile}>{t("Åbn mine brugerindstillinger →")}</button></div>}{shareError&&<p className="error" role="alert">{t(shareError)}</p>}</form>)}
 </section></div>;
}
