// Gewerk-Listen pro Bauvorhaben (z. B. „Offene Elektroarbeiten“). Die Listen sind reine Daten (GEWERK_LISTEN),
// damit sie leicht für andere Bauvorhaben oder Gewerke wiederverwendet werden können.
// Haken liegen wie bei der Checkliste in p.done / p.undone (ids mit Präfix der Liste) und werden darüber mit der Cloud abgeglichen.
const EL_PUNKTE=[
  {k:'leuchten',t:'Einbauleuchten anbringen'},
  {k:'schalter',t:'Schalter + Steckdosen anbauen'},
  {k:'rollladen',t:'Anschluss Rollladen + Oberlicht'},
  {k:'sikasten',t:'Sicherungskasten fertigstellen'},
  {k:'isg',t:'Steckdose ISG + anschließen an Wärmepumpe'},
  {k:'zirku',t:'Steckdose Zirkulationspumpe'},
  {k:'pv',t:'Montage PV',sub:[{k:'wr',t:'Wechselrichter'},{k:'speicher',t:'Speicher'},{k:'anb',t:'Anbindung Sicherungskasten'}]},
  {k:'aussen',t:'Außenlampen + Hausnummer Fassade'},
  {k:'einfahrt',t:'Außenlampe Einfahrt, Parkplatz & Terrasse'},
  {k:'klingel',t:'Klingelanlage'}];
const GEWERK_LISTEN=[
  {id:'el',slug:'elektro',title:'Offene Elektroarbeiten',icon:'⚡',
   // Für welche Bauvorhaben die Kachel erscheint: Projekt-id oder Name/Adresse (VBW 6 = Vogt-Bornkast-Weg 6)
   match:{ids:['muy4fkwc'],re:/\bvbw\b|vogt.?bornkast|vauban/i},
   gruppen:[1,2,3,4].map(h=>({k:'h'+h,t:'Haus '+h,punkte:h===4?[...EL_PUNKTE,{k:'regen',t:'Regenwasserpumpe anschließen'}]:EL_PUNKTE}))}];
// Flache Liste aller Einträge einer Gruppe; Punkte mit Unterpunkten werden zur Überschrift (nicht selbst abhakbar)
function glRows(L,g){const out=[];
  for(const p of g.punkte){
    if(p.sub){const ids=p.sub.map(s=>`${L.id}-${g.k}-${p.k}-${s.k}`);out.push({head:true,text:p.t,ids});
      p.sub.forEach((s,i)=>out.push({id:ids[i],text:s.t,sub:true}))}
    else out.push({id:`${L.id}-${g.k}-${p.k}`,text:p.t})}
  return out}
const glItems=(L,g)=>glRows(L,g).filter(r=>!r.head);
function glProg(L,p,g){const its=g?glItems(L,g):L.gruppen.flatMap(x=>glItems(L,x)),d=its.filter(i=>p.done[i.id]).length;return{d,n:its.length,pc:its.length?Math.round(d*100/its.length):0}}
const glFor=p=>GEWERK_LISTEN.filter(L=>(p.lists||[]).includes(L.id)||L.match.ids.includes(p.id)||L.match.re.test(p.name+' '+(p.addr||'')));
const glBySlug=s=>GEWERK_LISTEN.find(L=>L.slug===s);
function glTiles(p){return glFor(p).map(L=>{const g=glProg(L,p);
  return`<a class="card tile" href="#/${p.id}/liste/${L.slug}"><span class="ti">${L.icon}</span><span class="tx"><b>${esc(L.title)}</b><span class="muted">${L.gruppen.map(x=>{const q=glProg(L,p,x);return`${esc(x.t)}: ${q.d}/${q.n}`}).join(' · ')}</span>
    <span class="muted">${g.d} von ${g.n} erledigt (${g.pc} %)</span><span class="bar"><i style="width:${g.pc}%"></i></span></span></a>`}).join('')}
let glHide=false;const glOpen={};
function glView(p,L,el){
  $('#title').textContent=p.name;backTo('‹ Übersicht','#/'+p.id);
  const g=glProg(L,p);
  let h=`<div class="card"><b>${L.icon} ${esc(L.title)}</b><div class="muted">${esc(p.name)}${p.addr?' · '+esc(p.addr):''}</div>
  <div style="margin-top:6px"><b>${g.d} von ${g.n} erledigt (${g.pc} %)</b></div><div class="bar"><i style="width:${g.pc}%"></i></div></div>
  <div class="tools"><button id="glTg">${glHide?'Alle anzeigen':'Erledigte ausblenden'}</button><button id="glPdf">📄 Als PDF senden</button></div>`;
  for(const x of L.gruppen){const q=glProg(L,p,x),key=p.id+L.id+x.k,open=glOpen[key]!==false;
    h+=`<details class="sec ${q.d===q.n?'done-sec':''}" data-k="${key}" ${open?'open':''}><summary><span>${esc(x.t)}</span><span class="muted">${q.d}/${q.n}</span></summary>`;
    for(const r of glRows(L,x)){
      if(r.head){const d=r.ids.filter(i=>p.done[i]).length;if(glHide&&d===r.ids.length)continue;
        h+=`<div class="grp glh ${d===r.ids.length?'gldone':''}"><span>${esc(r.text)}</span><span class="muted">${d}/${r.ids.length}</span></div>`;continue}
      const c=!!p.done[r.id];if(glHide&&c)continue;
      h+=`<label class="item ${r.sub?'sub':''} ${c?'checked':''}"><input type="checkbox" data-id="${r.id}" ${c?'checked':''}><span>${esc(r.text)}</span></label>`}
    h+='</details>'}
  el.innerHTML=h;
  el.querySelectorAll('input[data-id]').forEach(cb=>cb.onchange=()=>{const id=cb.dataset.id,t=Date.now();p.undone=p.undone||{};
    if(cb.checked){p.done[id]=t;delete p.undone[id]}else{delete p.done[id];p.undone[id]=t}p.mod=t;save();
    const y=scrollY;glView(p,L,el);scrollTo(0,y)});
  el.querySelectorAll('details').forEach(d=>d.ontoggle=()=>{glOpen[d.dataset.k]=d.open});
  $('#glTg').onclick=()=>{glHide=!glHide;glView(p,L,el)};
  $('#glPdf').onclick=()=>glSharePdf(p,L,$('#glPdf'));
}
// ---------- PDF (A4 hoch, jsPDF aus vendor/) ----------
const glDate=(d=new Date())=>d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
const glFileName=(L,bv,d=new Date())=>`${bzpSlug(L.title)}_${bzpSlug(bv)}_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.pdf`;
function glPdf(J,p,L,now=new Date()){
  const doc=new J({unit:'mm',format:'a4',compress:true}),A=bzpAnsi;
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=16,BOT=H-16,SW=26;
  let y=M;
  const g=glProg(L,p);
  doc.setFont('helvetica','bold');doc.setFontSize(18);doc.setTextColor(31,78,121);doc.text(A(L.title),M,y+4);y+=11;
  doc.setTextColor(0);doc.setFontSize(12);doc.text(A('Bauvorhaben: '+p.name),M,y);y+=5.5;
  doc.setFont('helvetica','normal');doc.setFontSize(10);
  if(p.addr){doc.text(A(p.addr),M,y);y+=5}
  doc.text(A(`Stand: ${glDate(now)}, ${now.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} Uhr · ${g.d} von ${g.n} Punkten erledigt, ${g.n-g.d} offen`),M,y);y+=4;
  doc.setDrawColor(31,78,121);doc.setLineWidth(.5);doc.line(M,y,W-M,y);y+=7;
  const box=(x,yy,on)=>{doc.setDrawColor(90);doc.setLineWidth(.3);doc.rect(x,yy-3.4,3.8,3.8);
    if(on){doc.setDrawColor(30,126,52);doc.setLineWidth(.6);doc.line(x+.7,yy-1.6,x+1.6,yy-.4);doc.line(x+1.6,yy-.4,x+3.2,yy-2.9)}};
  const brk=need=>{if(y+need>BOT){doc.addPage();y=M+4}};
  for(const x of L.gruppen){const q=glProg(L,p,x);brk(Math.min(13+glRows(L,x).length*6.4,BOT-M-4)); // Haus möglichst nicht über zwei Seiten verteilen
    doc.setFillColor(232,238,245);doc.rect(M,y-5,W-2*M,7.5,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(31,78,121);doc.text(A(x.t),M+2,y);
    doc.setFontSize(10);doc.text(A(`${q.d}/${q.n} erledigt`),W-M-2,y,{align:'right'});doc.setTextColor(0);y+=8;
    for(const r of glRows(L,x)){
      const ind=r.sub?8:0,tw=W-2*M-SW-8-ind;
      doc.setFontSize(11);
      if(r.head){const d=r.ids.filter(i=>p.done[i]).length,all=d===r.ids.length;
        doc.setFont('helvetica','bold');const ls=doc.splitTextToSize(A(r.text),tw);brk(ls.length*4.8+1);
        doc.text(ls,M+ind+6,y);doc.setFontSize(9);doc.setTextColor(all?30:120,all?126:120,all?52:120);
        doc.text(A(`${d}/${r.ids.length}`),W-M,y,{align:'right'});doc.setTextColor(0);y+=ls.length*4.8+1.2;continue}
      const on=!!p.done[r.id];doc.setFont('helvetica','normal');
      const ls=doc.splitTextToSize(A(r.text),tw);brk(ls.length*4.8+1.5);
      box(M+ind,y,on);doc.setTextColor(on?110:0);doc.text(ls,M+ind+6,y);
      doc.setFont('helvetica','bold');doc.setFontSize(9);
      if(on){doc.setTextColor(30,126,52);doc.text('erledigt',W-M,y,{align:'right'})}else{doc.setTextColor(176,0,0);doc.text('offen',W-M,y,{align:'right'})}
      doc.setTextColor(0);y+=ls.length*4.8+1.5;
      doc.setDrawColor(230);doc.setLineWidth(.2);doc.line(M+ind,y-2.6,W-M,y-2.6)}
    y+=5}
  const n=doc.getNumberOfPages();
  for(let i=1;i<=n;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120);
    doc.text(A(`${L.title} · ${p.name} · ${glDate(now)}`),M,H-8);doc.text(`Seite ${i}/${n}`,W-M,H-8,{align:'right'})}
  return doc;
}
async function glSharePdf(p,L,btn){
  const t=btn.textContent;btn.disabled=true;btn.textContent='PDF wird erstellt …';
  let blob;const name=glFileName(L,p.name);
  try{const J=await bzpLoadPdf();blob=glPdf(J,p,L).output('blob')}
  catch(e){alert('Das PDF konnte nicht erstellt werden: '+e.message);return}
  finally{btn.disabled=false;btn.textContent=t}
  const file=new File([blob],name,{type:'application/pdf'});
  const dl=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)};
  let can=false;try{can=!!(navigator.canShare&&navigator.canShare({files:[file]}))}catch(e){}
  if(!can){dl();return}
  let d=$('#glPdfDlg');if(!d){d=document.createElement('dialog');d.id='glPdfDlg';document.body.appendChild(d)}
  d.innerHTML=`<h2>${esc(L.title)} als PDF</h2><p class="muted">${esc(name)} · ${Math.max(1,Math.round(blob.size/1024))} KB</p>
    <div class="row"><button class="pri" id="glShare">Teilen …</button></div><div class="row"><button class="sec" id="glDl">Herunterladen</button><button class="sec" id="glX">Schließen</button></div>`;
  d.querySelector('#glShare').onclick=async()=>{try{await navigator.share({files:[file],title:name})}catch(e){if(e.name!=='AbortError')dl()}d.close()};
  d.querySelector('#glDl').onclick=()=>{dl();d.close()};d.querySelector('#glX').onclick=()=>d.close();d.showModal();
}
if(typeof module!=='undefined')module.exports={GEWERK_LISTEN,glRows,glItems,glProg,glFor};
