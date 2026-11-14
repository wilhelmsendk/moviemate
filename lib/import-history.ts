import type {Movie} from './types';
export type ImportRow={title:string;year:number;imdb?:string;value:number|null;watched:boolean};
export type ImportPreview={title:string;itemId:string|null;matchedTitle:string|null;value:number|null;watched:boolean;issue:'unmatched'|'ambiguous'|null};
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
 return rows.map(fields=>{const get=(name:string)=>fields[headers.indexOf(name)]?.trim()||'';const raw=get(imdb?'your rating':'rating');const rating=raw===''?null:Number(raw);const max=imdb?10:5;if(!netflix&&rating!==null&&(!Number.isFinite(rating)||rating<=0||rating>max))throw Error('Importen indeholder en ugyldig bedømmelse');
  return {title:get(letterboxd?'name':'title'),year:Number(get('year'))||0,imdb:imdb?get('const'):undefined,value:netflix||rating===null?null:rating/max>=.9?3:rating/max>=.6?1:-2,watched:true};
 }).filter(r=>r.title);
}
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function previewImport(rows:ImportRow[],movies:Movie[]):ImportPreview[]{
 const seen=new Set<string>();
 const ids=new Map<string,Movie[]>(),titles=new Map<string,Movie[]>();
 for(const movie of movies){const id=movie.providerIds?.Imdb;if(id)ids.set(id,[...(ids.get(id)||[]),movie]);const title=normalize(movie.title);titles.set(title,[...(titles.get(title)||[]),movie]);}
 return rows.map(row=>{
  const byId=row.imdb?ids.get(row.imdb)||[]:[];
  const matches=byId.length?byId:(titles.get(normalize(row.title))||[]).filter(m=>!row.year||m.year===row.year);
  const movie=matches.length===1?matches[0]:null;
  return {title:row.title,itemId:movie?.id||null,matchedTitle:movie?.title||null,value:row.value,watched:row.watched,issue:matches.length>1?'ambiguous' as const:movie?null:'unmatched' as const};
 }).filter(row=>{const key=row.itemId||`${row.title}:${row.value}`;if(seen.has(key))return false;seen.add(key);return true;});
}
