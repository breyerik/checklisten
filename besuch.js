// Besuchsprotokolle pro Bauvorhaben: Einträge mit Fotos, offline in IndexedDB, Upload nach Supabase,
// PDF-Protokoll im Browser (jsPDF, liegt in vendor/). Jeder Nutzer sieht nur seine eigenen Besuche.
const BE_ART={mangel:'Mangel',nachtrag:'Nachtrag',technik:'Technische Frage'};
const BE_ARTS={mangel:'Mängel',nachtrag:'Nachträge',technik:'Technische Fragen'};
const BE_ORDER=['mangel','nachtrag','technik'];
const BE_VON={bauherr:'Bauherr',firma:'Firma',wir:'wir'};
const BE_FIELDS=['art','gewerk','firma','stelle','beschreibung','frist','menge','einheit','angefordert_von','bauherr_zahlt','dringend','pos'];
const beDate=s=>/^\d{4}-\d{2}-\d{2}/.test(s||'')?s.slice(0,10).split('-').reverse().join('.'):(s||'');
const beDT=s=>s?new Date(s).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' Uhr':'';
const beToday=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
// Einträge gruppiert nach Art, dann Firma (alphabetisch, ohne Firma zuletzt), dann Reihenfolge der Erfassung
function beGroups(entries){
  const by=(a,b)=>(a.pos||0)-(b.pos||0)||String(a.created_at||'').localeCompare(String(b.created_at||''));
  return BE_ORDER.map(art=>{const es=entries.filter(e=>e.art===art);const fs=new Map();
    for(const e of es.sort(by)){const f=(e.firma||'').trim();if(!fs.has(f))fs.set(f,[]);fs.get(f).push(e)}
    const firmen=[...fs.keys()].sort((a,b)=>!a?1:!b?-1:a.localeCompare(b,'de',{sensitivity:'base'}));
    return{art,title:BE_ARTS[art],firmen:firmen.map(f=>({firma:f,entries:fs.get(f)}))}}).filter(g=>g.firmen.length)}
// Felder eines Eintrags als [Bezeichnung, Wert] (nur gefüllte, passend zur Art)
function beFields(e){const r=[['Art',BE_ART[e.art]||e.art],['Gewerk',e.gewerk],['Firma',e.firma],['Stelle',e.stelle]];
  if(e.art==='mangel')r.push(['Frist',e.frist?beDate(e.frist):'']);
  if(e.art==='nachtrag'){r.push(['Menge',[e.menge,e.einheit].filter(Boolean).join(' ')],['Angefordert von',BE_VON[e.angefordert_von]||''],['Bauherr zahlt',e.bauherr_zahlt||'offen'])}
  if(e.art==='technik')r.push(['Dringend',e.dringend?'ja':'nein']);
  return r.filter(x=>x[1]!=null&&String(x[1]).trim()!=='')}
const beSlug=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,60)||'BV';
const beFileName=(bv,datum)=>`Besuchsprotokoll_${beSlug(bv)}_${datum||beToday()}.pdf`;
// Nur Zeichen, die die PDF-Standardschrift (WinAnsi) darstellen kann
const BE_WIN='€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const beAnsi=s=>String(s??'').replace(/\r\n?/g,'\n').replace(/[\u2010-\u2012]/g,'-').replace(/\u2212/g,'-').replace(/[\u00a0\u2007\u202f]/g,' ')
  .replace(/[^\n\x20-\x7e\xa0-\xff]/gu,c=>BE_WIN.includes(c)?c:'?');
// PDF bauen (J = jsPDF-Konstruktor). v: Besuch, entries: Einträge, fotos: {eintrag_id:[{data}]}, user: E-Mail
function bePdf(J,v,entries,fotos,user){
  const doc=new J({unit:'mm',format:'a4',compress:true}),W=210,H=297,M=15,CW=W-2*M,BOT=H-16;let y=M;
  const need=h=>{if(y+h>BOT){doc.addPage();y=M}};
  const text=(t,{size=10,bold=false,color=[17,17,17],indent=0,gap=1.2}={})=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
    const lh=size*0.3528*1.25;for(const l of doc.splitTextToSize(beAnsi(t),CW-indent)){need(lh);doc.text(l,M+indent,y+lh*0.8);y+=lh}y+=gap};
  const field=(k,val,indent)=>{doc.setFont('helvetica','bold');doc.setFontSize(10);const kw=doc.getTextWidth(beAnsi(k)+': ');
    doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(beAnsi(val),CW-indent-kw),lh=4.4;
    lines.forEach((l,i)=>{need(lh);if(!i){doc.setFont('helvetica','bold');doc.setTextColor(80,80,80);doc.text(beAnsi(k)+':',M+indent,y+lh*0.8)}
      doc.setFont('helvetica','normal');doc.setTextColor(17,17,17);doc.text(l,M+indent+kw,y+lh*0.8);y+=lh});y+=0.6};
  const measure=(k,val,indent)=>{doc.setFont('helvetica','bold');doc.setFontSize(10);const kw=doc.getTextWidth(beAnsi(k)+': ');doc.setFont('helvetica','normal');
    return doc.splitTextToSize(beAnsi(val),CW-indent-kw).length*4.4+0.6};
  const n={mangel:0,nachtrag:0,technik:0};entries.forEach(e=>n[e.art]!=null&&n[e.art]++);
  text('Besuchsprotokoll',{size:20,bold:true,color:[31,78,121],gap:2});
  field('Bauvorhaben',v.bv,0);field('Datum',beDate(v.datum),0);if(user)field('Erstellt von',user,0);
  field('Abgeschlossen',v.status==='fertig'&&v.fertig_at?beDT(v.fertig_at):'noch nicht abgeschlossen',0);
  field('Einträge',entries.length?BE_ORDER.filter(a=>n[a]).map(a=>`${n[a]} ${n[a]===1?BE_ART[a]:BE_ARTS[a]}`).join(', '):'keine',0);
  if(v.fotos_geloescht_at)field('Hinweis','Die Fotos dieses Besuchs wurden am '+beDT(v.fotos_geloescht_at)+' gelöscht.',0);
  doc.setDrawColor(31,78,121);doc.setLineWidth(0.5);doc.line(M,y+1,W-M,y+1);y+=5;
  const cw=(CW-8)/2,mh=72,MAXH=BOT-M-2;
  // Höhe von Text + erster Fotoreihe, damit Überschriften/Text nicht allein am Seitenende stehen
  const prep=e=>{const fl=beFields(e).filter(([k])=>k!=='Art');
    if(e.beschreibung)fl.push([e.art==='technik'?'Frage':e.art==='nachtrag'?'Leistung':'Beschreibung',e.beschreibung]);
    const ps=fotos[e.id]||[];let est=8,rh=0;for(const[k,val]of fl)est+=measure(k,val,4);
    for(const p of ps.slice(0,2))if(p.data)try{const pr=doc.getImageProperties('data:image/jpeg;base64,'+p.data);rh=Math.max(rh,pr.height*Math.min(cw/pr.width,mh/pr.height))}catch(err){}
    return{fl,ps,est:Math.min(est+(rh?rh+3:0),MAXH)}};
  let nr=0;
  for(const g of beGroups(entries.slice())){
    need(Math.min(19+prep(g.firmen[0].entries[0]).est,MAXH));doc.setFillColor(232,238,245);doc.rect(M,y,CW,8,'F');doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(31,78,121);
    doc.text(beAnsi(g.title),M+2,y+5.6);y+=11;
    for(const f of g.firmen){need(Math.min(8+prep(f.entries[0]).est,MAXH));text(f.firma?'Firma: '+f.firma:'Ohne Firma',{size:12,bold:true,gap:1.5});
      for(const e of f.entries){nr++;
        const title=`${nr}. ${[e.gewerk,e.stelle].filter(Boolean).join(' – ')||BE_ART[e.art]}`,{fl,ps,est}=prep(e);let col=0,rowH=0;
        need(est);
        text(title,{size:11,bold:true,indent:2,gap:0.8});
        for(const[k,val]of fl)field(k,val,4);
        for(const p of ps){if(!p.data){text('(Foto nicht verfügbar)',{size:9,color:[150,0,0],indent:4});continue}
          let pr;try{pr=doc.getImageProperties('data:image/jpeg;base64,'+p.data)}catch(err){continue}
          const s=Math.min(cw/pr.width,mh/pr.height),w=pr.width*s,h=pr.height*s;
          if(col===0){need(h+3);rowH=0}
          doc.addImage('data:image/jpeg;base64,'+p.data,'JPEG',M+4+col*(cw+2),y+1,w,h,p.id||undefined,'NONE');rowH=Math.max(rowH,h);
          if(++col===2){y+=rowH+3;col=0}}
        if(col)y+=rowH+3;
        doc.setDrawColor(220,220,220);doc.setLineWidth(0.2);need(4);doc.line(M+2,y+1,W-M,y+1);y+=4}}}
  if(!entries.length)text('Keine Einträge.',{size:11});
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120,120,120);
    doc.text(beAnsi(`Besuchsprotokoll · ${v.bv} · ${beDate(v.datum)}`),M,H-8);doc.text(`Seite ${i} von ${pages}`,W-M,H-8,{align:'right'})}
  return doc;
}
if(typeof module!=='undefined')module.exports={beGroups,beFields,beFileName,beAnsi,bePdf,beDate,BE_ART};

// ---------- Browser: lokale Datenbank (IndexedDB) ----------
const BeDB=typeof window==='undefined'?null:(()=>{
  let dbp;const S=['besuche','eintraege','fotos','tomb'];
  const open=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open('bs-besuche',1);
    r.onupgradeneeded=()=>{const d=r.result;
      d.createObjectStore('besuche',{keyPath:'id'}).createIndex('uid','uid');
      const e=d.createObjectStore('eintraege',{keyPath:'id'});e.createIndex('uid','uid');e.createIndex('besuch','besuch_id');
      const f=d.createObjectStore('fotos',{keyPath:'id'});f.createIndex('uid','uid');f.createIndex('eintrag','eintrag_id');f.createIndex('besuch','besuch_id');
      d.createObjectStore('tomb',{keyPath:'id'}).createIndex('uid','uid')};
    r.onsuccess=()=>res(r.result);r.onerror=()=>{dbp=null;rej(r.error)}}));
  const rq=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  async function all(s,ix,key){const d=await open();return rq(d.transaction(s).objectStore(s).index(ix).getAll(key))}
  async function get(s,id){const d=await open();return rq(d.transaction(s).objectStore(s).get(id))}
  // fn(stores) läuft synchron in EINER Schreib-Transaktion über alle Tabellen; Lesen per Callback
  async function tx(fn){const d=await open();return new Promise((res,rej)=>{const t=d.transaction(S,'readwrite'),o={};S.forEach(s=>o[s]=t.objectStore(s));
    let out;try{out=fn(o,t)}catch(e){t.abort();rej(e);return}t.oncomplete=()=>res(out);t.onerror=t.onabort=()=>rej(t.error)})}
  return{all,get,tx,S};
})();

// ---------- Browser: Abgleich mit Supabase ----------
const BE=typeof window==='undefined'?null:(()=>{
  let running=false,again=false,timer=null,state='idle',err='',lastClean=0;const subs=new Set();
  const uid=()=>Sync&&Sync.user&&Sync.user.id;
  const emit=changed=>subs.forEach(f=>{try{f(changed)}catch(e){}});
  const off=e=>!navigator.onLine||e instanceof TypeError;
  async function pending(u,bid){u=u||uid();if(!u)return 0;
    const[b,e,f,t]=await Promise.all(BeDB.S.map(s=>BeDB.all(s,'uid',u)));
    const m=x=>!bid||x.besuch_id===bid;
    return b.filter(x=>(!bid||x.id===bid)&&(x.dirty||x.wantFertig)).length+e.filter(x=>x.dirty&&m(x)).length+f.filter(x=>x.dirty&&m(x)).length+t.filter(m).length}
  // nach erfolgreichem Upload: sauber markieren, wenn inzwischen nicht erneut geändert
  const clean=(s,id,rev,extra={})=>BeDB.tx(o=>{const r=o[s].get(id);r.onsuccess=()=>{const x=r.result;if(x&&x.rev===rev)o[s].put({...x,...extra,dirty:0,srv:1});else if(x)o[s].put({...x,srv:1})}});
  const pick=(x,ks)=>Object.fromEntries(ks.map(k=>[k,x[k]===undefined?null:x[k]]));
  async function push(u){
    const api=Sync.api,P=pref=>({Prefer:pref});let fails=0;
    const tryIt=async f=>{try{await f()}catch(e){if(off(e)||!e.status||e.status===401)throw e;fails++;err=e.message}};
    for(const t of await BeDB.all('tomb','uid',u))await tryIt(async()=>{
      await api(`/rest/v1/${t.table}?id=eq.${t.id}`,{method:'DELETE',headers:P('return=minimal')});await BeDB.tx(o=>o.tomb.delete(t.id))});
    const bs=await BeDB.all('besuche','uid',u),es=await BeDB.all('eintraege','uid',u),fs=await BeDB.all('fotos','uid',u);
    for(const b of bs.filter(x=>x.dirty))await tryIt(async()=>{
      await api('/rest/v1/besuche?on_conflict=id',{method:'POST',headers:P('resolution=merge-duplicates,return=minimal'),body:{...pick(b,['id','projekt_id','bv','datum']),user_id:u}});
      await clean('besuche',b.id,b.rev)});
    for(const e of es.filter(x=>x.dirty))await tryIt(async()=>{
      await api('/rest/v1/besuch_eintraege?on_conflict=id',{method:'POST',headers:P('resolution=merge-duplicates,return=minimal'),body:{...pick(e,['id','besuch_id',...BE_FIELDS]),user_id:u}});
      await clean('eintraege',e.id,e.rev)});
    for(const f of fs.filter(x=>x.dirty&&x.data))await tryIt(async()=>{
      await api('/rest/v1/besuch_fotos?on_conflict=id',{method:'POST',headers:P('resolution=ignore-duplicates,return=minimal'),body:{...pick(f,['id','eintrag_id','pos','data']),user_id:u}});
      await clean('fotos',f.id,f.rev)});
    // „Fertig“ erst, wenn zu diesem Besuch nichts mehr aussteht
    for(const b of (await BeDB.all('besuche','uid',u)).filter(x=>x.wantFertig&&!x.dirty))if(await pending(u,b.id)===1)await tryIt(async()=>{
      const r=await api(`/rest/v1/besuche?id=eq.${b.id}`,{method:'PATCH',headers:P('return=representation'),body:{status:'fertig'}});
      const row=r&&r[0];if(!row)throw Object.assign(new Error('Besuch nicht gefunden'),{status:404});
      await BeDB.tx(o=>{const q=o.besuche.get(b.id);q.onsuccess=()=>q.result&&o.besuche.put({...q.result,status:row.status,fertig_at:row.fertig_at,wantFertig:false})})});
    return fails;
  }
  // Serverstand übernehmen: Server gewinnt bei Status/Zeitstempeln; lokale, noch nicht hochgeladene Änderungen bleiben
  async function pull(u){
    const api=Sync.api;
    const[bs,es,fs]=await Promise.all([
      api(`/rest/v1/besuche?select=id,projekt_id,bv,datum,status,created_at,fertig_at,fotos_geloescht_at&user_id=eq.${u}`),
      api(`/rest/v1/besuch_eintraege?select=id,besuch_id,${BE_FIELDS.join(',')},created_at&user_id=eq.${u}`),
      api(`/rest/v1/besuch_fotos?select=id,eintrag_id,pos&user_id=eq.${u}`)]);
    return BeDB.tx(o=>{let changed=false;const ix=(s,cb)=>{const r=o[s].index('uid').getAll(u);r.onsuccess=()=>cb(r.result)};
      ix('besuche',lb=>ix('eintraege',le=>ix('fotos',lf=>ix('tomb',lt=>{const gone=new Set(lt.map(t=>t.id));
        const sync=(store,local,remote,merge)=>{const lm=new Map(local.map(x=>[x.id,x])),rs=new Set();
          for(const r of remote){rs.add(r.id);if(gone.has(r.id))continue;const l=lm.get(r.id),n=merge(l,r);
            if(n&&JSON.stringify(n)!==JSON.stringify(l)){o[store].put(n);changed=true}}
          for(const l of local)if(l.srv&&!l.dirty&&!rs.has(l.id)){o[store].delete(l.id);changed=true}};
        sync('besuche',lb,bs,(l,r)=>{const srv={status:r.status,fertig_at:r.fertig_at,fotos_geloescht_at:r.fotos_geloescht_at};
          if(!l)return{...r,uid:u,dirty:0,rev:0,srv:1};
          return l.dirty?{...l,...srv,srv:1,wantFertig:r.status==='fertig'?false:l.wantFertig}:{...l,...r,srv:1,wantFertig:r.status==='fertig'?false:l.wantFertig}});
        sync('eintraege',le,es,(l,r)=>!l?{...r,uid:u,dirty:0,rev:0,srv:1}:l.dirty?null:{...l,...r,srv:1});
        const eb=new Map([...le,...es].map(e=>[e.id,e.besuch_id]));
        sync('fotos',lf,fs,(l,r)=>!l?{...r,besuch_id:eb.get(r.eintrag_id),uid:u,data:null,dirty:0,rev:0,srv:1}:l.dirty?null:{...l,pos:r.pos,srv:1});
      }))));return()=>changed}).then(f=>f());
  }
  async function run(){
    const u=uid();if(!u||!BeDB)return;if(running){again=true;return}running=true;let changed=false;
    try{
      if(!navigator.onLine){set('offline');return}
      set('busy');const before=await pending(u);
      const fails=await push(u);
      if(Date.now()-lastClean>30*60000){lastClean=Date.now();try{await Sync.api('/rest/v1/rpc/besuch_fotos_aufraeumen',{method:'POST',body:{}})}catch(e){if(off(e))throw e}}
      changed=await pull(u)||before!==await pending(u);
      set(fails?'err':'ok',fails?err:'');
    }catch(e){if(off(e))set('offline');else set('err',e.message)}
    finally{running=false;emit(changed);if(again){again=false;kick(50)}}
  }
  function set(s,e=''){state=s;err=e;emit(false)}
  function kick(ms=400){clearTimeout(timer);timer=setTimeout(run,ms)}
  // Fotos nachladen, die auf diesem Gerät fehlen (z. B. auf dem anderen Gerät aufgenommen)
  async function ensureFotos(list){const miss=list.filter(f=>!f.data&&f.srv);if(!miss.length||!navigator.onLine||!uid())return list;
    for(let i=0;i<miss.length;i+=8){const ids=miss.slice(i,i+8).map(f=>f.id);let rows;
      try{rows=await Sync.api(`/rest/v1/besuch_fotos?select=id,data&id=in.(${ids.join(',')})`)}catch(e){break}
      await BeDB.tx(o=>{for(const r of rows){const q=o.fotos.get(r.id);q.onsuccess=()=>q.result&&o.fotos.put({...q.result,data:r.data})}});
      for(const r of rows){const f=list.find(x=>x.id===r.id);if(f)f.data=r.data}}
    return list}
  if(typeof window!=='undefined'){
    addEventListener('online',()=>kick(200));addEventListener('offline',()=>set('offline'));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')kick(300)});
    setInterval(async()=>{if(document.visibilityState==='visible'&&navigator.onLine&&uid()&&await pending())run()},30000);
  }
  return{run,kick,pending,ensureFotos,on:f=>subs.add(f),off:f=>subs.delete(f),get state(){return state},get err(){return err}};
})();

// ---------- Browser: Ansichten ----------
const beUuid=()=>crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
const beE=s=>esc(String(s??''));
const beHash=()=>location.hash;
function beLoginCard(el,what){el.innerHTML=`<div class="card"><p><b>${what} nur nach Anmeldung verfügbar.</b></p><p class="muted">Jeder sieht nur seine eigenen Besuche.</p>
  <div class="row"><button class="pri" id="beLogin">Anmelden</button></div></div>`;$('#beLogin').onclick=()=>Sync.account()}
async function beVisitsFor(pid){const u=Sync.user.id;return(await BeDB.all('besuche','uid',u)).filter(b=>b.projekt_id===pid).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))}
const beStatus=b=>b.status==='fertig'?['fertig','fertig']:b.wantFertig?['wartet','wird abgeschlossen']:['offen','offen'];
// Kachel-Text auf der Bauvorhaben-Übersicht
async function beTeaser(p,el){if(!Sync||!Sync.user||!BeDB){el.textContent='Nur nach Anmeldung verfügbar';return}
  try{const vs=await beVisitsFor(p.id),o=vs.filter(v=>v.status!=='fertig').length;
    el.textContent=vs.length?`${vs.length} ${vs.length===1?'Besuch':'Besuche'}${o?` · ${o} offen`:''}`:'Besuchsprotokolle mit Fotos'}catch(e){}}
// Statuszeile „x noch nicht hochgeladen“
async function beStat(bid){const el=$('#beStat');if(!el)return;const n=await BE.pending(null,bid),s=BE.state;
  const t=n?`⏳ ${n} noch nicht hochgeladen`+(s==='offline'||!navigator.onLine?' · offline, wird später übertragen':s==='err'?' · Fehler: '+beE(BE.err)+' (tippen zum Wiederholen)':s==='busy'?' · wird hochgeladen …':'')
    :s==='err'?'Fehler: '+beE(BE.err)+' (tippen zum Wiederholen)':'✓ Alles hochgeladen';
  el.className='bestat '+(n||s==='err'?(s==='err'?'err':'wait'):'ok');el.innerHTML=t;el.onclick=()=>BE.run()}
let beSubView=null;
BE&&BE.on(changed=>{beStat(beSubView&&beSubView.bid);if(changed&&beSubView&&beHash()===beSubView.h&&!$('#beForm'))beSubView.draw()});

async function beList(p,el){
  $('#title').textContent=p.name;backTo('‹ Übersicht','#/'+p.id);
  if(!Sync||!Sync.user||!BeDB)return beLoginCard(el,'Besuche');
  const h=beHash(),draw=async()=>{
    const u=Sync.user.id,vs=await beVisitsFor(p.id),es=await BeDB.all('eintraege','uid',u),fs=await BeDB.all('fotos','uid',u);if(beHash()!==h)return;
    let x=`<div class="row" style="margin:0 0 10px"><button class="pri" id="beNew">+ Neuer Besuch</button></div><div id="beStat" class="bestat"></div>`;
    if(!vs.length)x+='<div class="empty">Noch kein Besuch angelegt.<br>Tippe auf „+ Neuer Besuch“, wenn du auf der Baustelle bist.</div>';
    for(const v of vs){const n=es.filter(e=>e.besuch_id===v.id).length,nf=fs.filter(f=>f.besuch_id===v.id).length,[c,l]=beStatus(v);
      x+=`<a class="card bev" href="#/${p.id}/besuch/${v.id}"><span class="tx"><b>Besuch vom ${beDate(v.datum)}</b>
        <span class="muted">${n} ${n===1?'Eintrag':'Einträge'}${nf?` · ${nf} ${nf===1?'Foto':'Fotos'}`:''}${v.created_at?' · '+new Date(v.created_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+' Uhr':''}</span></span>
        <span class="chip st ${c}">${l}</span><span class="chev">›</span></a>`}
    el.innerHTML=x;beStat(null);
    $('#beNew').onclick=async()=>{const open=vs.find(v=>v.status!=='fertig'&&!v.wantFertig);
      if(open&&!confirm(`Es gibt noch einen offenen Besuch vom ${beDate(open.datum)}.\n\nTrotzdem einen neuen Besuch anlegen?`)){location.hash=`#/${p.id}/besuch/${open.id}`;return}
      const v={id:beUuid(),uid:Sync.user.id,projekt_id:p.id,bv:p.name,datum:beToday(),status:'offen',created_at:new Date().toISOString(),dirty:1,rev:1,srv:0};
      await BeDB.tx(o=>o.besuche.put(v));BE.kick();location.hash=`#/${p.id}/besuch/${v.id}`}};
  beSubView={h,bid:null,draw};el.innerHTML='<div class="empty">Lade Besuche …</div>';await draw();BE.kick(100);
}

async function beVisit(p,bid,el){
  $('#title').textContent=p.name;backTo('‹ Besuche','#/'+p.id+'/besuche');
  if(!Sync||!Sync.user||!BeDB)return beLoginCard(el,'Besuche');
  const h=beHash(),draw=async()=>{
    const v=await BeDB.get('besuche',bid);if(beHash()!==h)return;
    if(!v||v.uid!==Sync.user.id){el.innerHTML='<div class="empty">Dieser Besuch ist auf diesem Gerät nicht vorhanden.</div>';return}
    const es=(await BeDB.all('eintraege','besuch',bid)),fs=await BeDB.all('fotos','besuch',bid);if(beHash()!==h)return;
    const open=v.status!=='fertig'&&!v.wantFertig,[c,l]=beStatus(v);
    let x=`<div class="card"><div class="bevh"><b>Besuch vom ${beDate(v.datum)}</b><span class="chip st ${c}">${l}</span></div>
      <div class="muted">${beE(v.bv)}${v.fertig_at?' · abgeschlossen '+beDT(v.fertig_at):''}</div>
      ${v.wantFertig?'<div class="msg">Wird abgeschlossen, sobald alles hochgeladen ist.</div>':''}
      ${v.fotos_geloescht_at?`<div class="muted">Fotos wurden am ${beDT(v.fotos_geloescht_at)} gelöscht, das PDF enthält nur noch die Texte.</div>`:''}</div>
      <div id="beStat" class="bestat"></div>`;
    if(open)x+=`<div class="row" style="margin:0 0 10px"><button class="pri" id="beAdd">+ Eintrag</button></div>`;
    if(!es.length)x+=`<div class="empty">${open?'Noch keine Einträge.<br>Tippe auf „+ Eintrag“ für einen Mangel, Nachtrag oder eine technische Frage.':'Keine Einträge.'}</div>`;
    for(const g of beGroups(es.slice())){x+=`<div class="beg">${g.title}</div>`;
      for(const f of g.firmen)for(const e of f.entries){const ps=fs.filter(q=>q.eintrag_id===e.id).sort((a,b)=>a.pos-b.pos);
        const meta=beFields(e).filter(([k])=>!['Art','Gewerk','Firma'].includes(k)).map(([k,val])=>`${k}: ${beE(val)}`).join(' · ');
        x+=`<${open?`a href="#/${p.id}/besuch/${bid}/e/${e.id}"`:'div'} class="card bee ${e.art}">
          <div class="beet"><span class="chip art ${e.art}">${BE_ART[e.art]}</span><b>${beE([e.gewerk,e.firma].filter(Boolean).join(' · ')||'–')}</b>${e.dirty?'<span class="muted" title="noch nicht hochgeladen">⏳</span>':''}</div>
          ${meta?`<div class="muted">${meta}</div>`:''}${e.beschreibung?`<div class="bed">${beE(e.beschreibung)}</div>`:''}
          ${ps.length?`<div class="thumbs">${ps.map(q=>q.data?`<img src="data:image/jpeg;base64,${q.data}" alt="">`:'<span class="thx">📷</span>').join('')}</div>`:''}</${open?'a':'div'}>`}}
    if(open)x+=`<div class="row"><button class="pri fertig" id="beDone">✓ Besuch abschließen (Fertig)</button></div>
      <div class="row"><button class="del" id="beDelV">Besuch löschen</button></div>`;
    else x+=`<div class="row"><button class="pri" id="bePdf">📄 PDF-Protokoll teilen / herunterladen</button></div>
      ${v.wantFertig?'<div class="row"><button class="sec" id="beUndo">Abschluss zurücknehmen</button></div>':''}`;
    el.innerHTML=x;beStat(bid);
    const on=(s,f)=>{const b=$(s);if(b)b.onclick=f};
    on('#beAdd',()=>{location.hash=`#/${p.id}/besuch/${bid}/e/neu`});
    on('#beDone',async()=>{if(!confirm(es.length?`Besuch mit ${es.length} ${es.length===1?'Eintrag':'Einträgen'} abschließen?\n\nDanach können keine Einträge mehr geändert werden.`:'Der Besuch hat keine Einträge. Trotzdem abschließen?'))return;
      await BeDB.tx(o=>{const q=o.besuche.get(bid);q.onsuccess=()=>o.besuche.put({...q.result,wantFertig:true})});await draw();BE.run()});
    on('#beUndo',async()=>{await BeDB.tx(o=>{const q=o.besuche.get(bid);q.onsuccess=()=>q.result.status!=='fertig'&&o.besuche.put({...q.result,wantFertig:false})});draw()});
    on('#beDelV',async()=>{if(!confirm(`Besuch vom ${beDate(v.datum)} mit ${es.length} ${es.length===1?'Eintrag':'Einträgen'} wirklich löschen?`))return;
      await BeDB.tx(o=>{for(const f of fs)o.fotos.delete(f.id);for(const e of es)o.eintraege.delete(e.id);o.besuche.delete(bid);
        if(v.srv)o.tomb.put({id:bid,table:'besuche',uid:v.uid,besuch_id:bid})});BE.kick();location.hash='#/'+p.id+'/besuche'});
    on('#bePdf',()=>beSharePdf(v,es,fs,$('#bePdf')))};
  beSubView={h,bid,draw};el.innerHTML='<div class="empty">Lade Besuch …</div>';await draw();BE.kick(100);
}

let bePdfLib=null;
const beLoadPdf=()=>bePdfLib||(bePdfLib=new Promise((res,rej)=>{if(window.jspdf)return res(window.jspdf.jsPDF);
  const s=document.createElement('script');s.src='vendor/jspdf.umd.min.js';s.onload=()=>res(window.jspdf.jsPDF);s.onerror=()=>{bePdfLib=null;rej(new Error('PDF-Bibliothek konnte nicht geladen werden'))};document.head.appendChild(s)}));
async function beSharePdf(v,es,fs,btn){
  const t=btn.textContent;btn.disabled=true;btn.textContent='PDF wird erstellt …';let blob,name=beFileName(v.bv,v.datum);
  try{const J=await beLoadPdf();await BE.ensureFotos(fs);const by={};
    for(const f of fs.slice().sort((a,b)=>a.pos-b.pos))(by[f.eintrag_id]=by[f.eintrag_id]||[]).push(f);
    blob=bePdf(J,v,es,by,Sync.user&&Sync.user.email).output('blob')}
  catch(e){alert('Das PDF konnte nicht erstellt werden: '+e.message);return}
  finally{btn.disabled=false;btn.textContent=t}
  const file=new File([blob],name,{type:'application/pdf'});
  const dl=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)};
  let can=false;try{can=!!(navigator.canShare&&navigator.canShare({files:[file]}))}catch(e){}
  if(!can){dl();return}
  // Teilen braucht einen frischen Tipp (iOS), daher kurzer Dialog
  let d=$('#bePdfDlg');if(!d){d=document.createElement('dialog');d.id='bePdfDlg';document.body.appendChild(d)}
  d.innerHTML=`<h2>PDF-Protokoll</h2><p class="muted">${beE(name)} · ${Math.max(1,Math.round(blob.size/1024))} KB</p>
    <div class="row"><button class="pri" id="bpShare">Teilen …</button></div><div class="row"><button class="sec" id="bpDl">Herunterladen</button><button class="sec" id="bpX">Schließen</button></div>`;
  d.querySelector('#bpShare').onclick=async()=>{try{await navigator.share({files:[file],title:name})}catch(e){if(e.name!=='AbortError')dl()}d.close()};
  d.querySelector('#bpDl').onclick=()=>{dl();d.close()};d.querySelector('#bpX').onclick=()=>d.close();d.showModal();
}

// Foto verkleinern: lange Seite max. 1600 px, JPEG-Qualität 0,7 -> Base64 ohne Präfix
async function beCompress(file,max=1600,q=0.7){
  const url=URL.createObjectURL(file);
  try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Bild konnte nicht gelesen werden'));i.src=url});
    const s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*s)),h=Math.max(1,Math.round(img.naturalHeight*s));
    const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(img,0,0,w,h);
    const d=c.toDataURL('image/jpeg',q);c.width=c.height=0;return{data:d.slice(d.indexOf(',')+1),w,h}}
  finally{URL.revokeObjectURL(url)}}

async function beEntry(p,bid,eid,el){
  const isNew=eid==='neu';$('#title').textContent=isNew?'Neuer Eintrag':'Eintrag bearbeiten';
  const back='#/'+p.id+'/besuch/'+bid;
  if(!Sync||!Sync.user||!BeDB)return beLoginCard(el,'Besuche');
  const h=beHash(),u=Sync.user.id,v=await BeDB.get('besuche',bid);
  if(!v||v.uid!==u){el.innerHTML='<div class="empty">Dieser Besuch ist auf diesem Gerät nicht vorhanden.</div>';backTo('‹ Besuch',back);return}
  if(v.status==='fertig'||v.wantFertig){location.replace(back);return}
  const old=isNew?null:await BeDB.get('eintraege',eid);
  if(!isNew&&!old){location.replace(back);return}
  const allE=await BeDB.all('eintraege','uid',u),siblings=allE.filter(e=>e.besuch_id===bid);
  let fotos=old?(await BeDB.all('fotos','eintrag',eid)).sort((a,b)=>a.pos-b.pos):[];const removed=[];
  if(beHash()!==h)return;
  // Vorschläge: Firmen aus dem Bauzeitenplan dieses BV (nur Erik) + bisher verwendete; Gewerke aus Preisdatenbank + bisher verwendete
  const uniq=a=>[...new Set(a.map(s=>String(s||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
  let planF=[];try{const c=bzpCache(),sh=c&&bzpSheetFor(p,c.row);if(sh)planF=sh.rows.map(r=>r.firma)}catch(e){}
  let prG=[];try{const c=prCache();if(c)prG=prRows(c.row.data).map(r=>r.gewerk)}catch(e){}
  const bvIds=new Set((await beVisitsFor(p.id)).map(x=>x.id));
  const firmen=uniq([...planF,...allE.filter(e=>bvIds.has(e.besuch_id)).map(e=>e.firma)]);
  const gewerke=uniq([...prG,...allE.map(e=>e.gewerk)]);
  const art=old?old.art:(siblings.slice().sort((a,b)=>b.pos-a.pos)[0]||{}).art||'mangel';
  const opt=(o,cur)=>Object.entries(o).map(([k,l])=>`<option value="${k}"${k===cur?' selected':''}>${l}</option>`).join('');
  el.innerHTML=`<form id="beForm" class="beform" novalidate>
    <div class="seg">${BE_ORDER.map(a=>`<label><input type="radio" name="art" value="${a}"${a===art?' checked':''}><span>${BE_ART[a]}</span></label>`).join('')}</div>
    <div class="card">
    <label>Gewerk<input name="gewerk" list="beGw" autocomplete="off" placeholder="z. B. Trockenbau"></label>
    <label>Firma${planF.length?' <span class="muted">(Vorschläge aus dem Bauzeitenplan)</span>':''}<input name="firma" list="beFi" autocomplete="off"></label>
    <label>Stelle<input name="stelle" autocomplete="off" placeholder="Haus, Geschoss, Raum oder Bauteil"></label>
    <label><span id="beBl">Beschreibung</span><textarea name="beschreibung" rows="4" placeholder="Tippen oder über das Mikrofon der Tastatur diktieren"></textarea></label>
    <div class="bx" data-art="mangel"><label>Frist (optional)<input type="date" name="frist"></label></div>
    <div class="bx" data-art="nachtrag"><div class="two"><label>Menge (optional)<input name="menge" inputmode="decimal" autocomplete="off"></label>
      <label>Einheit<input name="einheit" list="beEh" autocomplete="off"></label></div>
      <label>Angefordert von<select name="angefordert_von"><option value="">–</option>${opt(BE_VON,old&&old.angefordert_von)}</select></label>
      <label>Bauherr zahlt<select name="bauherr_zahlt">${opt({offen:'offen',ja:'ja',nein:'nein'},(old&&old.bauherr_zahlt)||'offen')}</select></label></div>
    <div class="bx" data-art="technik"><label class="chk"><input type="checkbox" name="dringend"> Dringend – die Baustelle hängt davon ab</label></div>
    </div>
    <div class="card"><b>Fotos</b><div id="beTh" class="thumbs edit"></div>
      <label class="addfoto">📷 Fotos hinzufügen<input type="file" id="beFile" accept="image/*" multiple></label><div class="muted" id="beFm">Kamera oder Mediathek, auch mehrere auf einmal (z. B. Screenshots aus Notability).</div></div>
    <p class="msg err" id="beErr"></p>
    <div class="row"><button type="button" class="sec" id="beCancel">Abbrechen</button><button type="submit" class="pri" id="beSave">Speichern</button></div>
    ${old?'<div class="row"><button type="button" class="del" id="beDelE">Eintrag löschen</button></div>':''}
    <datalist id="beGw">${gewerke.map(g=>`<option value="${beE(g)}">`).join('')}</datalist>
    <datalist id="beFi">${firmen.map(g=>`<option value="${beE(g)}">`).join('')}</datalist>
    <datalist id="beEh">${['m²','m','lfm','m³','Stk','h','psch','kg','t'].map(g=>`<option value="${g}">`).join('')}</datalist></form>`;
  const f=$('#beForm');f.dataset.h=h;let dirty=false,busy=0;
  if(old)for(const k of ['gewerk','firma','stelle','beschreibung','frist','menge','einheit'])f[k].value=old[k]||'';
  if(old)f.dringend.checked=!!old.dringend;
  const sync=()=>{const a=f.art.value;f.querySelectorAll('.bx').forEach(b=>b.hidden=b.dataset.art!==a);
    $('#beBl').textContent=a==='technik'?'Frage':a==='nachtrag'?'Was genau soll gemacht werden?':'Beschreibung'};sync();
  f.addEventListener('input',()=>{dirty=true;$('#beErr').textContent=''});f.addEventListener('change',e=>{dirty=true;if(e.target.name==='art')sync()});
  const thumbs=()=>{$('#beTh').innerHTML=fotos.map((q,i)=>`<span class="th">${q.data?`<img src="data:image/jpeg;base64,${q.data}" alt="">`:'<span class="thx">📷</span>'}<button type="button" data-i="${i}" aria-label="Foto entfernen">✕</button></span>`).join('');
    $('#beTh').querySelectorAll('button').forEach(b=>b.onclick=()=>{const[q]=fotos.splice(+b.dataset.i,1);if(!q.isNew)removed.push(q);dirty=true;thumbs()})};
  BE.ensureFotos(fotos).then(()=>{if($('#beForm')===f)thumbs()});thumbs();
  $('#beFile').onchange=async e=>{const files=[...e.target.files];e.target.value='';if(!files.length)return;busy++;dirty=true;const m=$('#beFm');
    for(let i=0;i<files.length;i++){m.textContent=`Foto ${i+1} von ${files.length} wird verkleinert …`;
      try{const c=await beCompress(files[i]);fotos.push({id:beUuid(),data:c.data,w:c.w,h:c.h,isNew:true});thumbs()}catch(err){alert(err.message)}}
    busy--;m.textContent=`${fotos.length} ${fotos.length===1?'Foto':'Fotos'}`};
  const leave=()=>{location.hash=back};
  backTo('‹ Besuch',back);$('#back').onclick=()=>{if(!dirty||confirm('Änderungen verwerfen?'))leave()};
  $('#beCancel').onclick=$('#back').onclick;
  if(old)$('#beDelE').onclick=async()=>{if(!confirm('Diesen Eintrag mit allen Fotos löschen?'))return;
    const all=await BeDB.all('fotos','eintrag',eid);
    await BeDB.tx(o=>{for(const q of all)o.fotos.delete(q.id);o.eintraege.delete(eid);if(old.srv)o.tomb.put({id:eid,table:'besuch_eintraege',uid:u,besuch_id:bid})});
    BE.kick();leave()};
  f.onsubmit=async e=>{e.preventDefault();if(busy){$('#beErr').textContent='Bitte warten, bis alle Fotos verkleinert sind.';return}
    const a=f.art.value,txt=f.beschreibung.value.trim();
    if(!txt&&!fotos.length){$('#beErr').textContent='Bitte eine Beschreibung eingeben oder ein Foto hinzufügen.';f.beschreibung.focus();return}
    const cur=await BeDB.get('besuche',bid);if(!cur||cur.status==='fertig'||cur.wantFertig){alert('Der Besuch ist bereits abgeschlossen.');leave();return}
    const val=k=>f[k].value.trim()||null,now=new Date().toISOString();
    const base=old||{id:beUuid(),besuch_id:bid,uid:u,created_at:now,pos:Math.max(0,...siblings.map(x=>x.pos||0))+1,rev:0,srv:0};
    const rec={...base,art:a,gewerk:val('gewerk'),firma:val('firma'),stelle:val('stelle'),beschreibung:txt||null,
      frist:a==='mangel'?val('frist'):null,menge:a==='nachtrag'?val('menge'):null,einheit:a==='nachtrag'?val('einheit'):null,
      angefordert_von:a==='nachtrag'?val('angefordert_von'):null,bauherr_zahlt:a==='nachtrag'?(f.bauherr_zahlt.value||'offen'):null,
      dringend:a==='technik'?f.dringend.checked:null,dirty:1,rev:(base.rev||0)+1};
    const unchanged=old&&BE_FIELDS.every(k=>(old[k]??null)===(rec[k]??null));
    await BeDB.tx(o=>{if(!unchanged)o.eintraege.put(rec);
      for(const q of removed){o.fotos.delete(q.id);if(q.srv)o.tomb.put({id:q.id,table:'besuch_fotos',uid:u,besuch_id:bid})}
      fotos.forEach((q,i)=>{if(q.isNew)o.fotos.put({id:q.id,eintrag_id:rec.id,besuch_id:bid,uid:u,pos:i,data:q.data,w:q.w,h:q.h,dirty:1,rev:1,srv:0})})});
    dirty=false;BE.kick(200);leave()};
}
