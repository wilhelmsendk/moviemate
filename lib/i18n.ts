import english from '../locales/en.json';
export type Language='da'|'en';
export function resolveLanguage(value?:string|null):Language{return value?.toLowerCase().startsWith('en')?'en':'da';}
export function translate(source:string,language:Language):string{
 if(language==='da')return source;
 const leading=source.match(/^\s*/)?.[0]||'',trailing=source.match(/\s*$/)?.[0]||'',key=source.trim();
 const exact=(english as Record<string,string>)[key];if(exact!==undefined)return leading+exact+trailing;
 for(const [pattern,replacement]of [
  [/^Fordi du kunne lide (.+)$/,'Because you liked $1'],
  [/^Med afsæt i din historik: (.+)$/,'Based on your history: $1'],
  [/^Bedømmelsen blev ikke gemt: (.+)$/,'Rating was not saved: $1'],
  [/^Plakat: (.+)$/,'Poster: $1'],
  [/^Du vælger sammen med (.+)$/,'Choosing with $1'],
  [/^(.+) vil se den ✓$/,'$1 wants to watch this ✓'],
  [/^Aftenens film: (.+)\. Start den på TV’et\.$/,'Tonight’s film: $1. Start it on your TV.']
 ] as const){if(pattern.test(key))return leading+key.replace(pattern,replacement)+trailing;}
 return source;
}
