export type Snapshot<T>={value:T;updated:number};
// Persisted snapshots + bounded memory. Only initial/hard-expired reads wait for the origin.
export function createSnapshotCache<T,C>(options:{
 read:(key:string)=>Promise<Snapshot<T>|null>;write:(key:string,snapshot:Snapshot<T>)=>Promise<void>;
 load:(key:string,context:C)=>Promise<T>;clock?:()=>number;softTtl?:number;hardTtl?:number;maxEntries?:number;
}){
 const clock=options.clock||Date.now,soft=options.softTtl??300000,hard=options.hardTtl??600000,max=options.maxEntries??24;
 const memory=new Map<string,Snapshot<T>>(),reads=new Map<string,Promise<Snapshot<T>|null>>(),refreshes=new Map<string,Promise<T>>(),attempts=new Map<string,number>();
 function remember(key:string,snapshot:Snapshot<T>){
  memory.delete(key);memory.set(key,snapshot);
  while(memory.size>max){const oldest=memory.keys().next().value!;memory.delete(oldest);attempts.delete(oldest);}
 }
 function refresh(key:string,context:C):Promise<T>{
  const existing=refreshes.get(key);if(existing)return existing;
  attempts.set(key,clock());
  const pending=(async()=>{const value=await options.load(key,context);const snapshot={value,updated:clock()};await options.write(key,snapshot);remember(key,snapshot);return value;})();
  refreshes.set(key,pending);pending.then(()=>refreshes.delete(key),()=>refreshes.delete(key));return pending;
 }
 async function get(key:string,context:C):Promise<T>{
  let snapshot=memory.get(key);
  if(!snapshot){
   let pending=reads.get(key);
   if(!pending){pending=options.read(key);reads.set(key,pending);pending.then(()=>reads.delete(key),()=>reads.delete(key));}
   const saved=await pending;if(saved){remember(key,saved);snapshot=saved;}
  }
  if(!snapshot||clock()-snapshot.updated>=hard)return refresh(key,context);
  if(clock()-snapshot.updated>=soft&&clock()-(attempts.get(key)??-Infinity)>=30000)void refresh(key,context).catch(()=>{});
  return snapshot.value;
 }
 return {get,refresh};
}
