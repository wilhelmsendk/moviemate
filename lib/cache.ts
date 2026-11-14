// Bounded, per-session single-flight cache. Errors are never cached.
export function createAsyncCache<T>(ttlMs:number,maxEntries=24,clock:()=>number=Date.now){
  const entries=new Map<string,{expires:number;value:Promise<T>}>();
  return {
    get(key:string,loader:()=>Promise<T>):Promise<T>{
      const now=clock(),existing=entries.get(key);
      if(existing&&existing.expires>now)return existing.value;
      if(existing)entries.delete(key);
      for(const [id,e] of entries)if(e.expires<=now)entries.delete(id);
      while(entries.size>=maxEntries)entries.delete(entries.keys().next().value!);
      const entry={expires:now+ttlMs,value:Promise.resolve().then(loader)};
      entries.set(key,entry);
      entry.value.then(()=>{if(entries.get(key)===entry)entry.expires=clock()+ttlMs;},()=>{if(entries.get(key)===entry)entries.delete(key);});
      return entry.value;
    },
    clear(){entries.clear();}
  };
}
