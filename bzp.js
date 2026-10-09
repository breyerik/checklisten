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
const bzpSlug=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,60)||'BV';
const bzpFileName=(bv,stand)=>{const st=/^\d{4}-\d{2}-\d{2}$/.test(stand||'')?stand:(String(stand||'').replace(/\./g,'-').replace(/[^0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'')||new Date().toISOString().slice(0,10));
  return`Bauzeitenplan_${bzpSlug(bv)}_${st}.pdf`};
// Nur Zeichen, die die PDF-Standardschrift (WinAnsi) darstellen kann
const BZP_WIN='€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const bzpAnsi=s=>String(s??'').replace(/\r\n?/g,'\n').replace(/[\u2010-\u2012]/g,'-').replace(/\u2212/g,'-').replace(/[\u00a0\u2007\u202f]/g,' ')
  .replace(/[^\n\x20-\x7e\xa0-\xff]/gu,c=>BZP_WIN.includes(c)?c:'?');
// PDF: Querformat A4, Tabelle wie in der Ansicht (Firma, Leistung, Status, Termin)
function bzpPdf(J,{bv,stand,sheetName,sheetTitle,rows,legend}){
  const doc=new J({unit:'mm',format:'a4',orientation:'landscape',compress:true});
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=12,CW=W-2*M,BOT=H-12;
  const cols=[
    {k:'firma',label:'Firma',w:52},
    {k:'leistung',label:'Leistung',w:CW-52-38-48},
    {k:'status',label:'Status',w:38},
    {k:'termin',label:'Termin',w:48}];
  const lg=legend||{};
  const data=rows.map(r=>{const st=r.farbe&&lg[r.farbe];return{firma:r.firma||'',leistung:r.leistung||'',status:st||'',termin:bzpFmt(r.termin),next:!!r.next,past:!!r.past}});
  const title='Bauzeitenplan '+(bv||'');
  const standTxt=bzpStand(stand);
  const sub=[sheetTitle&&sheetName&&bzpNorm(sheetTitle).includes(bzpNorm(sheetName).replace(/^bv /,''))?sheetTitle:(sheetName||'')+(sheetTitle?' · '+sheetTitle:''),'Stand: '+standTxt].filter(Boolean).join('  ·  ');
  const drawHead=()=>{let y=M;
    doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(31,78,121);doc.text(bzpAnsi(title),M,y+5);y+=9;
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,80,80);doc.text(bzpAnsi(sub),M,y+3.5);y+=7;
    doc.setFillColor(31,78,121);doc.rect(M,y,CW,7,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(255,255,255);
    let x=M;for(const c of cols){doc.text(bzpAnsi(c.label),x+1.5,y+4.8);x+=c.w}return y+7};
  let y=drawHead();
  const rowH=(cells)=>{doc.setFont('helvetica','normal');doc.setFontSize(9);let mh=6;
    cells.forEach((t,i)=>{const lines=doc.splitTextToSize(bzpAnsi(t),cols[i].w-3);mh=Math.max(mh,lines.length*4+2)});return{mh,lines:cells.map((t,i)=>doc.splitTextToSize(bzpAnsi(t),cols[i].w-3))}};
  let alt=false;
  for(const r of data){
    const cells=[r.firma,r.leistung,r.status,r.termin];
    let {mh,lines}=rowH(cells);
    if(y+mh>BOT){doc.addPage();y=drawHead();alt=false}
    if(r.next)doc.setFillColor(255,246,214);else if(alt)doc.setFillColor(245,247,250);else doc.setFillColor(255,255,255);
    doc.rect(M,y,CW,mh,'F');
    doc.setDrawColor(230,230,230);doc.setLineWidth(0.2);doc.line(M,y+mh,M+CW,y+mh);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(r.past?170:17,r.past?170:17,r.past?170:17);
    let x=M;lines.forEach((ls,i)=>{ls.forEach((l,j)=>doc.text(l,x+1.5,y+4+j*4));x+=cols[i].w});
    y+=mh;alt=!alt}
  if(!data.length){doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(80,80,80);doc.text('Keine Termine.',M,y+6)}
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120,120,120);
    doc.text(bzpAnsi(`Bauzeitenplan · ${bv||''} · Stand ${standTxt}`),M,H-6);doc.text(`Seite ${i} von ${pages}`,W-M,H-6,{align:'right'})}
  return doc;
}
if(typeof module!=='undefined')module.exports={bzpMatch,bzpParse,bzpClassify,bzpKeys,bzpFmt,bzpStand,bzpSlug,bzpFileName,bzpAnsi,bzpPdf};

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
  let h=head+`<div class="tools"><button id="bzPast">${bzpHidePast?'Vergangene anzeigen':'Vergangene ausblenden'}</button><button id="bzSheet">Blatt ändern</button><button id="bzPdf">Als PDF herunterladen</button></div>`;
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
  $('#bzPdf').onclick=()=>bzpSharePdf(p,r.row,sh,$('#bzPdf'));
}
let bzpPdfLib=null;
const bzpLoadPdf=()=>bzpPdfLib||(bzpPdfLib=new Promise((res,rej)=>{if(window.jspdf)return res(window.jspdf.jsPDF);
  const s=document.createElement('script');s.src='vendor/jspdf.umd.min.js';s.onload=()=>res(window.jspdf.jsPDF);s.onerror=()=>{bzpPdfLib=null;rej(new Error('PDF-Bibliothek konnte nicht geladen werden'))};document.head.appendChild(s)}));
async function bzpSharePdf(p,row,sh,btn){
  const t=btn.textContent;btn.disabled=true;btn.textContent='PDF wird erstellt …';
  const stand=row.stand||row.data.stand||'';
  const visible=bzpClassify(sh.rows).filter(x=>!(bzpHidePast&&x.past));
  let blob,name=bzpFileName(p.name,stand);
  try{const J=await bzpLoadPdf();
    blob=bzpPdf(J,{bv:p.name,stand,sheetName:sh.name,sheetTitle:sh.title,rows:visible,legend:sh.legend||{}}).output('blob')}
  catch(e){alert('Das PDF konnte nicht erstellt werden: '+e.message);return}
  finally{btn.disabled=false;btn.textContent=t}
  const file=new File([blob],name,{type:'application/pdf'});
  const dl=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)};
  let can=false;try{can=!!(navigator.canShare&&navigator.canShare({files:[file]}))}catch(e){}
  if(!can){dl();return}
  let d=$('#bzPdfDlg');if(!d){d=document.createElement('dialog');d.id='bzPdfDlg';document.body.appendChild(d)}
  d.innerHTML=`<h2>Bauzeitenplan als PDF</h2><p class="muted">${esc(name)} · ${Math.max(1,Math.round(blob.size/1024))} KB</p>
    <div class="row"><button class="pri" id="bzpShare">Teilen …</button></div><div class="row"><button class="sec" id="bzpDl">Herunterladen</button><button class="sec" id="bzpX">Schließen</button></div>`;
  d.querySelector('#bzpShare').onclick=async()=>{try{await navigator.share({files:[file],title:name})}catch(e){if(e.name!=='AbortError')dl()}d.close()};
  d.querySelector('#bzpDl').onclick=()=>{dl();d.close()};d.querySelector('#bzpX').onclick=()=>d.close();d.showModal();
}
