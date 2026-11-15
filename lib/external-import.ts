import {randomBytes} from 'node:crypto';
import {pool} from './db';
import {importRows,previewImport,type ImportPreview} from './import-history';
import {findTmdb,tmdbMovie} from './tmdb';
import type {Movie} from './types';
export async function prepareImport(userId:string,csv:string,movies:Movie[]){
 const rows=previewImport(importRows(csv),movies),id=randomBytes(24).toString('hex');
 await pool.query('DELETE FROM import_previews WHERE expires<now()');
 await pool.query("INSERT INTO import_previews(id,user_id,data,expires) VALUES($1,$2,$3,now()+interval '1 hour')",[id,userId,JSON.stringify(rows)]);return {previewId:id,rows};
}
export async function storedPreview(userId:string,id:string){
 const r=await pool.query('SELECT data FROM import_previews WHERE id=$1 AND user_id=$2 AND expires>now()',[id,userId]);
 if(!r.rows[0])throw Error('Importvisningen er udløbet. Vælg filen igen.');return r.rows[0].data as ImportPreview[];
}
export async function resolveImport(userId:string,id:string,rowKey:string,selectedId?:number){
 const rows=await storedPreview(userId,id),row=rows.find(r=>r.rowKey===rowKey);
 if(!row||row.itemId)throw Error('Ugyldige data');
 if(selectedId!==undefined){if(!row.candidates?.some(c=>c.id===selectedId))throw Error('Ugyldigt filmmatch');const movie=await tmdbMovie(selectedId);row.metadata=movie;row.externalId=movie.providerIds?.Imdb?`imdb:${movie.providerIds.Imdb}`:`tmdb:${selectedId}`;row.matchedTitle=movie.title;}
 else{const found=await findTmdb(row);row.candidates=found.candidates;if(found.exact){row.metadata=await tmdbMovie(found.exact);row.externalId=row.metadata.providerIds?.Imdb?`imdb:${row.metadata.providerIds.Imdb}`:`tmdb:${found.exact}`;row.matchedTitle=row.metadata.title;}}
 // Update this row atomically; parallel lookups must not overwrite each other's results.
 const index=rows.indexOf(row);
 const saved=await pool.query("UPDATE import_previews SET data=jsonb_set(data,ARRAY[$3::text],$4::jsonb) WHERE id=$1 AND user_id=$2 AND expires>now() RETURNING id",[id,userId,String(index),JSON.stringify(row)]);
 if(!saved.rows.length)throw Error('Importvisningen er udløbet. Vælg filen igen.');return row;
}
