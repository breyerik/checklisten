// Sichern / Wiederherstellen (Export/Import des lokalen Datenstands)
const BACKUP_FMT='bs-checklisten-backup';
function backupName(d=new Date()){const p=n=>String(n).padStart(2,'0');return`checklisten-backup-${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}.json`}
function makeBackup(state,d=new Date()){return JSON.stringify({format:BACKUP_FMT,version:1,exported:d.toISOString(),data:state},null,1)}
// Liefert {ok:true,state} oder {ok:false,error}
function parseBackup(text,templates){
  let o;try{o=JSON.parse(text)}catch(e){return{ok:false,error:'Die Datei ist keine gültige Sicherungsdatei (kein JSON).'}}
  const s=o&&o.format===BACKUP_FMT?o.data:o; // auch reinen Datenstand akzeptieren
  if(!s||typeof s!=='object'||!Array.isArray(s.projects))return{ok:false,error:'Die Datei enthält keine Checklisten-Daten.'};
  for(const p of s.projects){
    if(!p||typeof p.id!=='string'||typeof p.name!=='string'||!templates[p.tpl]||!p.done||typeof p.done!=='object')
      return{ok:false,error:'Die Datei enthält ein ungültiges Bauvorhaben.'};
    if(typeof p.addr!=='string')p.addr='';if(!p.open||typeof p.open!=='object')p.open={};}
  return{ok:true,state:{...s,projects:s.projects},exported:o.exported||null};
}
async function shareOrDownload(text,name){
  const blob=new Blob([text],{type:'application/json'});
  try{const f=new File([blob],name,{type:'application/json'});
    if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return'shared'}}
  catch(e){if(e&&e.name==='AbortError')return'aborted'}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);return'downloaded';
}
if(typeof module!=='undefined')module.exports={backupName,makeBackup,parseBackup,BACKUP_FMT};
