// Offene Punkte: Abhakliste aus allen Mangel-Einträgen der Besuchsprotokolle (intern art='mangel', in der App „Offener Punkt“)
// plus Punkte, die per E-Mail / Telefon / Sonstiges kommen. Offline-fähig über dieselbe IndexedDB wie die Besuche (Stores punkte, pfotos).
// Besuch-Punkte: Text gehört dem Besuchsprotokoll; hier änderbar sind nur Status (erledigt), Rückmeldung der Firma und Notiz.
const OP_Q={besuch:'Besuch',email:'E-Mail',telefon:'Telefon',sonstiges:'Sonstiges'};
const OP_MAXFOTOS=3;
const opSt={show:'offen',sort:'neu',gewerk:'',firma:'',bv:'',haus:'',q:''};
// Häuser / Wohneinheiten je Bauvorhaben (p.haeuser, im Projektstand = Cloud-Sync, keine Datenbank-Änderung nötig).
// Zuordnung Punkt → Haus liegt in p.haus[punktId]={h,t}. Ohne Zuordnung wird „Haus 2“ o. ä. aus der Stelle übernommen.
const OP_HMAX=20,OP_HAUS_RE=/\b(?:haus|wohneinheit|we)\s*(\d{1,2})\b/i;
const opProj=id=>st.projects.find(p=>p.id===id);
function opHausN(p){if(!p)return 0;if(p.haeuser!=null)return Math.max(0,Math.min(OP_HMAX,+p.haeuser||0));
  try{return glFor(p).some(L=>L.id==='el')?4:0}catch(e){return 0}} // VBW 6: 4 Häuser vorbelegt
function opHausOf(x,p){p=p||opProj(x.projekt_id);const n=opHausN(p);if(!n)return 0;const a=p.haus&&p.haus[x.id];
  if(a)return a.h>0&&a.h<=n?+a.h:0;const m=String(x.stelle||'').match(OP_HAUS_RE),h=m?+m[1]:0;return h>=1&&h<=n?h:0}
function opSetHaus(pid,x,h){const p=opProj(pid);h=+h||0;if(!p||opHausOf(x,p)===h)return;const t=Date.now();
  p.haus={...(p.haus||{}),[x.id]:{h,t}};p.mod=t;save()}
function opHausSeg(n,cur){if(!n)return'';return`<div class="lbl">Haus</div><div class="seg haus">${[0,...Array.from({length:n},(_,i)=>i+1)].map(k=>
  `<label><input type="radio" name="haus" value="${k}"${k===cur?' checked':''}><span>${k?k:'–'}</span></label>`).join('')}</div>`}
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
  for(const x of out)x.haus=opHausOf(x);
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
  const h=beHash();let items=[],sig='';const hn=p?opHausN(p):Math.max(0,...st.projects.map(opHausN));
  if(!hn&&opSt.sort==='haus')opSt.sort='neu';if(!hn)opSt.haus='';
  el.innerHTML=`<div class="row" style="margin:0 0 10px"><button class="pri" id="opNew">+ Neuer Punkt (E-Mail / Telefon)</button></div>
    <div id="beStat" class="bestat"></div><div id="opMiss" class="bestat wait" hidden>⚠️ Auf dem Server ist „Offene Punkte“ noch nicht eingerichtet. Änderungen bleiben vorerst nur auf diesem Gerät.</div>
    <div class="seg" id="opSeg"></div>
    <div class="opf"><select id="opSort" aria-label="Sortierung">
      <option value="neu">Neueste zuerst</option><option value="alt">Älteste zuerst</option>
      <option value="gewerk">Nach Gewerk</option><option value="firma">Nach Firma</option><option value="frist">Nach Frist</option>${hn?'<option value="haus">Nach Haus</option>':''}${pid?'':'<option value="bv">Nach Bauvorhaben</option>'}</select>
      <input id="opQ" type="search" placeholder="Suchen" autocomplete="off"></div>
    <div class="opf"><select id="opGw" aria-label="Gewerk"></select><select id="opFi" aria-label="Firma"></select>${pid?'':'<select id="opBv" aria-label="Bauvorhaben"></select>'}${hn?'<select id="opHs" aria-label="Haus"></select>':''}</div>
    <div class="row oppdf"><button class="sec" id="opPdf" type="button">📄 PDF exportieren</button></div>
    <div id="opList"></div>${p?`<div class="opf ophn"><label>Häuser / Wohneinheiten in diesem BV<select id="opHn">${[0,...Array.from({length:OP_HMAX-1},(_,i)=>i+2)].map(k=>`<option value="${k}"${k===hn?' selected':''}>${k?k:'keine'}</option>`).join('')}</select></label></div>`:''}`;
  const seg=$('#opSeg'),sort=$('#opSort'),q=$('#opQ');sort.value=opSt.sort;q.value=opSt.q;
  const uniq=a=>[...new Set(a.map(s=>String(s||'').trim()).filter(Boolean))].sort(opCmp);
  const fillSel=(id,all,vals,key)=>{const s=$(id);if(!s)return;if(!vals.includes(opSt[key]))opSt[key]='';
    s.innerHTML=`<option value="">${all}</option>`+vals.map(v=>`<option value="${beE(v)}"${v===opSt[key]?' selected':''}>${beE(v)}</option>`).join('')};
  const filtered=()=>{const t=opSt.q.trim().toLowerCase();
    return items.filter(x=>(opSt.show==='alle'||(opSt.show==='erledigt')===opIsDone(x))&&(!opSt.gewerk||(x.gewerk||'').trim()===opSt.gewerk)&&(!opSt.firma||(x.firma||'').trim()===opSt.firma)
      &&(!opSt.bv||x.bv===opSt.bv)&&(!opSt.haus||String(x.haus||0)===opSt.haus)&&(!t||[x.gewerk,x.firma,x.stelle,x.beschreibung,x.notiz,x.bv].some(v=>String(v||'').toLowerCase().includes(t))))}
  const byDate=(a,b)=>String(a.angelegt_am||'').localeCompare(String(b.angelegt_am||''))||String(a.created_at||'').localeCompare(String(b.created_at||''));
  const sorter=()=>{const s=opSt.sort,dn=(a,b)=>opIsDone(a)-opIsDone(b); // „Alle“: erledigte unten
    const f={neu:(a,b)=>byDate(b,a),alt:byDate,gewerk:(a,b)=>opCmp(a.gewerk||'\uffff',b.gewerk||'\uffff')||byDate(a,b),firma:(a,b)=>opCmp(a.firma||'\uffff',b.firma||'\uffff')||byDate(a,b),
      bv:(a,b)=>opCmp(a.bv,b.bv)||byDate(a,b),haus:(a,b)=>(a.haus||99)-(b.haus||99)||byDate(a,b),frist:(a,b)=>String(a.frist||'9999').localeCompare(String(b.frist||'9999'))||byDate(a,b)}[s]||byDate;
    return(a,b)=>dn(a,b)||f(a,b)};
  const card=x=>{const done=opIsDone(x),late=!done&&x.frist&&x.frist<beToday();
    const title=[x.gewerk,x.firma].filter(Boolean).join(' · ')||'–';
    const meta=[x.stelle,(pid?'':x.bv),`${x.manual&&x.quelle!=='besuch'?'Eingang':'angelegt'} ${beDate(x.angelegt_am)}`+(!done&&opDays(x.angelegt_am)>0?` (seit ${opDays(x.angelegt_am)} ${opDays(x.angelegt_am)===1?'Tag':'Tagen'})`:'')].filter(Boolean).map(beE).join(' · ');
    return`<div class="card op ${done?'done':''}" data-id="${x.id}"><input type="checkbox" class="opck" data-id="${x.id}" ${done?'checked':''} aria-label="${done?'wieder öffnen':'abhaken'}">
      <div class="opb" data-edit="${x.id}"><div class="beet"><b>${beE(title)}</b>${x.haus?`<span class="chip haus">Haus ${x.haus}</span>`:''}<span class="chip art q${x.quelle}">${OP_Q[x.quelle]||x.quelle}</span>${x.dirty?'<span class="muted" title="noch nicht hochgeladen">⏳</span>':''}</div>
      <div class="muted">${meta}</div>${x.beschreibung?`<div class="bed">${beE(x.beschreibung)}</div>`:''}
      ${x.frist?`<span class="chip fr ${late?'late':''}">Frist ${beDate(x.frist)}</span> `:''}${x.rueckmeldung_am&&!done?`<span class="chip rm">Firma meldet erledigt am ${beDate(x.rueckmeldung_am)} – prüfen</span>`:''}
      ${x.notiz?`<div class="opn">📝 ${beE(x.notiz)}</div>`:''}
      ${done?`<div class="opd">✓ erledigt am ${beDate(x.erledigt_am)}${x.erledigt_von?' · '+beE(x.erledigt_von):''}</div>`:''}
      ${x.fotos.length?`<div class="thumbs">${x.fotos.map(f=>f.data?`<img src="data:image/jpeg;base64,${f.data}" alt="">`:'<span class="thx">📷</span>').join('')}</div>`:''}</div></div>`};
  const drawList=()=>{const all=items,c={offen:all.filter(x=>!opIsDone(x)).length};c.erledigt=all.length-c.offen;c.alle=all.length;
    seg.innerHTML=[['offen','Offen'],['erledigt','Erledigt'],['alle','Alle']].map(([k,l])=>`<label><input type="radio" name="opShow" value="${k}"${opSt.show===k?' checked':''}><span>${l} (${c[k]})</span></label>`).join('');
    seg.querySelectorAll('input').forEach(i=>i.onchange=()=>{opSt.show=i.value;drawList()});
    const rows=filtered().sort(sorter()),grp={gewerk:x=>x.gewerk||'Ohne Gewerk',firma:x=>x.firma||'Ohne Firma',bv:x=>x.bv,haus:x=>x.haus?'Haus '+x.haus:'Ohne Haus'}[opSt.sort];
    let x='';
    if(!rows.length)x=`<div class="empty">${!all.length?'Noch keine offenen Punkte.<br>Sie entstehen automatisch aus den Besuchsprotokollen – oder tippe auf „+ Neuer Punkt“, wenn du etwas per E-Mail oder Telefon bekommen hast.'
      :opSt.show==='offen'&&c.offen===0?'Alles erledigt 🎉':'Keine Punkte für diesen Filter.'}</div>`;
    let cur=null;for(const r of rows){if(grp){const g=grp(r);if(g!==cur){cur=g;x+=`<div class="beg">${beE(g)} <span class="muted">(${rows.filter(y=>grp(y)===g).length})</span></div>`}}x+=card(r)}
    if(opSt.show==='offen'&&rows.length>1)x+=`<div class="row"><button class="sec" id="opAll">Alle ${rows.length} angezeigten als erledigt markieren</button></div>`;
    $('#opList').innerHTML=x;
    const pb=$('#opPdf');if(pb){pb.textContent=`📄 PDF exportieren (${rows.length} ${rows.length===1?'Punkt':'Punkte'})`;pb.disabled=!rows.length;
      pb.onclick=()=>{const fl=[['Status',{offen:'Offen',erledigt:'Erledigt',alle:'Alle'}[opSt.show]]];
        if(opSt.gewerk)fl.push(['Gewerk',opSt.gewerk]);if(opSt.firma)fl.push(['Firma',opSt.firma]);if(opSt.bv)fl.push(['Bauvorhaben',opSt.bv]);
        if(opSt.haus)fl.push(['Haus',opSt.haus==='0'?'Ohne Haus':'Haus '+opSt.haus]);if(opSt.q.trim())fl.push(['Suche',`„${opSt.q.trim()}“`]);
        opSharePdf(rows.slice(),grp||null,{titel:p?p.name:'Alle Bauvorhaben',stand:beDT(new Date().toISOString()),user:Sync.user&&Sync.user.email,filter:fl,sort:OP_SORTL[opSt.sort]||opSt.sort,showBv:!pid},pb)}}
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
    const hs=$('#opHs');if(hs){if(opSt.haus&&+opSt.haus>hn)opSt.haus='';hs.innerHTML=`<option value="">Alle Häuser</option>${Array.from({length:hn},(_,i)=>i+1).map(k=>`<option value="${k}"${String(k)===opSt.haus?' selected':''}>Haus ${k} (${items.filter(i=>i.haus===k&&!opIsDone(i)).length} offen)</option>`).join('')}<option value="0"${opSt.haus==='0'?' selected':''}>Ohne Haus</option>`}
    $('#opMiss').hidden=!BE.opMissing;drawList();beStat(null)};
  sort.onchange=()=>{opSt.sort=sort.value;drawList()};q.oninput=()=>{opSt.q=q.value;drawList()};
  const hns=$('#opHn');if(hns)hns.onchange=()=>{p.haeuser=+hns.value;p.mod=Date.now();save();opSt.haus='';opView(p,el)};
  for(const[id,k]of[['#opGw','gewerk'],['#opFi','firma'],['#opBv','bv'],['#opHs','haus']]){const s=$(id);if(s)s.onchange=()=>{opSt[k]=s.value;drawList()}}
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
  const h0=it?it.haus||0:(+opSt.haus||0);
  d.innerHTML=`<form id="opForm" class="beform" novalidate><h2>${isNew?'Neuer offener Punkt':ro?'Offener Punkt':'Punkt bearbeiten'}</h2>
    ${isNew&&!p?`<label>Bauvorhaben<select name="pid">${projs.map(x=>`<option value="${beE(x.id)}"${x.id===pid0?' selected':''}>${beE(x.name)}</option>`).join('')}</select></label>`:''}
    <div id="opHaus">${opHausSeg(opHausN(opProj(pid0)),h0)}</div>
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
  if(f.pid)f.pid.addEventListener('change',()=>{const c=f.haus?+f.haus.value:h0;$d('#opHaus').innerHTML=opHausSeg(opHausN(opProj(f.pid.value)),c)});
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
    const hv=f.haus?+f.haus.value:null;
    if(ro){await opPatch(it,status);if(hv!=null)opSetHaus(it.projekt_id,it,hv)}
    else{const txt=val('beschreibung');if(!txt&&!val('gewerk')&&!val('firma')&&!fotos.length){$d('#opErr').textContent='Bitte mindestens eine Beschreibung eintragen.';f.beschreibung.focus();return}
      const pid=it?it.projekt_id:(p?p.id:f.pid.value),pj=st.projects.find(x=>x.id===pid);
      const row={...(it?await BeDB.get('punkte',it.id):{id:beUuid(),uid:u,created_at:now,rev:0,srv:0}),projekt_id:pid,bv:pj?pj.name:(it&&it.bv)||'',quelle:f.quelle.value,
        gewerk:val('gewerk'),firma:val('firma'),stelle:val('stelle'),beschreibung:txt,frist:val('frist'),angelegt_am:val('angelegt_am')||beToday(),...status};
      row.dirty=1;row.rev=(row.rev||0)+1;
      if(hv!=null)opSetHaus(pid,row,hv);
      await BeDB.tx(o=>{o.punkte.put(row);
        for(const q of removed){o.pfotos.delete(q.id);if(q.srv)o.tomb.put({id:q.id,table:'offene_punkte_fotos',uid:u})}
        fotos.forEach((q,i)=>{if(q.isNew)o.pfotos.put({id:q.id,punkt_id:row.id,uid:u,pos:i,data:q.data,w:q.w,h:q.h,dirty:1,rev:1,srv:0})})});
      BE.kick(200)}
    d.close();redraw()};
  d.showModal();
}

// ---------- PDF-Export der aktuell angezeigten Liste (jsPDF aus vendor/, gleiche Filter/Sortierung/Gruppen wie am Bildschirm) ----------
const OP_SORTL={neu:'Neueste zuerst',alt:'Älteste zuerst',gewerk:'Nach Gewerk',firma:'Nach Firma',frist:'Nach Frist',haus:'Nach Haus',bv:'Nach Bauvorhaben'};
// J: jsPDF-Konstruktor; rows: angezeigte Punkte in Anzeige-Reihenfolge; grp: Gruppenfunktion oder null; meta: {titel,stand,user,filter:[[k,v]],sort,showBv}
function opPdf(J,rows,grp,meta){
  const doc=new J({unit:'mm',format:'a4',compress:true}),W=210,H=297,M=15,CW=W-2*M,BOT=H-16,A=beAnsi;let y=M;
  const INK=[25,25,25],GREY=[95,94,91],LINE=[230,229,226];
  const need=h=>{if(y+h>BOT){doc.addPage();y=M;return true}return false};
  const lines=(t,size,bold,w)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);return doc.splitTextToSize(A(t),w)};
  const put=(ls,x,size,bold,color,lh)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);for(const l of ls){doc.text(l,x,y+lh*0.8);y+=lh}};
  // Kopf
  put(['Offene Punkte'],M,22,true,INK,9);y+=1;
  put(lines(meta.titel,13,true,CW),M,13,true,INK,5.6);y+=1.5;
  const kv=[['Stand',meta.stand],...(meta.user?[['Erstellt von',meta.user]]:[]),...meta.filter,['Sortierung',meta.sort],['Anzahl',`${rows.length} ${rows.length===1?'Punkt':'Punkte'}`]];
  for(const[k,v]of kv){doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(...GREY);doc.text(A(k),M,y+3.4);
    const ls=lines(v,9.5,false,CW-32);put(ls,M+32,9.5,false,INK,4.3)}
  y+=2;doc.setDrawColor(...INK);doc.setLineWidth(0.4);doc.line(M,y,W-M,y);y+=5;
  if(!rows.length){put(['Keine Punkte für diese Auswahl.'],M,11,false,GREY,5);}
  // Punkte
  const fields=x=>{const f=[];if(x.haus)f.push(['Haus','Haus '+x.haus]);if(x.stelle)f.push(['Stelle',x.stelle]);if(meta.showBv&&x.bv)f.push(['Bauvorhaben',x.bv]);
    f.push(['Quelle',(OP_Q[x.quelle]||x.quelle||'')+` · ${x.manual&&x.quelle!=='besuch'?'Eingang':'angelegt'} ${beDate(x.angelegt_am)}`]);
    if(x.frist)f.push(['Frist',beDate(x.frist)]);if(x.rueckmeldung_am)f.push(['Rückmeldung','Firma meldet erledigt am '+beDate(x.rueckmeldung_am)]);
    if(x.notiz)f.push(['Notiz',x.notiz]);return f};
  const status=x=>opIsDone(x)?['erledigt '+beDate(x.erledigt_am),[47,125,79]]:x.frist&&x.frist<beToday()?['überfällig',[196,56,44]]:['offen',[11,107,203]];
  const TH=24;let nr=0,cur=null;
  for(const x of rows){nr++;
    const title=`${nr}. ${[x.gewerk,x.firma].filter(Boolean).join(' · ')||'–'}`,[stt,stc]=status(x);
    doc.setFont('helvetica','bold');doc.setFontSize(9);const sw=doc.getTextWidth(A(stt))+5;
    const tl=lines(title,11,true,CW-sw-6),bl=x.beschreibung?lines(x.beschreibung,10.5,false,CW-4):[];
    const fl=fields(x).map(([k,v])=>[k,lines(v,9.5,false,CW-30)]);const fotos=(x.fotos||[]).filter(f=>f.data).slice(0,3);
    const est=tl.length*5+bl.length*4.7+fl.reduce((s,[,l])=>s+l.length*4.2,0)+(fotos.length?TH+3:0)+7;
    if(grp){const g=grp(x);if(g!==cur){cur=g;need(12+Math.min(est,60));const n=rows.filter(r=>grp(r)===g).length;
      doc.setFillColor(241,241,239);doc.roundedRect(M,y,CW,8.5,1.5,1.5,'F');doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(...INK);
      doc.text(A(g),M+3,y+5.9);doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(...GREY);doc.text(`${n} ${n===1?'Punkt':'Punkte'}`,W-M-3,y+5.9,{align:'right'});y+=12}}
    need(Math.min(est,BOT-M));
    const y0=y;put(tl,M+1,11,true,opIsDone(x)?GREY:INK,5);
    doc.setFillColor(...stc.map(c=>Math.round(c+(255-c)*0.86)));doc.roundedRect(W-M-sw,y0+0.3,sw,5,1.2,1.2,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...stc);doc.text(A(stt),W-M-sw/2,y0+3.8,{align:'center'});
    if(bl.length){y+=0.5;for(const l of bl){need(4.7);put([l],M+1,10.5,false,INK,4.7)}}
    y+=0.8;for(const[k,ls]of fl){ls.forEach((l,i)=>{need(4.2);if(!i){doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...GREY);doc.text(A(k),M+1,y+3.4)}put([l],M+30,9.5,false,INK,4.2)})}
    if(fotos.length){need(TH+3);let fx=M+1;for(const f of fotos){try{const src='data:image/jpeg;base64,'+f.data,pr=doc.getImageProperties(src),s=TH/pr.height,w=Math.min(pr.width*s,45);
      doc.addImage(src,'JPEG',fx,y+1,w,TH,f.id||undefined,'FAST');fx+=w+2}catch(e){}}y+=TH+3}
    y+=1.5;doc.setDrawColor(...LINE);doc.setLineWidth(0.2);doc.line(M,y,W-M,y);y+=3.5}
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120,120,120);
    doc.text(A(`Offene Punkte · ${meta.titel} · ${meta.stand}`),M,H-8);doc.text(`Seite ${i} von ${pages}`,W-M,H-8,{align:'right'})}
  return doc}
const opPdfName=t=>`Offene-Punkte_${String(t).replace(/[^\wäöüÄÖÜß-]+/g,'_').replace(/^_+|_+$/g,'')||'Liste'}_${beToday()}.pdf`;
async function opSharePdf(rows,grp,meta,btn){
  const t=btn.textContent;btn.disabled=true;btn.textContent='PDF wird erstellt …';let blob;const name=opPdfName(meta.titel);
  try{const J=await beLoadPdf();blob=opPdf(J,rows,grp,meta).output('blob')}
  catch(e){alert('Das PDF konnte nicht erstellt werden: '+e.message);return}
  finally{btn.disabled=false;btn.textContent=t}
  window._opLastPdf={name,blob};
  const file=new File([blob],name,{type:'application/pdf'});
  const dl=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)};
  let can=false;try{can=!!(navigator.canShare&&navigator.canShare({files:[file]}))}catch(e){}
  if(!can){dl();return}
  let d=$('#opPdfDlg');if(!d){d=document.createElement('dialog');d.id='opPdfDlg';document.body.appendChild(d)}
  d.innerHTML=`<h2>PDF Offene Punkte</h2><p class="muted">${beE(name)} · ${rows.length} ${rows.length===1?'Punkt':'Punkte'} · ${Math.max(1,Math.round(blob.size/1024))} KB</p>
    <div class="row"><button class="pri" id="opPdfShare">Teilen / Sichern …</button></div><div class="row"><button class="sec" id="opPdfDl">Herunterladen</button><button class="sec" id="opPdfX">Schließen</button></div>`;
  d.querySelector('#opPdfShare').onclick=async()=>{try{await navigator.share({files:[file],title:name})}catch(e){if(e.name!=='AbortError')dl()}d.close()};
  d.querySelector('#opPdfDl').onclick=()=>{dl();d.close()};d.querySelector('#opPdfX').onclick=()=>d.close();d.showModal()}
