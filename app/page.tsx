'use client';
import { useEffect, useRef, useState } from 'react';
import type { Movie, Pick } from '@/lib/types';
type LibraryMovie = Movie & {rated?:number};
type User = {id:string;name:string};
async function api(path:string,body?:unknown) {
  const response=await fetch(`/api/${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error || 'Der skete en fejl');
  return data;
}
export default function Home() {
  const [user,setUser]=useState<User|null>(null),[boot,setBoot]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[toast,setToast]=useState(''),[tab,setTab]=useState('tonight');
  const [movies,setMovies]=useState<LibraryMovie[]>([]),[picks,setPicks]=useState<Pick[]>([]),[personal,setPersonal]=useState(false);
  const [search,setSearch]=useState(''),[minutes,setMinutes]=useState('0'),[details,setDetails]=useState<LibraryMovie|null>(null);
  const [room,setRoom]=useState(''),[join,setJoin]=useState(''),[partner,setPartner]=useState(''),[waiting,setWaiting]=useState(false),[pairPicks,setPairPicks]=useState<Pick[]>([]);
  const [savingIds,setSavingIds]=useState<Set<string>>(new Set());
  const savingRef=useRef(new Set<string>());
  const userRef=useRef<User|null>(null);userRef.current=user;
  const recommendationRequest=useRef(0);
  const ratingCount=movies.filter(m=>m.rated!==undefined).length;
  useEffect(()=>{api('me').then(setUser).catch(()=>{}).finally(()=>setBoot(false));},[]);
  useEffect(()=>{if(user) void load();},[user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(user) void refreshRecommendations();},[minutes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{
    if(!room||!user||tab!=='together')return;
    let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
    async function poll(){
      try {const r=await api(`rooms/${room}`);if(active){setError('');setWaiting(r.waiting);setPartner(r.name||'');setPairPicks(r.movies||[]);}}
      catch(e){if(active)setError(message(e));}
      finally{if(active)timer=setTimeout(poll,15000);}
    }
    void poll();return()=>{active=false;clearTimeout(timer);};
  },[room,user,tab]);
  useEffect(()=>{
    if(!details)return;
    const previous=document.activeElement as HTMLElement|null;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    function keyboard(event:KeyboardEvent){
      if(event.key==='Escape')setDetails(null);
      if(event.key!=='Tab')return;
      const nodes=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled), [role="dialog"] a[href]'));
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    document.addEventListener('keydown',keyboard);
    return()=>{document.removeEventListener('keydown',keyboard);document.body.style.overflow=oldOverflow;previous?.focus();};
  },[details]);
  function message(e:unknown){return e instanceof Error?e.message:'Prøv igen';}
  async function refreshRecommendations(){
    const current=++recommendationRequest.current,owner=userRef.current?.id;
    try{
      const r=await api(`recommendations?minutes=${minutes}`);
      if(current===recommendationRequest.current&&userRef.current?.id===owner){setPicks(r.movies);setPersonal(r.personalized);}
    }catch(e){if(current===recommendationRequest.current&&userRef.current?.id===owner)setError(message(e));}
  }
  async function load(){
    const owner=userRef.current?.id;setBusy(true);setError('');
    try{
      await Promise.all([api('library').then(l=>{if(userRef.current?.id===owner)setMovies(l.movies);}),refreshRecommendations()]);
    }catch(e){if(userRef.current?.id===owner)setError(message(e));}
    finally{if(userRef.current?.id===owner)setBusy(false);}
  }
  async function login(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setError('');setBusy(true);const f=new FormData(event.currentTarget);try{await api('login',{username:f.get('username'),password:f.get('password')});setUser(await api('me'));}catch(e){setError(message(e));}finally{setBusy(false);}}
  async function rate(id:string,value:number|null){
    if(savingRef.current.has(id))return;
    const owner=userRef.current?.id,previous=movies.find(m=>m.id===id)?.rated;
    savingRef.current.add(id);setSavingIds(new Set(savingRef.current));setError('');setDetails(null);
    setMovies(current=>current.map(m=>m.id===id?{...m,rated:value??undefined}:m));
    try{
      await api('rate',{id,value});
      if(userRef.current?.id!==owner)return;
      setToast(value===null?'Bedømmelsen er fjernet':'Gemt! Du kan bedømme den næste film.');
      void refreshRecommendations();
    }catch(e){
      if(userRef.current?.id===owner){setMovies(current=>current.map(m=>m.id===id?{...m,rated:previous}:m));setError(`Bedømmelsen blev ikke gemt: ${message(e)}`);}
    }finally{savingRef.current.delete(id);setSavingIds(new Set(savingRef.current));}
  }
  async function dismiss(id:string){try{await api('dismiss',{id});setPicks(p=>p.filter(m=>m.id!==id));setToast('Skjult i 12 timer. Din smag er ikke ændret.');}catch(e){setError(message(e));}}
  async function createRoom(){setBusy(true);try{const r=await api('rooms',{});setRoom(r.code);setWaiting(true);}catch(e){setError(message(e));}finally{setBusy(false);}}
  async function joinRoom(e:React.FormEvent){e.preventDefault();setBusy(true);try{const r=await api('rooms/join',{code:join});setRoom(r.code);}catch(e){setError(message(e));}finally{setBusy(false);}}
  function poster(m:Movie){return <div className="poster">{m.imageTag?<img src={`/api/image/${m.id}`} alt={`Plakat: ${m.title}`} loading="lazy"/>:<span className="placeholder">{m.title}</span>}</div>;}
  function card(m:Pick|LibraryMovie){return <button key={m.id} className="movie-card" onClick={()=>setDetails(m)}>{poster(m)}<strong>{m.title}</strong><span>{m.year || 'År ukendt'} · {m.minutes?`${m.minutes} min`:'Spilletid ukendt'}</span>{'reason' in m&&<small>{m.reason}</small>}{'rated' in m&&m.rated!==undefined&&<small className="rated">{m.rated===3?'♥ Favorit':m.rated===1?'↑ God':'↓ Ikke mig'}</small>}</button>;}
  if(boot)return <main className="loading" aria-live="polite">MovieMate starter…</main>;
  if(!user)return <main className="login-shell"><div className="brand"><img src="/icon.svg" alt=""/>MovieMate<span>ALPHA 0.1.2</span></div><div className="login-content"><span className="eyebrow">DIN NÆSTE GODE FILMAFTEN</span><h1>Mindre scroll.<br/><em>Mere film.</em></h1><p>De bedste valg er måske allerede i dit bibliotek. Find dem med din personlige filmmakker.</p><div className="login-benefits"><span>✦ Din smag</span><span>♡ Jeres fælles valg</span><span>⌂ Dit bibliotek</span></div><form onSubmit={login}><h2>Velkommen ind</h2><p>Brug dit Jellyfin-login til denne server.</p><label>Brugernavn<input name="username" autoComplete="username" required placeholder="Dit Jellyfin-brugernavn"/></label><label>Adgangskode<input name="password" type="password" autoComplete="current-password" required placeholder="Din adgangskode"/></label>{error&&<p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}>{busy?'Forbinder…':'Find min næste film →'}</button><small>Adgangskoden sendes til din Jellyfin-server og gemmes ikke af MovieMate.</small></form><p className="quiet">Open source. Selvhostet. Lavet til din sofa.</p></div></main>;
  const hero=picks[0];
  const filtered=movies.filter(m=>m.title.toLowerCase().includes(search.toLowerCase())&&(tab!=='ratings'||m.rated!==undefined));
  return <><header><a className="brand" href="/" onClick={event=>{event.preventDefault();setTab('tonight');setSearch('');}} aria-label="MovieMate forside"><img src="/icon.svg" alt=""/>MovieMate</a><button className="profile" onClick={async()=>{try{await api('logout',{});setUser(null);setMovies([]);setPicks([]);setRoom('');}catch(e){setError(message(e));}}} title="Log ud">{user.name.slice(0,1).toUpperCase()}<span>{user.name}</span><small>Log ud</small></button></header><main className="dashboard">
    {error&&<div className="error" role="alert">{error}<button onClick={()=>void load()}>Prøv igen</button></div>}
    {tab==='tonight'&&<><div className="intro"><div><span className="eyebrow">DIN SAMLING. DINE FILMAFTENER.</span><h1>Hvad skal vi se <em>i aften?</em></h1><p>{movies.length} film at vælge imellem. Lad os finde den rigtige.</p></div><label className="time-filter">Tid til en film<select value={minutes} onChange={e=>setMinutes(e.target.value)}><option value="0">Ingen tidsgrænse</option><option value="90">Højst 90 minutter</option><option value="120">Højst 2 timer</option><option value="150">Højst 2½ time</option></select></label></div>
    {!personal&&<div className="taste-banner"><span className="spark">✦</span><div><strong>Giv os en fornemmelse af din smag</strong><p>Bedøm nogle film, du kender. Dine favoritter hjælper os med de første personlige forslag.</p></div><button onClick={()=>setTab('library')}>Lær min smag →</button></div>}
    {busy&&!hero?<div className="loading" role="status">Finder film i dit bibliotek…</div>:hero?<section className="hero"><div className="hero-art">{hero.imageTag&&<img src={`/api/image/${hero.id}`} alt=""/>}</div><div className="hero-body"><span className="pill">✦ {personal?'ET BUD TIL DIG':'FRA DIT BIBLIOTEK'}</span><h2>{hero.title}</h2><p className="meta">{hero.year} <span>·</span> {hero.minutes} min <span>·</span> {hero.genres.slice(0,2).join(' / ')}</p><p className="synopsis">{hero.overview||'Åbn filmen for at se mere.'}</p><div className="reason">{hero.reason}</div><div className="hero-actions"><button className="primary" onClick={()=>setDetails(hero)}>Se filmen nærmere ↗</button><button className="secondary" onClick={()=>void dismiss(hero.id)}>Ikke i aften</button></div></div></section>:<section className="empty"><h2>Ingen forslag lige nu</h2><p>Prøv en længere spilletid, eller kig i biblioteket. Set-status, ratings og midlertidigt skjulte film begrænser udvalget.</p></section>}
    <section className="section"><div className="section-heading"><div><span className="eyebrow">LIDT MERE AT VÆLGE IMELLEM</span><h2>Andre gode bud</h2></div><span className="quiet">Fra dit eget bibliotek</span></div><div className="movie-grid">{picks.slice(1,7).map(card)}</div></section>
    <button className="together-banner" onClick={()=>setTab('together')}><span>♡</span><div><strong>To mennesker. Én god film.</strong><p>Find noget, I begge har lyst til at se.</p></div><b>Vælg sammen →</b></button></>}
    {(tab==='library'||tab==='ratings')&&<><div className="intro"><div><span className="eyebrow">{tab==='ratings'?'DIN FILMSMAG':'ALT DET, DU ALLEREDE HAR'}</span><h1>{tab==='ratings'?'Dine bedømmelser':'Dit bibliotek'}</h1><p>{ratingCount} film bedømt. Dine vurderinger bliver kun gemt i MovieMate.</p></div></div><label className="search-label">Find en film<input type="search" placeholder="Søg efter en titel…" value={search} onChange={e=>setSearch(e.target.value)}/></label>{busy&&<p role="status">Opdaterer biblioteket…</p>}<div className="movie-grid library-grid">{filtered.map(card)}</div>{!filtered.length&&!busy&&<p className="empty">Ingen film her endnu. Bedøm en film i biblioteket, eller prøv en anden søgning.</p>}</>}
    {tab==='together'&&<section className="together-page"><span className="eyebrow">JERES FILMAFTEN</span><h1>Find jeres <em>fælles favorit.</em></h1><p>Brug hver jeres Jellyfin-profil. Vi finder film, som I begge har adgang til og endnu ikke har set eller bedømt.</p>{!room?<div className="room-options"><div className="panel"><h2>Invitér din filmmakker</h2><p>Lav en kode, og del den. Koden gælder i to timer og kan bruges af én anden profil.</p><button className="primary" disabled={busy} onClick={()=>void createRoom()}>Opret filmaften →</button></div><form className="panel" onSubmit={joinRoom}><h2>Har du en kode?</h2><label>Invitationskode<input value={join} onChange={e=>setJoin(e.target.value.toUpperCase())} placeholder="Indtast kode" required maxLength={12}/></label><button className="secondary" disabled={busy}>Deltag i filmaften</button></form></div>:<div className="panel"><p>Jeres kode</p><strong className="room-code">{room}</strong><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(room);setToast('Koden er kopieret');}catch{setToast('Markér og kopiér koden ovenfor');}}}>Kopiér</button><p>{waiting?'Venter på din filmmakker… Hold denne side åben.':`Du vælger sammen med ${partner}`}</p><button className="text-button" onClick={()=>{setRoom('');setPairPicks([]);}}>Tilbage</button></div>}{!waiting&&room&&<><h2>Bud til jer begge</h2><div className="movie-grid">{pairPicks.map(card)}</div>{!pairPicks.length&&<p>Ingen fælles bud lige nu. Bedøm nogle film hver især, eller prøv igen efter at have kontrolleret jeres biblioteksadgang.</p>}</>}</section>}
    <footer>MovieMate · Alpha 0.1.2 <span>Bygget til en god filmaften</span></footer>
  </main><nav className="bottom-nav" aria-label="Hovedmenu">{[['tonight','✦','I aften'],['library','▦','Bibliotek'],['together','♡','Sammen'],['ratings','♥','Min smag']].map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setSearch('');}}><span>{icon}</span>{label}</button>)}</nav>
  {toast&&<div className="toast" role="status">{toast}</div>}
  {details&&<div className="modal-backdrop" onClick={()=>setDetails(null)}><section className="movie-modal" role="dialog" aria-modal="true" aria-label={details.title} onClick={e=>e.stopPropagation()}><button className="close" autoFocus onClick={()=>setDetails(null)} aria-label="Luk">×</button><div className="detail-top">{poster(details)}<div><span className="eyebrow">FRA DIT JELLYFIN-BIBLIOTEK</span><h2>{details.title}</h2><p>{details.year} · {details.minutes} min</p><p>{details.genres.join(' · ')}</p></div></div><p>{details.overview}</p><h3>Har du set den? Hvad syntes du?</h3><div className="rating-buttons">{[[-2,'👎','Ikke mig'],[1,'👍','God'],[3,'♥','Favorit']].map(([value,icon,label])=><button key={value} disabled={savingIds.has(details.id)} aria-pressed={details.rated===value} onClick={()=>void rate(details.id,Number(value))}><b>{icon}</b>{label}</button>)}</div>{details.rated!==undefined&&<button className="text-button" disabled={savingIds.has(details.id)} onClick={()=>void rate(details.id,null)}>Fjern bedømmelse</button>}<div className="play-note">Åbn Moonfin eller Jellyfin på TV’et, og vælg <strong>{details.title}</strong>. Direkte TV-afspilning kommer i en senere version.</div></section></div>}
  </>;
}
