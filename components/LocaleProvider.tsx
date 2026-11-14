'use client';
import {createContext,useCallback,useContext,useEffect,useState} from 'react';
import {translate,type Language} from '../lib/i18n';
const LocaleContext=createContext({language:'da' as Language,setLanguage:(_value:Language)=>{},t:(text:string)=>text});
export function LocaleProvider({children}:{children:React.ReactNode}){
 const [language,setValue]=useState<Language>('da');
 useEffect(()=>{
  try{const saved=localStorage.getItem('moviemate.language');setValue(saved==='da'||saved==='en'?saved:navigator.language.toLowerCase().startsWith('da')?'da':'en');}catch{}
 },[]);
 const setLanguage=useCallback((value:Language)=>{setValue(value);try{localStorage.setItem('moviemate.language',value);}catch{}},[]);
 useEffect(()=>{document.documentElement.lang=language;document.title=language==='en'?'MovieMate · Find tonight’s film':'MovieMate · Find aftenens film';},[language]);
 const t=useCallback((text:string)=>translate(text,language),[language]);
 return <LocaleContext.Provider value={{language,setLanguage,t}}>{children}</LocaleContext.Provider>;
}
export function useLocale(){return useContext(LocaleContext);}
