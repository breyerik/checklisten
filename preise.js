// Preisdatenbank: Daten kommen aus Supabase (für alle angemeldeten Nutzer), nie aus dem Repo.
const PR_CACHE='bs-preise-cache';
const prNorm=s=>String(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
// {cols,rows:[[...]]} -> Objekte mit Suchtext (Leistung, Gewerk, Firma)
function prRows(data){const c=(data&&data.cols)||[];
  return((data&&data.rows)||[]).map(r=>{const o={};c.forEach((k,i)=>o[k]=r[i]);o.q=prNorm([o.leistung,o.gewerk,o.firma].join(' '));return o})}
// Alle Wörter müssen vorkommen (Groß/Klein und Umlaute egal); optional nur ein Gewerk
function prSearch(rows,query,gewerk){const ws=prNorm(query).split(/\s+/).filter(Boolean);
  return rows.filter(r=>(!gewerk||r.gewerk===gewerk)&&ws.every(w=>r.q.includes(w)))}
const prEur=n=>n==null||isNaN(n)?'–':Number(n).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const prDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.split('-').reverse().join('.'):(s||'');
if(typeof module!=='undefined')module.exports={prRows,prSearch,prEur,prDate,prNorm};

// ---------- Browser ----------
function prCache(){try{const c=JSON.parse(localStorage.getItem(PR_CACHE)||'null');const u=Sync&&Sync.user;return c&&u&&c.uid===u.id?c:null}catch(e){return null}}
function prClear(){localStorage.removeItem(PR_CACHE)}
async function prLoad(){ // -> {row, cached, offline, err, nologin}
  const u=Sync&&Sync.user;if(!u)return{nologin:true};
  try{const rows=await Sync.api('/rest/v1/preisdatenbank?select=stand,data,updated_at&id=eq.1');
    const row=rows&&rows[0]||null;
    if(row)localStorage.setItem(PR_CACHE,JSON.stringify({uid:u.id,at:Date.now(),row}));else prClear();
    return{row}}
  catch(e){const c=prCache();
    if(e.status===404||e.status===401||e.status===403){if(e.status!==401)prClear();return{row:null,err:e.status===401?'login':null}}
    return c?{row:c.row,cached:c.at,offline:!e.status}:{row:null,offline:!e.status,err:e.message}}
}
function prTeaser(){if(!Sync||!Sync.user)return'Nur nach Anmeldung sichtbar';const c=prCache();
  return c?`${(c.row.data.rows||[]).length} Preise · Stand ${prDate(c.row.stand)}`:'Preise vor Ort nachschlagen'}
let prQ='',prG='',prMem=null; // Suche bleibt beim Zurückgehen erhalten
async function prView(el){
  const c=prCache();let shown=null;
  const draw=(row,cached)=>{if(!prMem||prMem.at!==row.updated_at)prMem={at:row.updated_at,rows:prRows(row.data)};shown=row.updated_at;
    const gs=[...new Set(prMem.rows.map(r=>r.gewerk))].sort((a,b)=>a.localeCompare(b,'de'));if(prG&&!gs.includes(prG))prG='';
    el.innerHTML=`<div class="card"><b>Stand: ${prDate(row.stand||row.data.stand)}</b> <span class="muted">· ${prMem.rows.length} Preise</span>
      <div class="muted">Bauherr = Netto × 1,19 ÷ 0,75</div>${cached?`<div class="muted">Offline · zuletzt geladen ${new Date(cached).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}</div>`:''}</div>
      <div class="prf"><input id="prQ" type="search" placeholder="Suchen: Leistung, Gewerk, Firma" autocomplete="off" enterkeyhint="search">
      <select id="prG"><option value="">Alle Gewerke</option>${gs.map(g=>`<option${g===prG?' selected':''}>${esc(g)}</option>`).join('')}</select></div><div id="prRes"></div>`;
    const q=$('#prQ');q.value=prQ;q.oninput=()=>{prQ=q.value;res()};$('#prG').onchange=e=>{prG=e.target.value;res()};res()};
  const res=()=>{const hit=prSearch(prMem.rows,prQ,prG),max=60;
    $('#prRes').innerHTML=!hit.length?'<div class="empty">Keine Treffer.</div>':`<div class="muted prn">${hit.length} Treffer${hit.length>max?`, die ersten ${max} – Suche verfeinern`:''}</div>`+
      hit.slice(0,max).map(r=>`<div class="card pr"><div class="prt"><span class="prl">${esc(r.leistung)}</span><span class="prp"><small>Bauherr</small>${prEur(r.bauherr)}<small>je ${esc(r.einheit||'–')}</small></span></div>
        <div class="muted">Netto ${prEur(r.netto)} · ${esc(r.gewerk)}</div><div class="muted">${[r.firma,r.bv,prDate(r.datum)].filter(Boolean).map(esc).join(' · ')}</div></div>`).join('')};
  if(c)draw(c.row,null);else el.innerHTML='<div class="empty">Lade Preisdatenbank …</div>';
  const r=await prLoad();if(location.hash!=='#/preise')return;
  if(r.nologin||r.err==='login'){el.innerHTML=`<div class="card"><p><b>Preisdatenbank nur nach Anmeldung sichtbar.</b></p>
    <div class="row"><button class="pri" id="prLogin">Anmelden</button></div></div>`;$('#prLogin').onclick=()=>Sync.account();return}
  if(!r.row){el.innerHTML=`<div class="card"><p><b>${r.offline?'Keine Verbindung.':'Noch keine Preise verfügbar.'}</b></p><p class="muted">${r.offline?'Die Preisdatenbank wurde auf diesem Gerät noch nicht geladen.':(r.err?'Fehler: '+esc(r.err):'Es wurde noch keine Preisdatenbank hochgeladen.')}</p></div>`;return}
  if(r.cached){const n=el.querySelector('.card');if(shown&&n)n.insertAdjacentHTML('beforeend',`<div class="muted">Offline · zuletzt geladen ${new Date(r.cached).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}</div>`);else draw(r.row,r.cached);return}
  if(shown!==r.row.updated_at){const f=document.activeElement&&document.activeElement.id==='prQ';draw(r.row,null);if(f)$('#prQ').focus()}
}
