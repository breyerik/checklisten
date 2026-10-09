const C='bs-checklisten-v9';
const F=['./','index.html','style.css','app.js','backup.js','sync.js','bzp.js','preise.js','besuch.js','vendor/jspdf.umd.min.js','config.js','data.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
  // Nur eigene GET-Dateien aus dem Cache, Supabase-Aufrufe immer direkt ans Netz
  if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});
