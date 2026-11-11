// Offene Punkte: Abhakliste aus allen Mangel-Einträgen der Besuchsprotokolle (intern art='mangel', in der App „Offener Punkt“)
// plus Punkte, die per E-Mail / Telefon / Sonstiges kommen. Offline-fähig über dieselbe IndexedDB wie die Besuche (Stores punkte, pfotos).
// Besuch-Punkte: Text gehört dem Besuchsprotokoll; hier änderbar sind nur Status (erledigt), Rückmeldung der Firma und Notiz.
const OP_Q={besuch:'Besuch',email:'E-Mail',telefon:'Telefon',sonstiges:'Sonstiges'};
const OP_MAXFOTOS=3;
const opSt={show:'offen',sort:'neu',gewerk:'',firma:'',bv:'',q:''};
const opCmp=(a,b)=>String(a||'').localeCompare(String(b||''),'de',{sensitivity:'base'});
const opDays=d=>d?Math.max(0,Math.round((Date.parse(beToday())-Date.parse(d))/864e5)):0;
// Alle Punkte (lokal): Besuch-Punkte aus den Mangel-Einträgen + Status-Zeilen, plus selbst angelegte
async function opItems(pid){
  const u=Sync.user.id,[bs,es,ps,pfs]=await Promise.all(['besuche','eintraege','punkte','pfotos'].map(s=>BeDB.all(s,'uid',u)));
  const bm=new Map(bs.map(b=>[b.id,b])),pm=new Map(ps.map(x=>[x.id,x])),proj=id=>(st.projects.find(p=>p.id===id)||{}).name,out=[];
  for(const e of es){if(e.art!=='mangel')continue;const b=bm.get(e.besuch_id);if(!b||(pid&&b.projekt_id!==pid))continue;const s=pm.get(e.id)||{};
    out.push({id:e.id,manual:false,quelle:'besuch',projekt_id:b.projekt_id,bv:proj(b.projekt_id)||b.bv,besuch_id:b.id,gewerk:e.gewerk,firma:e.firma,stelle:e.stelle,
      beschreibung:e.beschreibung,frist:e.frist,angelegt_am:String(b.datum||'').slice(0,10),erledigt_am:s.erledigt_am||null,rueckmeldung_am:s.rueckmeldung_am||null,
      notiz:s.notiz||null,erledigt_von:s.erledigt_von||null,dirty:!!(s.dirty||e.dirty),fotos:[]})}
  for(const x of ps){if(x.quelle==='besuch'||(pid&&x.projekt_id!==pid))continue;
    out.push({...x,manual:true,bv:proj(x.projekt_id)||x.bv,dirty:!!x.dirty,fotos:pfs.filter(f=>f.punkt_id===x.id).sort((a,b)=>a.pos-b.pos)})}
  return out}
const opIsDone=x=>!!x.erledigt_am;
// Zeile in „punkte“ schreiben (Besuch-Punkte: Status-Zeile bei Bedarf neu anlegen, id = Eintrags-id)
async function opPatch(it,ch){
  const u=Sync.user.id,now=new Date().toISOString();
  await BeDB.tx(o=>{const q=o.punkte.get(it.id);q.onsuccess=()=>{
    const cur=q.result||(it.manual?null:{id:it.id,uid:u,projekt_id:it.projekt_id,bv:it.bv,quelle:'besuch',eintrag_id:it.id,besuch_id:it.besuch_id,angelegt_am:it.angelegt_am,created_at:now,rev:0,srv:0});
    if(!cur)return;o.punkte.put({...cur,...ch,dirty:1,rev:(cur.rev||0)+1});}});
  BE.kick(200)}
async function opCounts(pid){const it=await opItems(pid),d=it.filter(opIsDone).length;return{open:it.length-d,done:d,n:it.length}}
async function opTeaser(p,el){if(!el)return;if(!Sync||!Sync.user||!BeDB){el.textContent='Nur nach Anmeldung verfügbar';return}
  try{const c=await opCounts(p&&p.id);el.textContent=c.n?`${c.open} offen · ${c.done} erledigt`:'Abhakliste aus Besuchen, E-Mail und Telefon'}catch(e){}}

let opToastT=null;
function opToast(msg,undo){let t=$('#opToast');if(!t){t=document.createElement('div');t.id='opToast';t.className='optoast';document.body.appendChild(t)}
  t.innerHTML=`<span>${beE(msg)}</span>${undo?'<button type="button">Rückgängig</button>':''}`;t.hidden=false;
  if(undo)t.querySelector('button').onclick=()=>{t.hidden=true;undo()};clearTimeout(opToastT);opToastT=setTimeout(()=>{t.hidden=true},5000)}

async function opView(p,el){
  const pid=p&&p.id;$('#title').textContent=p?p.name:'Offene Punkte';
  if(p)backTo('‹ Übersicht','#/'+p.id);else backTo('‹ Projekte','');
  if(!Sync||!Sync.user||!BeDB)return beLoginCard(el,'Offene Punkte');
  if(pid)opSt.bv='';if(pid&&opSt.sort==='bv')opSt.sort='neu';
  const h=beHash();let items=[],sig='';
  el.innerHTML=`<div class="row" style="margin:0 0 10px"><button class="pri" id="opNew">+ Neuer Punkt (E-Mail / Telefon)</button></div>
    <div id="beStat" class="bestat"></div><div id="opMiss" class="bestat wait" hidden>⚠️ Auf dem Server ist „Offene Punkte“ noch nicht eingerichtet. Änderungen bleiben vorerst nur auf diesem Gerät.</div>
    <div class="seg" id="opSeg"></div>
    <div class="opf"><select id="opSort" aria-label="Sortierung">
      <option value="neu">Neueste zuerst</option><option value="alt">Älteste zuerst</option>
      <option value="gewerk">Nach Gewerk</option><option value="firma">Nach Firma</option><option value="frist">Nach Frist</option>${pid?'':'<option value="bv">Nach Bauvorhaben</option>'}</select>
      <input id="opQ" type="search" placeholder="Suchen" autocomplete="off"></div>
    <div class="opf"><select id="opGw" aria-label="Gewerk"></select><select id="opFi" aria-label="Firma"></select>${pid?'':'<select id="opBv" aria-label="Bauvorhaben"></select>'}</div>
    <div id="opList"></div>`;
  const seg=$('#opSeg'),sort=$('#opSort'),q=$('#opQ');sort.value=opSt.sort;q.value=opSt.q;
  const uniq=a=>[...new Set(a.map(s=>String(s||'').trim()).filter(Boolean))].sort(opCmp);
  const fillSel=(id,all,vals,key)=>{const s=$(id);if(!s)return;if(!vals.includes(opSt[key]))opSt[key]='';
    s.innerHTML=`<option value="">${all}</option>`+vals.map(v=>`<option value="${beE(v)}"${v===opSt[key]?' selected':''}>${beE(v)}</option>`).join('')};
  const filtered=()=>{const t=opSt.q.trim().toLowerCase();
    return items.filter(x=>(opSt.show==='alle'||(opSt.show==='erledigt')===opIsDone(x))&&(!opSt.gewerk||(x.gewerk||'').trim()===opSt.gewerk)&&(!opSt.firma||(x.firma||'').trim()===opSt.firma)
      &&(!opSt.bv||x.bv===opSt.bv)&&(!t||[x.gewerk,x.firma,x.stelle,x.beschreibung,x.notiz,x.bv].some(v=>String(v||'').toLowerCase().includes(t))))}
  const byDate=(a,b)=>String(a.angelegt_am||'').localeCompare(String(b.angelegt_am||''))||String(a.created_at||'').localeCompare(String(b.created_at||''));
  const sorter=()=>{const s=opSt.sort,dn=(a,b)=>opIsDone(a)-opIsDone(b); // „Alle“: erledigte unten
    const f={neu:(a,b)=>byDate(b,a),alt:byDate,gewerk:(a,b)=>opCmp(a.gewerk||'\uffff',b.gewerk||'\uffff')||byDate(a,b),firma:(a,b)=>opCmp(a.firma||'\uffff',b.firma||'\uffff')||byDate(a,b),
      bv:(a,b)=>opCmp(a.bv,b.bv)||byDate(a,b),frist:(a,b)=>String(a.frist||'9999').localeCompare(String(b.frist||'9999'))||byDate(a,b)}[s]||byDate;
    return(a,b)=>dn(a,b)||f(a,b)};
  const card=x=>{const done=opIsDone(x),late=!done&&x.frist&&x.frist<beToday();
    const title=[x.gewerk,x.firma].filter(Boolean).join(' · ')||'–';
    const meta=[x.stelle,(pid?'':x.bv),`${x.manual&&x.quelle!=='besuch'?'Eingang':'angelegt'} ${beDate(x.angelegt_am)}`+(!done&&opDays(x.angelegt_am)>0?` (seit ${opDays(x.angelegt_am)} ${opDays(x.angelegt_am)===1?'Tag':'Tagen'})`:'')].filter(Boolean).map(beE).join(' · ');
    return`<div class="card op ${done?'done':''}" data-id="${x.id}"><input type="checkbox" class="opck" data-id="${x.id}" ${done?'checked':''} aria-label="${done?'wieder öffnen':'abhaken'}">
      <div class="opb" data-edit="${x.id}"><div class="beet"><b>${beE(title)}</b><span class="chip art q${x.quelle}">${OP_Q[x.quelle]||x.quelle}</span>${x.dirty?'<span class="muted" title="noch nicht hochgeladen">⏳</span>':''}</div>
      <div class="muted">${meta}</div>${x.beschreibung?`<div class="bed">${beE(x.beschreibung)}</div>`:''}
      ${x.frist?`<span class="chip fr ${late?'late':''}">Frist ${beDate(x.frist)}</span> `:''}${x.rueckmeldung_am&&!done?`<span class="chip rm">Firma meldet erledigt am ${beDate(x.rueckmeldung_am)} – prüfen</span>`:''}
      ${x.notiz?`<div class="opn">📝 ${beE(x.notiz)}</div>`:''}
      ${done?`<div class="opd">✓ erledigt am ${beDate(x.erledigt_am)}${x.erledigt_von?' · '+beE(x.erledigt_von):''}</div>`:''}
      ${x.fotos.length?`<div class="thumbs">${x.fotos.map(f=>f.data?`<img src="data:image/jpeg;base64,${f.data}" alt="">`:'<span class="thx">📷</span>').join('')}</div>`:''}</div></div>`};
  const drawList=()=>{const all=items,c={offen:all.filter(x=>!opIsDone(x)).length};c.erledigt=all.length-c.offen;c.alle=all.length;
    seg.innerHTML=[['offen','Offen'],['erledigt','Erledigt'],['alle','Alle']].map(([k,l])=>`<label><input type="radio" name="opShow" value="${k}"${opSt.show===k?' checked':''}><span>${l} (${c[k]})</span></label>`).join('');
    seg.querySelectorAll('input').forEach(i=>i.onchange=()=>{opSt.show=i.value;drawList()});
    const rows=filtered().sort(sorter()),grp={gewerk:x=>x.gewerk||'Ohne Gewerk',firma:x=>x.firma||'Ohne Firma',bv:x=>x.bv}[opSt.sort];
    let x='';
    if(!rows.length)x=`<div class="empty">${!all.length?'Noch keine offenen Punkte.<br>Sie entstehen automatisch aus den Besuchsprotokollen – oder tippe auf „+ Neuer Punkt“, wenn du etwas per E-Mail oder Telefon bekommen hast.'
      :opSt.show==='offen'&&c.offen===0?'Alles erledigt 🎉':'Keine Punkte für diesen Filter.'}</div>`;
    let cur=null;for(const r of rows){if(grp){const g=grp(r);if(g!==cur){cur=g;x+=`<div class="beg">${beE(g)} <span class="muted">(${rows.filter(y=>grp(y)===g).length})</span></div>`}}x+=card(r)}
    if(opSt.show==='offen'&&rows.length>1)x+=`<div class="row"><button class="sec" id="opAll">Alle ${rows.length} angezeigten als erledigt markieren</button></div>`;
    $('#opList').innerHTML=x;
    const find=id=>items.find(i=>i.id===id);
    $('#opList').querySelectorAll('.opck').forEach(cb=>cb.onchange=async()=>{const it=find(cb.dataset.id);if(!it)return;
      if(cb.checked){await opPatch(it,{erledigt_am:beToday(),erledigt_von:Sync.user.email||null});opToast('Als erledigt markiert',()=>opPatch(it,{erledigt_am:null,erledigt_von:null}).then(draw))}
      else await opPatch(it,{erledigt_am:null,erledigt_von:null});await draw()});
    $('#opList').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>opEdit(find(b.dataset.edit),p,items,draw));
    const all2=$('#opAll');if(all2)all2.onclick=async()=>{if(!confirm(`${rows.length} Punkte als heute erledigt markieren?`))return;
      for(const it of rows)await opPatch(it,{erledigt_am:beToday(),erledigt_von:Sync.user.email||null});await draw()};
    // Fotos selbst angelegter Punkte nachladen (z. B. auf dem anderen Gerät aufgenommen)
    const miss=rows.flatMap(r=>r.fotos).filter(f=>!f.data&&f.srv);if(miss.length)BE.ensurePfotos(miss).then(()=>{if(beHash()===h&&miss.some(f=>f.data)&&!$('#opDlg[open]'))draw()})};
  const draw=async()=>{items=await opItems(pid);if(beHash()!==h)return;
    const s=JSON.stringify([items.map(i=>[i.gewerk,i.firma,i.bv])]);
    if(s!==sig){sig=s;fillSel('#opGw','Alle Gewerke',uniq(items.map(i=>i.gewerk)),'gewerk');fillSel('#opFi','Alle Firmen',uniq(items.map(i=>i.firma)),'firma');fillSel('#opBv','Alle BV',uniq(items.map(i=>i.bv)),'bv')}
    $('#opMiss').hidden=!BE.opMissing;drawList();beStat(null)};
  sort.onchange=()=>{opSt.sort=sort.value;drawList()};q.oninput=()=>{opSt.q=q.value;drawList()};
  for(const[id,k]of[['#opGw','gewerk'],['#opFi','firma'],['#opBv','bv']]){const s=$(id);if(s)s.onchange=()=>{opSt[k]=s.value;drawList()}}
  $('#opNew').onclick=()=>opEdit(null,p,items,draw);
  beSubView={h,bid:null,draw};$('#opList').innerHTML='<div class="empty">Lade Punkte …</div>';await draw();BE.kick(100);
}

// Anlegen / Bearbeiten (Dialog). Besuch-Punkte: Text nur lesen, Status/Rückmeldung/Notiz bearbeiten.
async function opEdit(it,p,items,redraw){
  const isNew=!it,u=Sync.user.id,ro=!!it&&!it.manual;
  let d=$('#opDlg');if(!d){d=document.createElement('dialog');d.id='opDlg';document.body.appendChild(d)}
  const uniq=a=>[...new Set(a.map(s=>String(s||'').trim()).filter(Boolean))].sort(opCmp);
  const allE=await BeDB.all('eintraege','uid',u);
  const firmen=uniq([...items.map(i=>i.firma),...allE.map(e=>e.firma)]),gewerke=uniq([...items.map(i=>i.gewerk),...allE.map(e=>e.gewerk)]);
  const projs=st.projects,pid0=it?it.projekt_id:(p?p.id:(projs[0]||{}).id);
  const fotos=it&&it.manual?it.fotos.map(f=>({...f})):[],removed=[];let busy=0;
  const v=k=>beE(it&&it[k]||'');
  const quelle=it&&it.quelle!=='besuch'?it.quelle:'email';
  d.innerHTML=`<form id="opForm" class="beform" novalidate><h2>${isNew?'Neuer offener Punkt':ro?'Offener Punkt':'Punkt bearbeiten'}</h2>
    ${isNew&&!p?`<label>Bauvorhaben<select name="pid">${projs.map(x=>`<option value="${beE(x.id)}"${x.id===pid0?' selected':''}>${beE(x.name)}</option>`).join('')}</select></label>`:''}
    ${ro?`<div class="card" style="margin:0 0 10px"><div class="muted">Aus dem Besuch vom ${beDate(it.angelegt_am)} · <a href="#/${it.projekt_id}/besuch/${it.besuch_id}">Besuch öffnen</a></div>
      <div style="margin-top:4px"><b>${beE([it.gewerk,it.firma].filter(Boolean).join(' · ')||'–')}</b></div>${it.stelle?`<div class="muted">${beE(it.stelle)}</div>`:''}
      ${it.beschreibung?`<div class="bed">${beE(it.beschreibung)}</div>`:''}${it.frist?`<div class="muted">Frist: ${beDate(it.frist)}</div>`:''}</div>`
    :`<div class="seg">${['email','telefon','sonstiges'].map(k=>`<label><input type="radio" name="quelle" value="${k}"${k===quelle?' checked':''}><span>${OP_Q[k]}</span></label>`).join('')}</div>
      <label>Gewerk<input name="gewerk" list="opGwl" autocomplete="off" value="${v('gewerk')}" placeholder="z. B. Trockenbau"></label>
      <label>Firma<input name="firma" list="opFil" autocomplete="off" value="${v('firma')}"></label>
      <label>Stelle<input name="stelle" autocomplete="off" value="${v('stelle')}" placeholder="Haus, Geschoss, Raum oder Bauteil"></label>
      <label>Was ist offen?<textarea name="beschreibung" rows="4" placeholder="Tippen oder über das Mikrofon der Tastatur diktieren">${v('beschreibung')}</textarea></label>
      <div class="two"><label><span id="opAl">Eingegangen am</span><input type="date" name="angelegt_am" value="${beE(it?it.angelegt_am:beToday())}"></label>
      <label>Frist (optional)<input type="date" name="frist" value="${v('frist')}"></label></div>`}
    <div class="card"><b>Rückmeldung &amp; Prüfung</b>
      <label>Firma meldet erledigt am<input type="date" name="rueckmeldung_am" value="${v('rueckmeldung_am')}"></label>
      <label>Notiz<textarea name="notiz" rows="3" placeholder="z. B. laut Firma am 14.11. erledigt – beim nächsten Besuch prüfen">${v('notiz')}</textarea></label>
      <label>Erledigt (geprüft) am <span class="muted">– leer = noch offen</span><input type="date" name="erledigt_am" value="${v('erledigt_am')}"></label>
      ${it&&it.erledigt_von?`<div class="muted">Abgehakt von ${beE(it.erledigt_von)}</div>`:''}</div>
    ${ro?'':`<div class="card"><b>Fotos</b> <span class="muted">(optional, bis zu ${OP_MAXFOTOS})</span><div id="opTh" class="thumbs edit"></div>
      <label class="addfoto" id="opAddF">📷 Foto hinzufügen<input type="file" id="opFile" accept="image/*" multiple></label><div class="muted" id="opFm"></div></div>`}
    <p class="msg err" id="opErr"></p>
    <div class="row"><button type="button" class="sec" id="opCancel">Abbrechen</button><button type="submit" class="pri">Speichern</button></div>
    ${it&&it.manual?'<div class="row"><button type="button" class="del" id="opDel">Punkt löschen</button></div>':''}
    <datalist id="opGwl">${gewerke.map(g=>`<option value="${beE(g)}">`).join('')}</datalist><datalist id="opFil">${firmen.map(g=>`<option value="${beE(g)}">`).join('')}</datalist></form>`;
  const f=d.querySelector('#opForm'),$d=s=>d.querySelector(s);
  const al=()=>{const a=$d('#opAl'),q=f.quelle&&f.quelle.value;if(a)a.textContent=q==='sonstiges'?'Angelegt am':q==='telefon'?'Anruf am':'E-Mail vom'};
  if(f.quelle){al();f.addEventListener('change',e=>{if(e.target.name==='quelle')al()})}
  const thumbs=()=>{const t=$d('#opTh');if(!t)return;
    t.innerHTML=fotos.map((q,i)=>`<span class="th">${q.data?`<img src="data:image/jpeg;base64,${q.data}" alt="">`:'<span class="thx">📷</span>'}<button type="button" data-i="${i}" aria-label="Foto entfernen">✕</button></span>`).join('');
    t.querySelectorAll('button').forEach(b=>b.onclick=()=>{const[q]=fotos.splice(+b.dataset.i,1);if(!q.isNew)removed.push(q);thumbs()});
    const a=$d('#opAddF');if(a)a.hidden=fotos.length>=OP_MAXFOTOS};
  if(!ro){BE.ensurePfotos(fotos).then(()=>{if(d.open)thumbs()});thumbs();
    $d('#opFile').onchange=async e=>{const files=[...e.target.files].slice(0,OP_MAXFOTOS-fotos.length);e.target.value='';if(!files.length)return;busy++;const m=$d('#opFm');
      for(let i=0;i<files.length;i++){m.textContent=`Foto ${i+1} von ${files.length} wird verkleinert …`;
        try{const c=await beCompress(files[i]);fotos.push({id:beUuid(),data:c.data,w:c.w,h:c.h,isNew:true});thumbs()}catch(err){alert(err.message)}}
      busy--;m.textContent=''}}
  $d('#opCancel').onclick=()=>d.close();
  if(it&&it.manual)$d('#opDel').onclick=async()=>{if(!confirm('Diesen Punkt wirklich löschen?'))return;
    await BeDB.tx(o=>{for(const q of it.fotos)o.pfotos.delete(q.id);o.punkte.delete(it.id);
      if(it.srv)o.tomb.put({id:it.id,table:'offene_punkte',uid:u})});
    BE.kick();d.close();redraw()};
  f.onsubmit=async e=>{e.preventDefault();if(busy){$d('#opErr').textContent='Bitte warten, bis das Foto verkleinert ist.';return}
    const val=k=>f[k]?(f[k].value.trim()||null):null,now=new Date().toISOString();
    const status={rueckmeldung_am:val('rueckmeldung_am'),notiz:val('notiz'),erledigt_am:val('erledigt_am')};
    status.erledigt_von=status.erledigt_am?((it&&it.erledigt_von)||Sync.user.email||null):null;
    if(ro){await opPatch(it,status)}
    else{const txt=val('beschreibung');if(!txt&&!val('gewerk')&&!val('firma')&&!fotos.length){$d('#opErr').textContent='Bitte mindestens eine Beschreibung eintragen.';f.beschreibung.focus();return}
      const pid=it?it.projekt_id:(p?p.id:f.pid.value),pj=st.projects.find(x=>x.id===pid);
      const row={...(it?await BeDB.get('punkte',it.id):{id:beUuid(),uid:u,created_at:now,rev:0,srv:0}),projekt_id:pid,bv:pj?pj.name:(it&&it.bv)||'',quelle:f.quelle.value,
        gewerk:val('gewerk'),firma:val('firma'),stelle:val('stelle'),beschreibung:txt,frist:val('frist'),angelegt_am:val('angelegt_am')||beToday(),...status};
      row.dirty=1;row.rev=(row.rev||0)+1;
      await BeDB.tx(o=>{o.punkte.put(row);
        for(const q of removed){o.pfotos.delete(q.id);if(q.srv)o.tomb.put({id:q.id,table:'offene_punkte_fotos',uid:u})}
        fotos.forEach((q,i)=>{if(q.isNew)o.pfotos.put({id:q.id,punkt_id:row.id,uid:u,pos:i,data:q.data,w:q.w,h:q.h,dirty:1,rev:1,srv:0})})});
      BE.kick(200)}
    d.close();redraw()};
  d.showModal();
}
