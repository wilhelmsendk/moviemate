import type {Movie} from './types';
export type ImportRow={title:string;year:number;imdb?:string;value:number|null;watched:boolean;genres?:string[];directors?:string[]};
export type ImportPreview={title:string;itemId:string|null;matchedTitle:string|null;value:number|null;watched:boolean;issue:'unmatched'|'ambiguous'|null;rowKey?:string;externalId?:string;year?:number;imdb?:string;metadata?:Movie;candidates?:{id:number;title:string;year:number}[]};
// RFC 4180-style quoted fields, BOM, CRLF and embedded commas/newlines.
export function parseCsv(text:string):string[][]{
 if(text.length>2000000)throw Error('Importfilen er for stor (maks. 2 MB)');
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(closed&&c!==','&&c!=='\n'&&c!=='\r')throw Error('Ugyldig CSV-fil');if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted){quoted=false;closed=true;}else if(field==='')quoted=true;else throw Error('Ugyldig CSV-fil');}else if(c===','&&!quoted){row.push(field);field='';closed=false;}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';closed=false;}else field+=c;}
 if(quoted)throw Error('Ugyldig CSV-fil');row.push(field);if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length>10001)throw Error('Importen må højst indeholde 10.000 rækker');
 return rows;
}
export function importRows(text:string):ImportRow[]{
 const rows=parseCsv(text),headers=rows.shift()?.map(h=>h.trim().toLowerCase())||[];
 const imdb=headers.includes('your rating')&&headers.includes('title');
 const letterboxd=headers.includes('name')&&(headers.includes('letterboxd uri')||headers.includes('rating'));
 const netflix=headers.includes('title')&&headers.includes('date')&&!headers.includes('your rating');
 if(!imdb&&!letterboxd&&!netflix)throw Error('Vælg en CSV-eksport fra IMDb, Letterboxd eller Netflix-seeraktivitet');
 return rows.filter(fields=>!imdb||!headers.includes('title type')||['movie','tvmovie','video','short','tvshort'].includes((fields[headers.indexOf('title type')]||'').trim().toLowerCase())).map(fields=>{const get=(name:string)=>fields[headers.indexOf(name)]?.trim()||'';const raw=get(imdb?'your rating':'rating');const rating=raw===''?null:Number(raw);const max=imdb?10:5;if(!netflix&&rating!==null&&(!Number.isFinite(rating)||rating<=0||rating>max))throw Error('Importen indeholder en ugyldig bedømmelse');
  return {title:get(letterboxd?'name':'title').slice(0,500),year:Number(get('year'))>=1000&&Number(get('year'))<=3000?Number(get('year')):0,imdb:imdb?get('const').slice(0,40):undefined,value:netflix||rating===null?null:rating/max>=.9?3:rating/max>=.6?1:-2,watched:true,genres:get('genres').split(',').map(s=>s.trim().slice(0,100)).filter(Boolean).slice(0,20),directors:get('directors').split(',').map(s=>s.trim().slice(0,200)).filter(Boolean).slice(0,10)};
 }).filter(r=>r.title);
}
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function previewImport(rows:ImportRow[],movies:Movie[]):ImportPreview[]{
 const seen=new Set<string>();
 const ids=new Map<string,Movie[]>(),titles=new Map<string,Movie[]>();
 for(const movie of movies){const id=movie.providerIds?.Imdb;if(id)ids.set(id,[...(ids.get(id)||[]),movie]);const title=normalize(movie.title);titles.set(title,[...(titles.get(title)||[]),movie]);}
 return rows.map(row=>{
  const byId=row.imdb?ids.get(row.imdb)||[]:[];
  const matches=byId.length?byId:(titles.get(normalize(row.title))||[]).filter(m=>(!row.year||m.year===row.year)&&(!row.imdb||!m.providerIds?.Imdb||m.providerIds.Imdb===row.imdb));
  const movie=matches.length===1?matches[0]:null;
  return {title:row.title,year:row.year,imdb:row.imdb,itemId:movie?.id||null,matchedTitle:movie?.title||null,value:row.value,watched:row.watched,issue:matches.length>1?'ambiguous' as const:movie?null:'unmatched' as const,...(!movie&&matches.length===0&&row.imdb&&/^tt[0-9]+$/.test(row.imdb)&&((row.genres?.length||0)+(row.directors?.length||0)>0)?{externalId:`imdb:${row.imdb}`,metadata:{id:`external:imdb:${row.imdb}`,title:row.title,year:row.year,providerIds:{Imdb:row.imdb},minutes:0,genres:row.genres||[],people:(row.directors||[]).map(name=>({id:'',name,type:'Director'})),overview:'',played:true,favorite:false,audio:[]}}:{})};
 }).filter(row=>{const key=row.itemId||row.externalId||`${row.title}:${row.year}:${row.value}`;if(seen.has(key))return false;seen.add(key);return true;}).map((row,index)=>({...row,rowKey:`row:${index}`}));
}
