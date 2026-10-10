const CACHE='english-daily-v3';
importScripts('words.js','dialogues.js');
const SHELL=['./','index.html','words.js','hints.js','dialogues.js','manifest.webmanifest','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png'];
const p3=i=>String(i).padStart(3,'0'),AUDIO=[];
for(const sp of['','_s']){
  WORDS.forEach((_,i)=>AUDIO.push(`audio/w${p3(i)}${sp}.mp3`,`audio/e${p3(i)}${sp}.mp3`));
  SENTENCES.forEach((_,i)=>AUDIO.push(`audio/s${p3(i)}${sp}.mp3`));
  DIALOGUES.forEach((d,i)=>d.l.forEach((_,j)=>AUDIO.push(`audio/d${p3(i)}_${j}${sp}.mp3`)));
}
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  // on upgrade: drop old caches, take control, and reload open pages once (old page versions have no reload hook)
  e.waitUntil(caches.keys().then(async ks=>{
    const old=ks.filter(k=>k!==CACHE);await Promise.all(old.map(k=>caches.delete(k)));await self.clients.claim();
    if(old.length){const cs=await self.clients.matchAll({type:'window'});cs.forEach(c=>{try{c.navigate(c.url)}catch(err){}})}
  }));
});
// download all audio in the background (does not block install/activation; failures are retried next open)
async function cacheAudio(){
  const c=await caches.open(CACHE);
  const missing=[];for(const u of AUDIO)if(!(await c.match(u)))missing.push(u);
  for(let i=0;i<missing.length;i+=6)
    await Promise.allSettled(missing.slice(i,i+6).map(u=>fetch(u).then(r=>r.ok&&c.put(u,r))));
}
self.addEventListener('message',e=>{if(e.data==='cache-audio')e.waitUntil(cacheAudio())});

// Safari needs 206 partial responses for <audio> Range requests
async function rangeResponse(req,res){
  const range=req.headers.get('range');if(!range||!res)return res;
  const buf=await res.arrayBuffer(),m=/bytes=(\d*)-(\d*)/.exec(range),size=buf.byteLength;
  let start=m&&m[1]?+m[1]:0,end=m&&m[2]?+m[2]:size-1;
  if(m&&!m[1]&&m[2]){start=size-+m[2];end=size-1}
  end=Math.min(end,size-1);
  return new Response(buf.slice(start,end+1),{status:206,statusText:'Partial Content',headers:{
    'Content-Type':'audio/mpeg','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
}
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==location.origin)return;
  if(url.pathname.includes('/audio/')){
    e.respondWith(caches.open(CACHE).then(async c=>{
      const key=url.pathname.slice(url.pathname.indexOf('audio/'));
      let hit=await c.match(key);
      if(!hit){try{const r=await fetch(key);if(r.ok){await c.put(key,r.clone());hit=r}else return r}catch(err){return Response.error()}}
      return rangeResponse(e.request,hit);
    }));
    return;
  }
  // app shell: cache first, refresh in background
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreSearch:true}).then(hit=>{
    const net=fetch(e.request).then(r=>{if(r&&r.ok)c.put(e.request,r.clone());return r}).catch(()=>hit||c.match('index.html'));
    return hit||net;
  })));
});
