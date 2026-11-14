export function languageHeaders():Record<string,string>{
 try{return {'Accept-Language':localStorage.getItem('moviemate.language')==='en'?'en':'da'};}catch{return {'Accept-Language':'da'};}
}
