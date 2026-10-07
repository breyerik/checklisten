const KEY='bs-checklisten-v1';
let st=JSON.parse(localStorage.getItem(KEY)||'{"projects":[]}');
let hideDone=false;
const save=()=>localStorage.setItem(KEY,JSON.stringify(st));
const $=s=>document.querySelector(s), main=$('#main');
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const items=t=>TEMPLATES[t].sections.flatMap(s=>s.items.filter(i=>!i.header));
function prog(p){const all=items(p.tpl),d=all.filter(i=>p.done[i.id]).length;return{d,n:all.length,pc:Math.round(d*100/all.length)}}
function route(){const id=location.hash.slice(2);const p=st.projects.find(x=>x.id===id);p?detail(p):list()}
function list(){
  $('#title').textContent='Bauvorhaben';$('#back').style.visibility='hidden';
  let h=st.projects.length?'':'<div class="empty">Noch kein Bauvorhaben angelegt.<br>Tippe auf „+ Neues Bauvorhaben“.</div>';
  for(const p of st.projects){const g=prog(p);
    h+=`<div class="card proj"><a class="info" href="#/${p.id}" style="color:inherit;text-decoration:none"><b>${esc(p.name)}</b>
    <div class="muted">${p.addr?esc(p.addr)+' · ':''}${TEMPLATES[p.tpl].title}</div>
    <div class="muted">${g.d} von ${g.n} erledigt (${g.pc} %)</div><div class="bar"><i style="width:${g.pc}%"></i></div></a>
    <button class="del" data-del="${p.id}">Löschen</button></div>`}
  main.innerHTML=h+'<button class="fab" id="add">+ Neues Bauvorhaben</button>';
  $('#add').onclick=()=>{$('#newForm').reset();$('#dlg').showModal()};
  main.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{const p=st.projects.find(x=>x.id===b.dataset.del);
    if(confirm(`„${p.name}“ wirklich löschen? Alle Haken gehen verloren.`)){st.projects=st.projects.filter(x=>x!==p);save();list()}});
}
function detail(p){
  $('#title').textContent=p.name;$('#back').style.visibility='visible';
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
  main.querySelectorAll('input[data-id]').forEach(cb=>cb.onchange=()=>{cb.checked?p.done[cb.dataset.id]=Date.now():delete p.done[cb.dataset.id];save();
    const y=scrollY;detail(p);scrollTo(0,y)});
  main.querySelectorAll('details').forEach(d=>d.ontoggle=()=>{p.open=p.open||{};p.open[d.dataset.si]=d.open;save()});
  $('#tg').onclick=()=>{hideDone=!hideDone;detail(p)};
  $('#ex').onclick=()=>{p.open={};TEMPLATES[p.tpl].sections.forEach((_,i)=>p.open[i]=true);save();detail(p)};
}
$('#back').onclick=()=>{location.hash=''};
$('#dlg').addEventListener('close',()=>{if($('#dlg').returnValue!=='ok')return;const f=new FormData($('#newForm'));
  const p={id:Date.now().toString(36),name:f.get('name').trim(),addr:f.get('addr').trim(),tpl:f.get('tpl'),done:{},open:{0:true},created:Date.now()};
  st.projects.unshift(p);save();location.hash='#/'+p.id});
addEventListener('hashchange',route);route();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
