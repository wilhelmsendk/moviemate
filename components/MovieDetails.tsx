'use client';
import {useEffect,useState} from 'react';
import type {Movie} from '../lib/types';
type DetailedMovie=Movie&{rated?:number;reason?:string};
export type DetailMode='details'|'rating'|'share';
export default function MovieDetails({movie,initialMode,saving,onRate,onClose,onProfile,onSelected,selectLabel}:{
 movie:DetailedMovie;initialMode:DetailMode;saving:boolean;
 onRate:(id:string,value:number|null)=>void;onClose:()=>void;onProfile:()=>void;onSelected:(title:string)=>void;selectLabel?:string;
}){
 const [mode,setMode]=useState<DetailMode>(initialMode),[full,setFull]=useState<DetailedMovie>(movie);
 const [loading,setLoading]=useState(true),[notice,setNotice]=useState('');
 const [users,setUsers]=useState<{id:string;name:string}[]>([]),[recipient,setRecipient]=useState(''),[note,setNote]=useState('');
 const [sharing,setSharing]=useState(false),[usersLoading,setUsersLoading]=useState(false),[shareError,setShareError]=useState(''),[sent,setSent]=useState(false);
 useEffect(()=>{
   const controller=new AbortController();
   fetch(`/api/movie/${encodeURIComponent(movie.id)}`,{signal:controller.signal})
    .then(async r=>{if(!r.ok)throw Error('metadata');return r.json();})
    .then(r=>setFull({...r.movie,rated:movie.rated,reason:movie.reason}))
    .catch(()=>{if(!controller.signal.aborted)setNotice('Ekstra filmdetaljer kunne ikke hentes. De kendte oplysninger vises stadig.');})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
   return()=>controller.abort();
 },[movie]);
 useEffect(()=>{
   if(mode!=='share')return;
   const controller=new AbortController();setUsersLoading(true);setShareError('');
   fetch('/api/recipients',{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Brugerne kunne ikke hentes');return r.json();})
    .then(r=>setUsers(r.users)).catch(e=>{if(!controller.signal.aborted)setShareError(e.message);})
    .finally(()=>{if(!controller.signal.aborted)setUsersLoading(false);});
   return()=>controller.abort();
 },[mode]);
 async function send(event:React.FormEvent){
   event.preventDefault();setSharing(true);setShareError('');
   try{
     const response=await fetch('/api/recommendations/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:movie.id,recipientId:recipient,note})});
     const result=await response.json();if(!response.ok)throw Error(result.error||'Kunne ikke sende anbefalingen');
     setSent(true);
   }catch(e){setShareError(e instanceof Error?e.message:'Prøv igen');}finally{setSharing(false);}
 }
 function language(code:string){const names:Record<string,string>={dan:'Dansk',da:'Dansk',eng:'Engelsk',en:'Engelsk',deu:'Tysk',ger:'Tysk',swe:'Svensk',nor:'Norsk',und:'Ukendt sprog'};return names[code.toLowerCase()]||code;}
 const cast=full.people.filter(p=>p.type==='Actor').slice(0,8),directors=full.people.filter(p=>p.type==='Director');
 return <div className="modal-backdrop" onClick={onClose}><section className={`movie-modal movie-detail-view ${mode==='details'?'expanded-details':''}`} role="dialog" aria-modal="true" aria-label={movie.title} onClick={e=>e.stopPropagation()}>
  <button className="close" autoFocus onClick={onClose} aria-label="Luk">×</button>
  {mode!=='details'&&<button className="text-button" onClick={()=>setMode('details')}>← Tilbage til filmen</button>}
  <div className="detail-top"><div className="poster">{full.imageTag?<img src={`/api/image/${full.id}`} alt={`Plakat: ${full.title}`}/>:<span className="placeholder">{full.title}</span>}</div><div><span className="eyebrow">{mode==='rating'?'DIN BEDØMMELSE':mode==='share'?'EN FILM TIL EN VEN':'FRA DIT JELLYFIN-BIBLIOTEK'}</span><h2>{full.title}</h2><p>{full.year||'År ukendt'} · {full.minutes?`${full.minutes} min`:'Spilletid ukendt'}</p><p>{full.genres.join(' · ')}</p></div></div>
  {mode==='details'&&<><div className="movie-description"><h3>Om filmen</h3><p>{full.overview||'Der er endnu ingen beskrivelse af filmen i Jellyfin.'}</p></div>
   {full.reason&&<p className="detail-reason">✦ {full.reason}</p>}
   <div className="detail-actions"><button className="primary" onClick={()=>onSelected(full.title)}>{selectLabel||'Det bliver den her ✓'}</button><button className="secondary" onClick={()=>setMode('share')}>Del med bruger ↗</button><button className="secondary" onClick={()=>setMode('rating')}>Bedøm filmen</button></div>
   {(full.trailers||[]).length>0&&<div className="trailer-links">{full.trailers!.slice(0,2).map(t=><a className="secondary" href={t.url} key={t.url} target="_blank" rel="noopener noreferrer">▶ {t.name} ↗</a>)}</div>}
   {loading&&<p className="quiet" role="status">Henter flere filmdetaljer…</p>}{notice&&<p className="quiet">{notice}</p>}
   <dl className="movie-facts">{directors.length>0&&<><dt>Instruktør</dt><dd>{directors.map(p=>p.name).join(', ')}</dd></>}{cast.length>0&&<><dt>Medvirkende</dt><dd>{cast.map(p=>p.name).join(', ')}</dd></>}{full.audio.length>0&&<><dt>Lydsprog</dt><dd>{[...new Set(full.audio.map(language))].join(' · ')}</dd></>}</dl>
   <div className="play-note">Start <strong>{full.title}</strong> i Moonfin eller Jellyfin på TV’et. Valget her starter endnu ikke afspilningen.</div>
  </>}
  {mode==='rating'&&<><h3 className="rating-title">Har du set den? Hvad syntes du?</h3><div className="rating-buttons">{[[-2,'👎','Ikke mig'],[1,'👍','God'],[3,'♥','Favorit']].map(([value,icon,label])=><button key={value} disabled={saving} aria-pressed={movie.rated===value} onClick={()=>onRate(movie.id,Number(value))}><b>{icon}</b>{label}</button>)}</div>{movie.rated!==undefined&&<button className="text-button" disabled={saving} onClick={()=>onRate(movie.id,null)}>Fjern bedømmelse</button>}</>}
  {mode==='share'&&(sent?<div className="share-success" role="status"><h3>Anbefalingen er sendt ✓</h3><p>Den ligger nu i modtagerens MovieMate-indbakke.</p><button className="primary" onClick={onClose}>Færdig</button></div>:<form className="share-form" onSubmit={send}><h3>Hvem skal se den?</h3><p>Send filmen til en bruger på samme server, eventuelt med en kort besked.</p>{usersLoading?<p role="status">Henter brugere…</p>:users.length>0?<><label>Modtager<select value={recipient} onChange={e=>setRecipient(e.target.value)} required><option value="">Vælg en bruger</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Din besked <span className="quiet">(valgfri)</span><textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} rows={3} placeholder="Den her tror jeg lige er dig…"/></label><button className="primary" disabled={sharing||!recipient}>{sharing?'Sender…':'Send anbefaling →'}</button></>:<div className="empty-recipients"><p>Ingen modtagere endnu. Din ven skal logge ind i MovieMate og slå “Modtag filmanbefalinger” til under sin brugerknap.</p><button className="text-button" type="button" onClick={onProfile}>Åbn mine brugerindstillinger →</button></div>}{shareError&&<p className="error" role="alert">{shareError}</p>}</form>)}
 </section></div>;
}
