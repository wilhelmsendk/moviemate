'use client';
import HistoryImport from '../components/HistoryImport';
import ReviewPrompt from '../components/ReviewPrompt';
import PlaybackControls from '../components/PlaybackControls';
import { useEffect, useRef, useState } from 'react';
import type { Movie, Pick, InboxRecommendation } from '@/lib/types';
import {useLocale} from '../components/LocaleProvider';
import {languageHeaders} from '../lib/client';
import MovieDetails, { type DetailMode } from '../components/MovieDetails';
type LibraryMovie = Movie & {rated?:number};
type TonightChoice={code:string;version:number;partner:string;movie:Movie};
type RoomVote={itemId:string;mine:boolean;partner:boolean};
type User = {id:string;name:string;receiveRecommendations?:boolean;language?:'da'|'en'|null};
async function api(path:string,body?:unknown) {
  const response=await fetch(`/api/${path}`,body===undefined?{headers:languageHeaders()}:{method:'POST',headers:{...languageHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error || 'Der skete en fejl');
  return data;
}
export default function Home() {
  const {language,setLanguage,t}=useLocale();
  const [user,setUser]=useState<User|null>(null),[boot,setBoot]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[toast,setToast]=useState(''),[tab,setTab]=useState('tonight');
  const [movies,setMovies]=useState<LibraryMovie[]>([]),[picks,setPicks]=useState<Pick[]>([]),[personal,setPersonal]=useState(false);
  const [search,setSearch]=useState(''),[minutes,setMinutes]=useState('0'),[details,setDetails]=useState<LibraryMovie|null>(null);
  const [tonightChoice,setTonightChoice]=useState<TonightChoice|null>(null),[endingChoice,setEndingChoice]=useState(false);
  const tonightRequest=useRef(0);
  const [votes,setVotes]=useState<RoomVote[]>([]),[selectedMovie,setSelectedMovie]=useState<Movie|null>(null),[votingIds,setVotingIds]=useState<Set<string>>(new Set()),[resetting,setResetting]=useState(false),[syncing,setSyncing]=useState(false);
  const voteRef=useRef(new Set<string>());
  const roomVersion=useRef(0),roomRef=useRef('');
  const [detailMode,setDetailMode]=useState<DetailMode>('details');
  const [inbox,setInbox]=useState<InboxRecommendation[]>([]),[inboxLoading,setInboxLoading]=useState(false),[preferencesSaving,setPreferencesSaving]=useState(false);
  const [room,setRoom]=useState(''),[join,setJoin]=useState(''),[partner,setPartner]=useState(''),[waiting,setWaiting]=useState(false),[pairPicks,setPairPicks]=useState<Pick[]>([]);
  roomRef.current=room;
  const [savingIds,setSavingIds]=useState<Set<string>>(new Set());
  const savingRef=useRef(new Set<string>());
  const userRef=useRef<User|null>(null);userRef.current=user;
  const recommendationRequest=useRef(0);
  const ratingCount=movies.filter(m=>m.rated!==undefined).length;
  useEffect(()=>{api('me').then(current=>{setUser(current);if(current.language)setLanguage(current.language);}).catch(()=>{}).finally(()=>setBoot(false));},[]);
  useEffect(()=>{if(user) void load();},[user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(user) void refreshRecommendations();},[minutes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!user||tab!=='inbox')return;
    let active=true;let timer:ReturnType<typeof setTimeout>|undefined;setInboxLoading(true);
    async function pollInbox(){
      try{if(!document.hidden){const r=await api('inbox');if(active)setInbox(r.messages);}}
      catch(e){if(active)setError(message(e));}
      finally{if(active){setInboxLoading(false);timer=setTimeout(pollInbox,2000);}}
    }
    void pollInbox();return()=>{active=false;clearTimeout(timer);};
  },[user,tab]);
  useEffect(()=>{
    if(!user||tab!=='tonight')return;
    let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
    async function pollChoice(){
      if(document.hidden){timer=setTimeout(pollChoice,2000);return;}
      const sequence=++tonightRequest.current;
      try{const result=await api('tonight');if(active&&sequence===tonightRequest.current)setTonightChoice(result.choice);}
      catch(e){if(active)setError(message(e));}
      finally{if(active)timer=setTimeout(pollChoice,2000);}
    }
    void pollChoice();return()=>{active=false;clearTimeout(timer);};
  },[user?.id,tab]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{
    if(!room||!user||tab!=='together')return;
    let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
    async function poll(){
      try {if(!document.hidden){const r=await api(`rooms/${room}`);if(active&&Number(r.version||0)>=roomVersion.current){roomVersion.current=Number(r.version||0);setError('');setWaiting(r.waiting);setPartner(r.name||'');setPairPicks(r.movies||[]);setVotes(r.votes||[]);setSelectedMovie(r.selected||null);if(r.selected)setTonightChoice({code:room,version:Number(r.version||0),partner:r.name||'',movie:r.selected});else setTonightChoice(current=>current?.code===room?null:current);}}}
      catch(e){if(active)setError(message(e));}
      finally{if(active)timer=setTimeout(poll,2000);}
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
  function message(e:unknown){return e instanceof Error?e.message:t("Prøv igen");}
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
  async function login(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setError('');setBusy(true);const f=new FormData(event.currentTarget);try{await api('login',{username:f.get('username'),password:f.get('password')});await api('preferences',{language});setUser(await api('me'));}catch(e){setError(message(e));}finally{setBusy(false);}}
  async function rate(id:string,value:number|null){
    if(savingRef.current.has(id))return;
    const owner=userRef.current?.id,previous=movies.find(m=>m.id===id)?.rated;
    savingRef.current.add(id);setSavingIds(new Set(savingRef.current));setError('');setDetails(null);
    setMovies(current=>current.map(m=>m.id===id?{...m,rated:value??undefined}:m));
    try{
      await api('rate',{id,value});
      if(userRef.current?.id!==owner)return;
      setToast(value===null?t("Bedømmelsen er fjernet"):t("Gemt! Du kan bedømme den næste film."));
      void refreshRecommendations();
    }catch(e){
      if(userRef.current?.id===owner){setMovies(current=>current.map(m=>m.id===id?{...m,rated:previous}:m));setError(t(`Bedømmelsen blev ikke gemt: ${message(e)}`));}
    }finally{savingRef.current.delete(id);setSavingIds(new Set(savingRef.current));}
  }
  async function dismiss(id:string){try{await api('dismiss',{id});setPicks(p=>p.filter(m=>m.id!==id));setToast(t("Skjult i 12 timer. Din smag er ikke ændret."));}catch(e){setError(message(e));}}
  async function createRoom(){setBusy(true);try{const r=await api('rooms',{});roomVersion.current=0;setRoom(r.code);setWaiting(true);setSelectedMovie(null);setVotes([]);++tonightRequest.current;setTonightChoice(current=>current?.code===room?null:current);}catch(e){setError(message(e));}finally{setBusy(false);}}
  async function joinRoom(e:React.FormEvent){e.preventDefault();setBusy(true);try{const r=await api('rooms/join',{code:join});roomVersion.current=0;setRoom(r.code);}catch(e){setError(message(e));}finally{setBusy(false);}}
  async function voteFor(itemId:string,approved=true){
    if(voteRef.current.has(itemId)||!room)return;
    const activeRoom=room;voteRef.current.add(itemId);setVotingIds(new Set(voteRef.current));setError('');
    try{
      const result=await api(`rooms/${activeRoom}/vote`,{itemId,approved});
      if(roomRef.current!==activeRoom||Number(result.version||0)<roomVersion.current)return;
      roomVersion.current=Number(result.version||0);
      setVotes(current=>{const others=current.filter(v=>v.itemId!==itemId),old=current.find(v=>v.itemId===itemId);return [...others,{itemId,mine:approved,partner:old?.partner||false}];});
      if(result.selected){setSelectedMovie(result.selected);++tonightRequest.current;setTonightChoice({code:activeRoom,version:Number(result.version||0),partner,movie:result.selected});}
      else setToast(approved?t("Dit valg er gemt. Nu mangler din filmmakker."):t("Dit valg er fjernet"));
    }catch(e){setError(message(e));}finally{voteRef.current.delete(itemId);setVotingIds(new Set(voteRef.current));}
  }
  async function resetChoice(){
    setResetting(true);try{const result=await api(`rooms/${room}/reset`,{});roomVersion.current=Number(result.version||0);setSelectedMovie(null);setVotes([]);++tonightRequest.current;setTonightChoice(current=>current?.code===room?null:current);}catch(e){setError(message(e));}finally{setResetting(false);}
  }
  async function endTonight(){
    if(!tonightChoice)return;
    const choice=tonightChoice;setEndingChoice(true);++tonightRequest.current;
    try{const result=await api('tonight/end',{code:choice.code,itemId:choice.movie.id,version:choice.version});++tonightRequest.current;setTonightChoice(null);if(room===choice.code){roomVersion.current=Number(result.version);setSelectedMovie(null);setVotes([]);}setToast(t("Aftenens filmvalg er afsluttet"));}
    catch(e){setError(message(e));}finally{setEndingChoice(false);}
  }
  async function syncLibrary(){
    setSyncing(true);try{await api('library/refresh',{});await load();setToast(t("Biblioteket er synkroniseret"));}catch(e){setError(message(e));}finally{setSyncing(false);}
  }
  function openMovie(movie:LibraryMovie|Pick,mode:DetailMode='details'){
    setDetailMode(mode);setDetails({...movie,rated:movies.find(m=>m.id===movie.id)?.rated});
  }
  async function changeLanguage(value:'da'|'en'){
    const previous=language;setLanguage(value);
    if(!user)return;
    try{await api('preferences',{language:value});setUser(current=>current?{...current,language:value}:current);}
    catch(e){setLanguage(previous);setError(message(e));}
  }
  function languagePicker(){return <label className="language-picker">{t('Sprog')}<select aria-label={t('Vælg dit sprog')} value={language} onChange={e=>void changeLanguage(e.target.value as 'da'|'en')}><option value="da">{t("Dansk")}</option><option value="en">English</option></select></label>;}
  async function preferences(value:boolean){
    setPreferencesSaving(true);setError('');
    try{await api('preferences',{receiveRecommendations:value});setUser(current=>current?{...current,receiveRecommendations:value}:current);setToast(t("Brugerindstillingen er gemt"));}
    catch(e){setError(message(e));}finally{setPreferencesSaving(false);}
  }
  function poster(m:Movie){return <div className="poster">{m.imageTag?<img src={`/api/image/${m.id}`} alt={t(`Plakat: ${m.title}`)} loading="lazy" decoding="async" fetchPriority="low"/>:<span className="placeholder">{m.title}</span>}</div>;}
  function card(m:Pick|LibraryMovie){return <button key={m.id} className="movie-card" onClick={()=>openMovie(m,tab==='ratings'?'rating':'details')}>{poster(m)}<strong>{m.title}</strong><span>{m.year || t("År ukendt")} · {m.minutes?`${m.minutes} min`:t("Spilletid ukendt")}</span>{'reason' in m&&<small>{t(m.reason)}</small>}{'rated' in m&&m.rated!==undefined&&<small className="rated">{m.rated===3?t("♥ Favorit"):m.rated===1?t("↑ God"):t("↓ Ikke mig")}</small>}</button>;}
  if(boot)return <main className="loading" aria-live="polite">{t("MovieMate starter…")}</main>;
  if(!user)return <main className="login-shell"><div className="brand"><img src="/icon.svg" alt=""/>MovieMate<span>ALPHA 0.1.8</span></div><div className="login-content"><span className="eyebrow">{t("DIN NÆSTE GODE FILMAFTEN")}</span><h1>{t("Mindre scroll.")}<br/><em>{t("Mere film.")}</em></h1><p>{t("De bedste valg er måske allerede i dit bibliotek. Find dem med din personlige filmmakker.")}</p><div className="login-benefits"><span>{t("✦ Din smag")}</span><span>{t("♡ Jeres fælles valg")}</span><span>{t("⌂ Dit bibliotek")}</span></div><form onSubmit={login}>{languagePicker()}<h2>{t("Velkommen ind")}</h2><p>{t("Brug dit Jellyfin-login til denne server.")}</p><label>{t("Brugernavn")}<input name="username" autoComplete="username" required placeholder={t("Dit Jellyfin-brugernavn")}/></label><label>{t("Adgangskode")}<input name="password" type="password" autoComplete="current-password" required placeholder={t("Din adgangskode")}/></label>{error&&<p role="alert" className="error">{t(error)}</p>}<button className="primary" disabled={busy}>{busy?t("Forbinder…"):t("Find min næste film →")}</button><small>{t("Adgangskoden sendes til din Jellyfin-server og gemmes ikke af MovieMate.")}</small></form><p className="quiet">{t("Open source. Selvhostet. Lavet til din sofa.")}</p></div></main>;
  const hero=picks[0];
  const filtered=movies.filter(m=>m.title.toLowerCase().includes(search.toLowerCase())&&(tab!=='ratings'||m.rated!==undefined));
  return <><header><a className="brand" href="/" onClick={event=>{event.preventDefault();setTab('tonight');setSearch('');}} aria-label={t("MovieMate forside")}><img src="/icon.svg" alt=""/>MovieMate</a><button className="profile" aria-label={t("Mine brugerindstillinger")} onClick={()=>setTab('profile')} title={t("Mine brugerindstillinger")}>{user.name.slice(0,1).toUpperCase()}<span>{user.name}</span><small>{t("Min bruger")}</small></button></header><main className="dashboard"><ReviewPrompt onRated={()=>void load()}/>
    {error&&<div className="error" role="alert">{t(error)}<button onClick={()=>void load()}>{t("Prøv igen")}</button></div>}
    {tab==='tonight'&&<><div className="intro"><div><span className="eyebrow">{t("DIN SAMLING. DINE FILMAFTENER.")}</span><h1>{t("Hvad skal vi se ")}<em>{t("i aften?")}</em></h1><p>{movies.length} {t(" film at vælge imellem. Lad os finde den rigtige.")}</p></div><label className="time-filter">{t("Tid til en film")}<select value={minutes} onChange={e=>setMinutes(e.target.value)}><option value="0">{t("Ingen tidsgrænse")}</option><option value="90">{t("Højst 90 minutter")}</option><option value="120">{t("Højst 2 timer")}</option><option value="150">{t("Højst 2½ time")}</option></select></label></div>
    {tonightChoice&&<section className="tonight-chosen" aria-label={t("Jeres valgte film")}><div className="chosen-poster">{poster(tonightChoice.movie)}</div><div className="chosen-body"><span className="eyebrow">{t("I HAR VALGT I AFTEN ✓")}</span><h2>{tonightChoice.movie.title}</h2><PlaybackControls itemId={tonightChoice.movie.id} code={tonightChoice.code}/><p>{t("Valgt sammen med ")}{tonightChoice.partner} · {tonightChoice.movie.year} · {tonightChoice.movie.minutes} {t(" min")}</p><div className="detail-actions"><button className="primary" onClick={()=>openMovie(tonightChoice.movie)}>{t("Åbn jeres valgte film ↗")}</button><button className="secondary" disabled={endingChoice} onClick={()=>void endTonight()}>{endingChoice?t("Afslutter…"):t("Afslut filmvalget")}</button></div></div></section>}
    {!personal&&<div className="taste-banner"><span className="spark">✦</span><div><strong>{t("Giv os en fornemmelse af din smag")}</strong><p>{t("Bedøm nogle film, du kender. Dine favoritter hjælper os med de første personlige forslag.")}</p></div><button onClick={()=>setTab('library')}>{t("Lær min smag →")}</button></div>}
    {busy&&!hero?<div className="loading" role="status">{t("Finder film i dit bibliotek…")}</div>:hero?<section className="hero"><div className="hero-art">{hero.imageTag&&<img src={`/api/image/${hero.id}`} alt=""/>}</div><div className="hero-body"><span className="pill">✦ {personal?t("ET BUD TIL DIG"):t("FRA DIT BIBLIOTEK")}</span><h2>{hero.title}</h2><p className="meta">{hero.year} <span>·</span> {hero.minutes} {t(" min ")}<span>·</span> {hero.genres.slice(0,2).join(' / ')}</p><p className="synopsis">{hero.overview||t("Åbn filmen for at se mere.")}</p><div className="reason">{t(hero.reason)}</div><div className="hero-actions"><button className="primary" onClick={()=>openMovie(hero)}>{t("Se filmen nærmere ↗")}</button><button className="secondary" onClick={()=>void dismiss(hero.id)}>{t("Ikke i aften")}</button></div></div></section>:<section className="empty"><h2>{t("Ingen forslag lige nu")}</h2><p>{t("Prøv en længere spilletid, eller kig i biblioteket. Set-status, ratings og midlertidigt skjulte film begrænser udvalget.")}</p></section>}
    <section className="section"><div className="section-heading"><div><span className="eyebrow">{t("LIDT MERE AT VÆLGE IMELLEM")}</span><h2>{t("Andre gode bud")}</h2></div><span className="quiet">{t("Fra dit eget bibliotek")}</span></div><div className="movie-grid">{picks.slice(1,7).map(card)}</div></section>
    <button className="together-banner" onClick={()=>setTab('together')}><span>♡</span><div><strong>{t("To mennesker. Én god film.")}</strong><p>{t("Find noget, I begge har lyst til at se.")}</p></div><b>{t("Vælg sammen →")}</b></button></>}
    {(tab==='library'||tab==='ratings')&&<><div className="intro"><div><span className="eyebrow">{tab==='ratings'?t("DIN FILMSMAG"):t("ALT DET, DU ALLEREDE HAR")}</span><h1>{tab==='ratings'?t("Dine bedømmelser"):t("Dit bibliotek")}</h1><p>{ratingCount} {t(" film bedømt. Dine vurderinger bliver kun gemt i MovieMate.")}</p></div></div><label className="search-label">{t("Find en film")}<input type="search" placeholder={t("Søg efter en titel…")} value={search} onChange={e=>setSearch(e.target.value)}/></label>{busy&&<p role="status">{t("Opdaterer biblioteket…")}</p>}<div className="movie-grid library-grid">{filtered.map(card)}</div>{!filtered.length&&!busy&&<p className="empty">{t("Ingen film her endnu. Bedøm en film i biblioteket, eller prøv en anden søgning.")}</p>}</>}
    {tab==='together'&&<section className="together-page"><span className="eyebrow">{t("JERES FILMAFTEN")}</span><h1>{t("Find jeres ")}<em>{t("fælles favorit.")}</em></h1><p>{t("Brug hver jeres Jellyfin-profil. Vi finder film, som I begge har adgang til og endnu ikke har set eller bedømt.")}</p>{!room?<div className="room-options"><div className="panel"><h2>{t("Invitér din filmmakker")}</h2><p>{t("Lav en kode, og del den. Koden gælder i to timer og kan bruges af én anden profil.")}</p><button className="primary" disabled={busy} onClick={()=>void createRoom()}>{t("Opret filmaften →")}</button></div><form className="panel" onSubmit={joinRoom}><h2>{t("Har du en kode?")}</h2><label>{t("Invitationskode")}<input value={join} onChange={e=>setJoin(e.target.value.toUpperCase())} placeholder={t("Indtast kode")} required maxLength={12}/></label><button className="secondary" disabled={busy}>{t("Deltag i filmaften")}</button></form></div>:<div className="panel"><p>{t("Jeres kode")}</p><strong className="room-code">{room}</strong><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(room);setToast(t("Koden er kopieret"));}catch{setToast(t("Markér og kopiér koden ovenfor"));}}}>{t("Kopiér")}</button><p>{waiting?t("Venter på din filmmakker… Hold denne side åben."):t(`Du vælger sammen med ${partner}`)}</p><button className="text-button" onClick={()=>{setRoom('');setPairPicks([]);setVotes([]);setSelectedMovie(null);}}>{t("Tilbage")}</button></div>}{!waiting&&room&&(selectedMovie?<div className="agreed-panel" role="status"><span className="eyebrow">{t("I ER ENIGE ✓")}</span><h2>{t("Aftenens film: ")}{selectedMovie.title}</h2><PlaybackControls itemId={selectedMovie.id} code={room}/><div className="detail-actions"><button className="primary" onClick={()=>openMovie(selectedMovie)}>{t("Se aftenens film ↗")}</button><button className="secondary" disabled={resetting} onClick={()=>void resetChoice()}>{resetting?t("Nulstiller…"):t("Vælg en anden film")}</button></div></div>:<><h2>{t("Bud til jer begge")}</h2><p className="pair-help">{t("Tryk “Den vil jeg se” på de film, du har lyst til. Når I vælger den samme, har I aftenens film.")}</p><div className="movie-grid">{pairPicks.map(movie=>{const choice=votes.find(v=>v.itemId===movie.id);return <article className="pair-card" key={movie.id}>{card(movie)}<p className="partner-choice">{choice?.partner?t(`${partner} vil se den ✓`):t("Afventer din filmmakker")}</p><button className={choice?.mine?'secondary':'primary'} aria-pressed={!!choice?.mine} disabled={votingIds.has(movie.id)} onClick={()=>void voteFor(movie.id,!choice?.mine)}>{votingIds.has(movie.id)?t("Gemmer…"):choice?.mine?t("Mit valg ✓ · Fortryd"):t("Den vil jeg se")}</button></article>;})}</div>{!pairPicks.length&&<p>{t("Ingen fælles bud lige nu. Bedøm nogle film hver især, eller prøv igen efter at have kontrolleret jeres biblioteksadgang.")}</p>}</>)}</section>}
    {tab==='profile'&&<section className="profile-page"><span className="eyebrow">{t("DIN MOVIEMATE-BRUGER")}</span><h1>{t("Hej, ")}<em>{user.name}</em></h1>{languagePicker()}<HistoryImport onImported={()=>void load()}/><div className="panel"><h2>{t("Anbefalinger fra andre")}</h2><p>{t("Når du slår det til, kan andre MovieMate-brugere på denne server finde dit brugernavn og sende dig filmanbefalinger. Dine ratings og din historik deles ikke.")}</p><label className="preference-toggle"><input type="checkbox" checked={!!user.receiveRecommendations} disabled={preferencesSaving} onChange={e=>void preferences(e.target.checked)}/>{t("Modtag filmanbefalinger")}</label></div><div className="panel"><h2>{t("Dit bibliotek")}</h2><p>{t("Filmoplysninger gemmes lokalt i MovieMate og opdateres i baggrunden. Brug knappen, hvis du lige har tilføjet nye film.")}</p><button className="secondary" disabled={syncing} onClick={()=>void syncLibrary()}>{syncing?t("Synkroniserer…"):t("Synkroniser bibliotek")}</button></div><button className="secondary" onClick={async()=>{try{await api('logout',{});setUser(null);setTonightChoice(null);++tonightRequest.current;setMovies([]);setPicks([]);setInbox([]);setRoom('');setTab('tonight');}catch(e){setError(message(e));}}}>{t("Log ud")}</button></section>}
    {tab==='inbox'&&<section><span className="eyebrow">{t("FRA DINE FILMMAKKERE")}</span><h1>{t("Din indbakke")}</h1><p className="inbox-intro">{t("Personlige filmanbefalinger fra andre på din server.")}</p>{!user.receiveRecommendations&&<div className="panel"><p>{t("Vil du modtage anbefalinger? Slå det til under din brugerknap.")}</p><button className="secondary" onClick={()=>setTab('profile')}>{t("Åbn brugerindstillinger")}</button></div>}{inboxLoading&&!inbox.length?<p role="status">{t("Henter anbefalinger…")}</p>:inbox.length?<div className="inbox-list">{inbox.map(item=><article key={item.id} className="inbox-card"><div><span className="eyebrow">{item.sender} {t(" ANBEFALER")}{!item.read_at?t(" · NY"):''}</span><h2>{item.movie.title}</h2>{item.note&&<p className="recommendation-note">“{item.note}”</p>}<button className="secondary" onClick={()=>{openMovie(item.movie);void api('inbox/read',{id:item.id}).then(()=>setInbox(current=>current.map(m=>m.id===item.id?{...m,read_at:new Date().toISOString()}:m))).catch(e=>setError(message(e)));}}>{t("Se filmen nærmere ↗")}</button></div>{poster(item.movie)}</article>)}</div>:<div className="empty"><h2>{t("Ingen anbefalinger endnu")}</h2><p>{t("Åbn en film og vælg “Del med bruger”, når du vil sende dit første filmtip.")}</p></div>}</section>}
    <footer>MovieMate · Alpha 0.1.8 <span>{t("Bygget til en god filmaften")}</span></footer>
  </main><nav className="bottom-nav" aria-label={t("Hovedmenu")}>{[['tonight','✦',t("I aften")],['library','▦',t("Bibliotek")],['together','♡',t("Sammen")],['ratings','♥',t("Min smag")],['inbox','✉',t("Indbakke")]].map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setSearch('');}}><span>{icon}</span>{label}</button>)}</nav>
  {toast&&<div className="toast" role="status">{t(toast)}</div>}
  {details&&<MovieDetails key={`${details.id}:${detailMode}`} movie={details} initialMode={detailMode} saving={savingIds.has(details.id)} onRate={(id,value)=>void rate(id,value)} onClose={()=>setDetails(null)} onProfile={()=>{setDetails(null);setTab('profile');}} onSelected={()=>{const movie=details;setDetails(null);if(tab==='together'&&room&&!selectedMovie)void voteFor(movie.id);else setToast(t(`Aftenens film: ${movie.title}. Start den på TV’et.`));}} selectLabel={tab==='together'&&room&&!selectedMovie?t("Den vil jeg se"):t("Det bliver den her ✓")}/>}
  </>;
}
