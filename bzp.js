// Bauzeitenplan-Ansicht: Daten kommen aus Supabase (nur für Erik freigegeben), nie aus dem Repo.
const BZP_CACHE='bs-bzp-cache';
const bzpNorm=s=>String(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
const BZP_STOP=new Set(['bv','hamburg','haus','und']);
const bzpWords=s=>bzpNorm(s).split(/[^a-z0-9]+/).filter(w=>w&&!BZP_STOP.has(w));
function bzpKeys(name){
  const ws=bzpWords(name),keys=new Set(ws),letters=ws.filter(w=>!/^\d+$/.test(w));
  if(letters.length>1)keys.add(letters.map(w=>w[0]).join(''));               // „Muster-Berg-Weg 6“ -> mbw
  for(const chunk of bzpNorm(name).split(/[\s,\/&]+/)){const p=chunk.split('-').filter(Boolean);if(p.length>1)keys.add(p.map(w=>w[0]).join(''))}
  return keys;
}
// Punkte für Übereinstimmungen; reine Zahlen zählen nur zusammen mit einem Namenstreffer
function bzpScore(toks,keys){let s=0,w=0;
  for(const t of toks){if(keys.has(t)){if(/^\d+$/.test(t))s+=1;else{s+=2;w++}}
    else if(t.length>=4&&[...keys].some(k=>k.length>=4&&(k.startsWith(t)||t.startsWith(k)))){s+=1;w++}}return w?s:0}
// Blatt automatisch zuordnen; null, wenn nicht eindeutig
function bzpMatch(p,sheets){
  const toks=bzpWords(p.name+' '+(p.addr||''));let best=null,bs=0,tie=false;
  for(const sh of sheets){const sc=2*bzpScore(toks,bzpKeys(sh.name))+bzpScore(toks,bzpKeys(sh.title||''));
    if(sc>bs){best=sh;bs=sc;tie=false}else if(sc===bs&&sc>0)tie=true}
  return bs>=3&&!tie?best:null;
}
// Termin: ISO-Datum oder Text wie „16.11. - 20.11.26“ -> {start,end} oder null
function bzpParse(t){
  if(!t)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(t)){const[y,m,d]=t.split('-').map(Number),x=new Date(y,m-1,d);return{start:x,end:x}}
  const ms=[...String(t).matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?/g)].filter(m=>+m[2]>=1&&+m[2]<=12&&+m[1]>=1&&+m[1]<=31);
  if(!ms.length)return null;
  let year=null;for(let i=ms.length-1;i>=0;i--)if(ms[i][3]){year=+ms[i][3];break}
  if(year==null)year=new Date().getFullYear();
  const ds=ms.map(m=>{let y=m[3]?+m[3]:year;if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])});
  let s=ds[0],e=ds[ds.length-1];if(s>e)s=new Date(s.getFullYear()-1,s.getMonth(),s.getDate());
  return{start:s,end:e};
}
// Markiert vergangene Termine und den/die nächsten anstehenden
function bzpClassify(rows,today=new Date()){
  const t0=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const ps=rows.map(r=>bzpParse(r.termin));let next=null;
  for(const p of ps)if(p&&p.end>=t0&&(!next||p.end<next))next=p.end;
  return rows.map((r,i)=>{const p=ps[i];return{...r,past:!!(p&&p.end<t0),next:!!(p&&next&&+p.end===+next)}});
}
const bzpFmt=t=>{if(/^\d{4}-\d{2}-\d{2}$/.test(t||'')){const[y,m,d]=t.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'2-digit'})}return t||'–'};
const bzpStand=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.split('-').reverse().join('.'):(s||'unbekannt');
if(typeof module!=='undefined')module.exports={bzpMatch,bzpParse,bzpClassify,bzpKeys,bzpFmt,bzpStand};

// ---------- Browser ----------
function bzpCache(){try{const c=JSON.parse(localStorage.getItem(BZP_CACHE)||'null');const u=Sync&&Sync.user;return c&&u&&c.uid===u.id?c:null}catch(e){return null}}
function bzpClear(){localStorage.removeItem(BZP_CACHE)}
async function bzpLoad(){ // -> {row, cached, offline, err, nologin}
  const u=Sync&&Sync.user;if(!u)return{nologin:true};
  try{const rows=await Sync.api('/rest/v1/bauzeitenplan?select=stand,data,updated_at&id=eq.1');
    const row=rows&&rows[0]||null;
    if(row)localStorage.setItem(BZP_CACHE,JSON.stringify({uid:u.id,at:Date.now(),row}));else bzpClear();
    return{row}}
  catch(e){const c=bzpCache();
    if(e.status===404||e.status===401||e.status===403){if(e.status!==401)bzpClear();return{row:null,err:e.status===401?'login':null}}
    return c?{row:c.row,cached:c.at,offline:!e.status}:{row:null,offline:!e.status,err:e.message}}
}
function bzpSheetFor(p,row){const sh=row.data.sheets||[];
  return(p.bzpSheet&&sh.find(s=>s.name===p.bzpSheet))||(!p.bzpSheet&&bzpMatch(p,sh))||null}
// Kurzinfo für die Kachel (nur aus dem Gerätespeicher)
function bzpTeaser(p){const c=bzpCache();if(!Sync||!Sync.user)return'Nur nach Anmeldung sichtbar';
  if(!c)return'Termine aus dem Bauzeitenplan';const sh=bzpSheetFor(p,c.row);if(!sh)return'Blatt noch nicht zugeordnet';
  const n=bzpClassify(sh.rows).find(r=>r.next);return n?`Nächster Termin: ${n.firma} · ${bzpFmt(n.termin)}`:`Stand ${bzpStand(c.row.stand)} · keine anstehenden Termine`}
let bzpHidePast=false;
async function bzpView(p,el){
  el.innerHTML='<div class="empty">Lade Bauzeitenplan …</div>';
  const r=await bzpLoad();if(location.hash!=='#/'+p.id+'/plan')return;
  if(r.nologin||r.err==='login'){el.innerHTML=`<div class="card"><p><b>Bauzeitenplan nur nach Anmeldung sichtbar.</b></p>
    <div class="row"><button class="pri" id="bzLogin">Anmelden</button></div></div>`;$('#bzLogin').onclick=()=>Sync.account();return}
  if(!r.row){el.innerHTML=`<div class="card"><p><b>${r.offline?'Keine Verbindung.':'Kein Bauzeitenplan verfügbar.'}</b></p><p class="muted">${r.offline?'Der Bauzeitenplan wurde auf diesem Gerät noch nicht geladen.':'Für dieses Konto ist kein Bauzeitenplan freigegeben oder es wurde noch keiner hochgeladen.'}</p></div>`;return}
  const sheets=r.row.data.sheets||[],sh=bzpSheetFor(p,r.row);
  const head=`<div class="card"><b>Stand: ${bzpStand(r.row.stand||r.row.data.stand)}</b>${sh?`<div class="muted">${sh.title&&bzpNorm(sh.title).includes(bzpNorm(sh.name).replace(/^bv /,''))?esc(sh.title):esc(sh.name)+(sh.title?' · '+esc(sh.title):'')}</div>`:''}
    ${r.cached?`<div class="muted">Offline · zuletzt geladen ${new Date(r.cached).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}</div>`:''}</div>`;
  if(!sh){
    el.innerHTML=head+`<div class="card"><p><b>Welches Blatt gehört zu „${esc(p.name)}“?</b></p><p class="muted">Die Auswahl wird gespeichert.</p>
      ${sheets.map((s,i)=>`<button class="pick" data-i="${i}"><b>${esc(s.name)}</b><span class="muted">${esc(s.title||'')} · ${s.rows.length} Einträge</span></button>`).join('')}</div>`;
    el.querySelectorAll('.pick').forEach(b=>b.onclick=()=>{p.bzpSheet=sheets[+b.dataset.i].name;p.mod=Date.now();save();bzpView(p,el)});
    if(p.bzpSheet)el.insertAdjacentHTML('afterbegin',`<div class="card msg err">Das gewählte Blatt „${esc(p.bzpSheet)}“ gibt es im aktuellen Plan nicht mehr.</div>`);
    return}
  const rows=bzpClassify(sh.rows),lg=sh.legend||{};
  let h=head+`<div class="tools"><button id="bzPast">${bzpHidePast?'Vergangene anzeigen':'Vergangene ausblenden'}</button><button id="bzSheet">Blatt ändern</button></div>`;
  if(!rows.length)h+='<div class="empty">In diesem Blatt stehen noch keine Termine.</div>';
  else{h+='<div class="card bzp">';let last=null;
    for(const x of rows){if(bzpHidePast&&x.past)continue;
      if(x.firma!==last){h+=`<div class="bzf">${esc(x.firma)}</div>`;last=x.firma}
      const st=x.farbe&&lg[x.farbe];
      h+=`<div class="bzr ${x.past?'past':''} ${x.next?'next':''}"><span class="bzl">${esc(x.leistung)}${st?` <i class="chip" style="color:${x.farbe};border-color:${x.farbe}">${esc(st)}</i>`:''}</span>
        <span class="bzt">${x.next?'<small>Nächster Termin</small>':''}${esc(bzpFmt(x.termin))}</span></div>`}
    h+='</div>'}
  el.innerHTML=h;
  $('#bzPast').onclick=()=>{bzpHidePast=!bzpHidePast;bzpView(p,el)};
  $('#bzSheet').onclick=()=>{
    el.innerHTML=head+`<div class="card"><p><b>Blatt wählen</b></p>${sheets.map((s,i)=>`<button class="pick ${s.name===sh.name?'cur':''}" data-i="${i}"><b>${esc(s.name)}</b><span class="muted">${esc(s.title||'')} · ${s.rows.length} Einträge</span></button>`).join('')}
      <button class="pick" data-i="auto"><b>Automatisch zuordnen</b></button></div>`;
    el.querySelectorAll('.pick').forEach(b=>b.onclick=()=>{p.bzpSheet=b.dataset.i==='auto'?'':sheets[+b.dataset.i].name;p.mod=Date.now();save();bzpView(p,el)})};
}
