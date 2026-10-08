const KEY='bs-checklisten-v1';
let st=JSON.parse(localStorage.getItem(KEY)||'{"projects":[]}');
let hideDone=false;
const store=()=>localStorage.setItem(KEY,JSON.stringify(st));
const save=()=>{store();Sync&&Sync.changed()};
const $=s=>document.querySelector(s), main=$('#main');
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const items=t=>TEMPLATES[t].sections.flatMap(s=>s.items.filter(i=>!i.header));
function prog(p){const all=items(p.tpl),d=all.filter(i=>p.done[i.id]).length;return{d,n:all.length,pc:Math.round(d*100/all.length)}}
function route(){const[id,sub,bid,x,eid]=location.hash.slice(2).split('/');if(id==='preise'){if(!(Sync&&Sync.user&&$('#prQ')))preise();return}const p=st.projects.find(x=>x.id===id);
  if(!p)return list();
  if(sub==='besuch'&&x==='e'){const f=$('#beForm');if(f&&f.dataset.h===location.hash)return;return beEntry(p,bid,eid,main)} // Formular nicht neu zeichnen (Eingaben bleiben)
  beSubView=null;sub==='check'?detail(p):sub==='plan'?plan(p):sub==='besuche'?beList(p,main):sub==='besuch'?beVisit(p,bid,main):hub(p)}
function backTo(label,hash){const b=$('#back');b.textContent=label;b.style.visibility='visible';b.onclick=()=>{location.hash=hash}}
function hub(p){
  $('#title').textContent=p.name;backTo('‹ Projekte','');const g=prog(p);
  main.innerHTML=`${p.addr?`<div class="muted hubaddr">${esc(p.addr)}</div>`:''}
  <a class="card tile" href="#/${p.id}/check"><span class="ti">☑︎</span><span class="tx"><b>Checkliste</b><span class="muted">${TEMPLATES[p.tpl].title}</span>
    <span class="muted">${g.d} von ${g.n} erledigt (${g.pc} %)</span><span class="bar"><i style="width:${g.pc}%"></i></span></span></a>
  <a class="card tile" href="#/${p.id}/plan"><span class="ti">📅</span><span class="tx"><b>Bauzeitenplan</b><span class="muted">${esc(bzpTeaser(p))}</span></span></a>
  <a class="card tile" href="#/${p.id}/besuche"><span class="ti">📷</span><span class="tx"><b>Besuche</b><span class="muted" id="beTeaser">Besuchsprotokolle mit Fotos</span></span></a>`;
  beTeaser(p,$('#beTeaser'));
}
function preise(){$('#title').textContent='Preisdatenbank';backTo('‹ Projekte','');prView(main)}
function plan(p){$('#title').textContent=p.name;backTo('‹ Übersicht','#/'+p.id);bzpView(p,main)}
function list(){
  $('#title').textContent='Bauvorhaben';$('#back').style.visibility='hidden';
  let h=st.projects.length?'':'<div class="empty">Noch kein Bauvorhaben angelegt.<br>Tippe auf „+ Neues Bauvorhaben“.</div>';
  for(const p of st.projects){const g=prog(p);
    h+=`<div class="card proj"><a class="info" href="#/${p.id}" style="color:inherit;text-decoration:none"><b>${esc(p.name)}</b>
    <div class="muted">${p.addr?esc(p.addr)+' · ':''}${TEMPLATES[p.tpl].title}</div>
    <div class="muted">${g.d} von ${g.n} erledigt (${g.pc} %)</div><div class="bar"><i style="width:${g.pc}%"></i></div></a>
    <button class="del" data-del="${p.id}">Löschen</button></div>`}
  h+=`<a class="card tile prtile" href="#/preise"><span class="ti">💶</span><span class="tx"><b>Preisdatenbank</b><span class="muted">${esc(prTeaser())}</span></span><span class="chev">›</span></a>`;
  main.innerHTML=h+'<div class="tools bk"><button id="bkSave">Sichern</button><button id="bkLoad">Wiederherstellen</button></div><button class="fab" id="add">+ Neues Bauvorhaben</button>';
  $('#bkSave').onclick=async()=>{const r=await shareOrDownload(makeBackup(st),backupName());if(r==='downloaded')alert('Die Sicherung wurde heruntergeladen.')};
  $('#bkLoad').onclick=()=>{$('#bkFile').value='';$('#bkFile').click()};
  $('#add').onclick=()=>{$('#newForm').reset();$('#dlg').showModal()};
  main.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{const p=st.projects.find(x=>x.id===b.dataset.del);
    if(confirm(`„${p.name}“ wirklich löschen? Alle Haken gehen verloren.`)){st.projects=st.projects.filter(x=>x!==p);st.deleted=st.deleted||{};st.deleted[p.id]=Date.now();save();list()}});
}
function detail(p){
  $('#title').textContent=p.name;backTo('‹ Übersicht','#/'+p.id);
  const g=prog(p);
  let h=`<div class="card"><div class="muted">${p.addr?esc(p.addr)+'<br>':''}${TEMPLATES[p.tpl].title}</div>
  <div style="margin-top:6px"><b>${g.d} von ${g.n} erledigt (${g.pc} %)</b></div><div class="bar"><i style="width:${g.pc}%"></i></div>
  ${g.d===g.n?'<p>✅ Checkliste komplett. Du kannst das Bauvorhaben jetzt in der Übersicht löschen.</p>':''}</div>
  <div class="tools"><button id="tg">${hideDone?'Alle anzeigen':'Erledigte ausblenden'}</button><button id="ex">Alle aufklappen</button></div>`;
  TEMPLATES[p.tpl].sections.forEach((s,si)=>{
    const its=s.items.filter(i=>!i.header),d=its.filter(i=>p.done[i.id]).length;
    const open=(p.open||{})[si];
    h+=`<details class="sec ${d===its.length?'done-sec':''}" data-si="${si}" ${open?'open':''}><summary><span>${esc(s.title)}</span><span class="muted">${d}/${its.length}</span></summary>`;
    for(const i of s.items){
      if(i.header){h+=`<div class="grp">${esc(i.text)}</div>`;continue}
      const c=!!p.done[i.id]; if(hideDone&&c) continue;
      h+=`<label class="item ${i.sub?'sub':''} ${c?'checked':''}"><input type="checkbox" data-id="${i.id}" ${c?'checked':''}><span>${esc(i.text)}</span></label>`}
    h+='</details>'});
  main.innerHTML=h;
  main.querySelectorAll('input[data-id]').forEach(cb=>cb.onchange=()=>{const id=cb.dataset.id,t=Date.now();p.undone=p.undone||{};
    if(cb.checked){p.done[id]=t;delete p.undone[id]}else{delete p.done[id];p.undone[id]=t}p.mod=t;save();
    const y=scrollY;detail(p);scrollTo(0,y)});
  main.querySelectorAll('details').forEach(d=>d.ontoggle=()=>{p.open=p.open||{};p.open[d.dataset.si]=d.open;store()});
  $('#tg').onclick=()=>{hideDone=!hideDone;detail(p)};
  $('#ex').onclick=()=>{p.open={};TEMPLATES[p.tpl].sections.forEach((_,i)=>p.open[i]=true);store();detail(p)};
}
$('#dlg').addEventListener('close',()=>{if($('#dlg').returnValue!=='ok')return;const f=new FormData($('#newForm'));
  const p={id:Date.now().toString(36),name:f.get('name').trim(),addr:f.get('addr').trim(),tpl:f.get('tpl'),done:{},open:{0:true},created:Date.now()};p.mod=p.created;
  st.projects.unshift(p);save();location.hash='#/'+p.id});
$('#bkFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;
  const r=parseBackup(await f.text(),TEMPLATES);if(!r.ok){alert(r.error);return}
  const n=r.state.projects.length,dt=r.exported?new Date(r.exported).toLocaleString('de-DE'):'unbekannt';
  if(!confirm(`Sicherung vom ${dt} mit ${n} Bauvorhaben wiederherstellen?\n\nDer aktuelle Stand auf diesem Gerät (${st.projects.length} Bauvorhaben) wird dabei ERSETZT.`))return;
  const keepIds=new Set(r.state.projects.map(p=>p.id)),del={...(st.deleted||{}),...(r.state.deleted||{})},t=Date.now();
  for(const p of st.projects)if(!keepIds.has(p.id))del[p.id]=t;
  for(const p of r.state.projects){delete del[p.id];p.mod=Math.max(p.mod||0,t)}
  st={...r.state,deleted:del};save();location.hash='';list();alert('Wiederhergestellt.')};
addEventListener('hashchange',route);route();
function rerender(){const y=scrollY;route();scrollTo(0,y)}
Sync&&Sync.init({get:()=>st,set:s=>{st=s;store();rerender()},auth:in_=>{if(!in_){bzpClear();prClear()}else BE&&BE.kick(500);rerender()}});
BE&&BE.kick(2000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
