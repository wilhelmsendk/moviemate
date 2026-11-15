import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdir,readFile,writeFile,link,unlink} from 'node:fs/promises';
import {join} from 'node:path';
export type SealedSecret={v:number;iv:string;tag:string;data:string};
const keys=new Map<string,Promise<Buffer>>();
async function masterKey(create:boolean){
 const dir=process.env.MOVIEMATE_SECRETS_DIR||join(process.cwd(),'data','secrets'),path=join(dir,'master.key');
 if(!keys.has(path)){
  const pending=(async()=>{
   try{const key=await readFile(path);if(key.length!==32)throw Error('invalid key');return key;}
   catch(e){if(!create||(e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('TMDB-nøglen kunne ikke læses. Gem den igen under TMDB-opsætning.');}
   await mkdir(dir,{recursive:true,mode:0o700});const tmp=join(dir,`key-${randomBytes(12).toString('hex')}`);
   try{await writeFile(tmp,randomBytes(32),{mode:0o600,flag:'wx'});try{await link(tmp,path);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}}finally{await unlink(tmp).catch(()=>{});}
   const key=await readFile(path);if(key.length!==32)throw Error('invalid key');return key;
  })();keys.set(path,pending);pending.catch(()=>keys.delete(path));
 }
 return keys.get(path)!;
}
export async function sealSecret(value:string):Promise<SealedSecret>{
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await masterKey(true),iv);
 const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export async function openSecret(value:SealedSecret):Promise<string>{
 try{if(value.v!==1)throw Error('version');const decipher=createDecipheriv('aes-256-gcm',await masterKey(false),Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8');}
 catch{throw Error('TMDB-nøglen kunne ikke læses. Gem den igen under TMDB-opsætning.');}
}
