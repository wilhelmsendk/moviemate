import {pool,ready} from './db';
import {sealSecret,openSecret} from './secret-store';
export type TmdbCredential={kind:'key'|'token';value:string};
export function parseCredential(raw:string):TmdbCredential{
 const value=raw.trim().replace(/^Bearer\s+/i,'');
 if(!/^[a-zA-Z0-9._-]{16,4096}$/.test(value))throw Error('Indtast en gyldig TMDB API-nøgle eller Read Access Token.');
 return {kind:/^[a-f0-9]{32}$/i.test(value)?'key':'token',value};
}
export async function tmdbSettings(){await ready();const r=await pool.query("SELECT value FROM app_settings WHERE key='tmdb'");return {configured:!!r.rows[0]||!!(process.env.TMDB_API_TOKEN||process.env.TMDB_API_KEY),canRemove:!!r.rows[0]};}
export async function tmdbCredential():Promise<TmdbCredential|null>{
 await ready();const r=await pool.query("SELECT value FROM app_settings WHERE key='tmdb'");
 if(r.rows[0])return JSON.parse(await openSecret(r.rows[0].value));
 if(process.env.TMDB_API_TOKEN)return {kind:'token',value:process.env.TMDB_API_TOKEN};
 if(process.env.TMDB_API_KEY)return {kind:'key',value:process.env.TMDB_API_KEY};return null;
}
export async function saveTmdbCredential(value:TmdbCredential){const sealed=await sealSecret(JSON.stringify(value));await pool.query("INSERT INTO app_settings(key,value) VALUES('tmdb',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=now()",[JSON.stringify(sealed)]);}
export async function removeTmdbCredential(){await pool.query("DELETE FROM app_settings WHERE key='tmdb'");}
