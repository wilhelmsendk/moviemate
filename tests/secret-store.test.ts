import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sealSecret,openSecret} from '../lib/secret-store';
import {parseCredential} from '../lib/tmdb-settings';
test('API keys and pasted Bearer tokens are recognized, while malformed credentials are rejected',()=>{
 assert.deepEqual(parseCredential(' 0123456789abcdef0123456789abcdef '),{kind:'key',value:'0123456789abcdef0123456789abcdef'});
 assert.deepEqual(parseCredential('Bearer header.payload.signature'),{kind:'token',value:'header.payload.signature'});
 assert.throws(()=>parseCredential('too short'));assert.throws(()=>parseCredential('secret-with\n-internal-newline'));
});
test('saved credentials are encrypted, authenticated and survive a new server process',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'moviemate-secret-test-')),prior=process.env.MOVIEMATE_SECRETS_DIR;process.env.MOVIEMATE_SECRETS_DIR=dir;
 try{const plaintext=JSON.stringify({kind:'key',value:'test-only-sensitive-credential'}),sealed=await sealSecret(plaintext);assert.ok(!JSON.stringify(sealed).includes('test-only-sensitive-credential'));assert.equal(await openSecret(sealed),plaintext);assert.equal((await readFile(join(dir,'master.key'))).length,32);assert.equal((await stat(join(dir,'master.key'))).mode&0o777,0o600);
 const altered=Buffer.from(sealed.data,'base64');altered[0]^=1;await assert.rejects(openSecret({...sealed,data:altered.toString('base64')}));
 const run=await promisify(execFile)(process.execPath,['--import','tsx','-e',"const {openSecret}=require('./lib/secret-store.ts');openSecret(JSON.parse(process.env.TEST_ENVELOPE)).then(v=>process.stdout.write(v));"],{cwd:process.cwd(),env:{...process.env,TEST_ENVELOPE:JSON.stringify(sealed)}});assert.equal(run.stdout,plaintext);
 }finally{if(prior===undefined)delete process.env.MOVIEMATE_SECRETS_DIR;else process.env.MOVIEMATE_SECRETS_DIR=prior;await rm(dir,{recursive:true,force:true});}
});
test('saved server settings override environment values without exposing plaintext in the database or status',async()=>{
 const {pool}=await import('../lib/db');const {saveTmdbCredential,tmdbCredential,tmdbSettings,removeTmdbCredential}=await import('../lib/tmdb-settings');
 const query=pool.query,dir=await mkdtemp(join(tmpdir(),'moviemate-setting-test-')),oldDir=process.env.MOVIEMATE_SECRETS_DIR,oldKey=process.env.TMDB_API_KEY,oldToken=process.env.TMDB_API_TOKEN;let saved:unknown=null;
 process.env.MOVIEMATE_SECRETS_DIR=dir;process.env.TMDB_API_KEY='environment-fallback-key';delete process.env.TMDB_API_TOKEN;
 (pool as any).query=async(sql:string,args?:any[])=>{if(sql.startsWith('INSERT INTO app_settings'))saved=JSON.parse(args![0]);if(sql.startsWith('DELETE FROM app_settings'))saved=null;return {rows:sql.startsWith('SELECT value FROM app_settings')&&saved?[{value:saved}]:[],rowCount:1};};
 try{await saveTmdbCredential({kind:'key',value:'saved-test-only-secret'});assert.ok(!JSON.stringify(saved).includes('saved-test-only-secret'));assert.equal((await tmdbCredential())?.value,'saved-test-only-secret');assert.deepEqual(await tmdbSettings(),{configured:true,canRemove:true});await removeTmdbCredential();assert.equal((await tmdbCredential())?.value,'environment-fallback-key');assert.deepEqual(await tmdbSettings(),{configured:true,canRemove:false});}
 finally{pool.query=query;if(oldDir===undefined)delete process.env.MOVIEMATE_SECRETS_DIR;else process.env.MOVIEMATE_SECRETS_DIR=oldDir;if(oldKey===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=oldKey;if(oldToken===undefined)delete process.env.TMDB_API_TOKEN;else process.env.TMDB_API_TOKEN=oldToken;await rm(dir,{recursive:true,force:true});}
});
