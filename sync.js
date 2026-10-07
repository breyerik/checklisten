// Cloud-Sync über Supabase (Auth + REST per fetch, keine externe Bibliothek)
// ---------- Reine Merge-Logik (auch in Node testbar) ----------
const ts=p=>Math.max(p.mod||0,p.created||0);
function mergeProject(l,r){
  const done={},undone={},ids=new Set([l.done,r.done,l.undone,r.undone].flatMap(o=>Object.keys(o||{})));
  for(const id of ids){
    const d=Math.max(+(l.done||{})[id]||0,+(r.done||{})[id]||0),u=Math.max(+(l.undone||{})[id]||0,+(r.undone||{})[id]||0);
    if(d&&d>=u)done[id]=d;else if(u)undone[id]=u;}
  const n=ts(r)>ts(l)?r:l;
  return{...r,...l,name:n.name,addr:n.addr,tpl:n.tpl,bzpSheet:n.bzpSheet,created:Math.min(l.created||Infinity,r.created||Infinity)===Infinity?undefined:Math.min(l.created||Infinity,r.created||Infinity),
    mod:Math.max(l.mod||0,r.mod||0)||undefined,done,undone,open:l.open||{}};
}
// local = Gerätestand, remote = Cloud-Stand. UI-Zustand (open) bleibt lokal.
function mergeStates(local,remote){
  local=local||{projects:[]};remote=remote||{projects:[]};
  const deleted={...(remote.deleted||{})};
  for(const[k,v]of Object.entries(local.deleted||{}))deleted[k]=Math.max(deleted[k]||0,v);
  const rm=new Map((remote.projects||[]).map(p=>[p.id,p])),out=[];
  for(const p of local.projects||[]){const r=rm.get(p.id);out.push(r?mergeProject(p,r):p);rm.delete(p.id)}
  for(const r of rm.values())out.push({...r,open:{0:true}});
  const projects=out.filter(p=>!(deleted[p.id]&&deleted[p.id]>=ts(p)))
    .sort((a,b)=>(b.created||0)-(a.created||0)||(a.id<b.id?-1:1));
  return{...remote,...local,projects,deleted};
}
// Was in die Cloud geht: ohne UI-Zustand, Schlüssel sortiert (für Vergleich)
function canon(s){
  const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
  return sort({...s,projects:(s.projects||[]).map(({open,...p})=>p)});
}
const same=(a,b)=>JSON.stringify(canon(a||{projects:[]}))===JSON.stringify(canon(b||{projects:[]}));
if(typeof module!=='undefined')module.exports={mergeStates,mergeProject,canon,same};

// ---------- Client (nur im Browser) ----------
const Sync=typeof window==='undefined'?null:(()=>{
  const CFG=window.SUPABASE_CFG||{},SK='bs-checklisten-sync',on=!!(CFG.url&&CFG.anonKey);
  let ss=JSON.parse(localStorage.getItem(SK)||'{}'),H,timer,running=false,again=false,status='',detail='';
  const keep=()=>localStorage.setItem(SK,JSON.stringify(ss));
  const $=s=>document.querySelector(s),e$=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const redirect=()=>location.origin+location.pathname;
  class HttpErr extends Error{constructor(st,msg){super(msg);this.status=st}}
  async function call(path,{method='GET',body,auth=true,headers={}}={}){
    const h={apikey:CFG.anonKey,'Content-Type':'application/json',...headers};
    if(auth&&ss.session)h.Authorization='Bearer '+ss.session.access_token;
    const r=await fetch(CFG.url+path,{method,headers:h,body:body&&JSON.stringify(body),cache:'no-store'});
    const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}
    if(!r.ok)throw new HttpErr(r.status,(j&&(j.msg||j.message||j.error_description||j.error))||('HTTP '+r.status));
    return j;
  }
  const setSession=j=>{ss.session={access_token:j.access_token,refresh_token:j.refresh_token,
    expires_at:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),user:{id:j.user.id,email:j.user.email}};keep()};
  async function token(){
    const s=ss.session;if(!s)throw new HttpErr(401,'Nicht angemeldet');
    if(s.expires_at*1000-60000>Date.now())return;
    try{setSession(await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:s.refresh_token}}))}
    catch(e){if(e.status){ss.session=null;keep();set('relogin')}throw e}
  }
  const txt={off:'Nicht angemeldet · Cloud-Sync einrichten',busy:'Synchronisiere …',ok:'Synchronisiert',offline:'Offline · Änderungen werden später übertragen',
    err:'Sync-Fehler · tippen für Details',relogin:'Bitte neu anmelden',pending:'Änderungen werden übertragen …'};
  function set(s,d=''){status=s;detail=d;const el=$('#sync');if(!el)return;
    el.hidden=!on;el.className='sync '+s;
    el.textContent='☁︎ '+txt[s]+(s==='ok'&&ss.lastAt?' · '+new Date(ss.lastAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'')+(ss.session&&s!=='off'?' · '+ss.session.user.email:'');}
  const offline=e=>!navigator.onLine||(e instanceof TypeError);
  // Auswahl beim ersten Anmelden, wenn Gerät und Cloud Daten haben
  function choose(nl,nr){return new Promise(res=>{const d=$('#choice');
    d.querySelector('p').innerHTML=`Auf diesem Gerät: <b>${nl} Bauvorhaben</b><br>In der Cloud: <b>${nr} Bauvorhaben</b><br><br>Wie sollen die Stände zusammengeführt werden?`;
    d.onclose=()=>res(d.returnValue||'cancel');d.returnValue='';d.showModal()})}
  async function pull(){const uid=ss.session.user.id;
    const rows=await call(`/rest/v1/checklisten_state?select=data,updated_at&user_id=eq.${uid}`);return rows[0]||null}
  async function write(data,prevAt){const uid=ss.session.user.id,now=new Date().toISOString();
    const pref={Prefer:'return=representation'};
    if(!prevAt){try{return(await call('/rest/v1/checklisten_state',{method:'POST',headers:pref,body:{user_id:uid,data,updated_at:now}}))[0]}
      catch(e){if(e.status===409)return null;throw e}}
    const r=await call(`/rest/v1/checklisten_state?user_id=eq.${uid}&updated_at=eq.${encodeURIComponent(prevAt)}`,{method:'PATCH',headers:pref,body:{data,updated_at:now}});
    return r[0]||null; // null = jemand anderes war schneller -> neu abgleichen
  }
  async function sync(){
    if(!on)return;if(!ss.session){set('off');return}
    if(running){again=true;return}running=true;
    try{
      if(!navigator.onLine){set('offline');return}
      set(ss.dirty?'pending':'busy');await token();
      for(let i=0;i<4;i++){
        const row=await pull(),remote=row&&row.data,uid=ss.session.user.id,local=H.get();
        let merged,force=false;
        if(ss.lastUser!==uid&&local.projects.length&&remote&&remote.projects&&remote.projects.length){
          const c=await choose(local.projects.length,remote.projects.length);
          if(c==='cancel'){await signOut(true);return}
          const cur=H.get();
          if(c==='remote')merged=mergeStates({projects:[],deleted:{}},remote);
          else if(c==='local'){merged=mergeStates(cur,{projects:[]});const ids=new Set(cur.projects.map(p=>p.id));
            for(const p of remote.projects)if(!ids.has(p.id))merged.deleted[p.id]=Date.now();force=true}
          else merged=mergeStates(cur,remote);
          if(c==='remote')for(const p of merged.projects){const o=cur.projects.find(x=>x.id===p.id);if(o)p.open=o.open}
        }else merged=mergeStates(H.get(),remote);
        ss.lastUser=uid;ss.dirty=false;keep();
        if(!same(merged,H.get())||JSON.stringify(merged)!==JSON.stringify(H.get()))H.set(merged);
        if(row&&!force&&same(merged,remote)){ss.lastAt=Date.now();keep();set('ok');return}
        const w=await write(canon(merged),row&&row.updated_at);
        if(w){ss.lastAt=Date.now();keep();set('ok');return}
      }
      set('err','Konflikt konnte nicht aufgelöst werden.');
    }catch(e){
      if(offline(e)){ss.dirty=true;keep();set('offline')}
      else if(!ss.session)set('relogin');
      else if(e.status===401){ss.session.expires_at=0;keep();set('err',e.message)}
      else set('err',e.message);
    }finally{running=false;if(again){again=false;setTimeout(sync,50)}}
  }
  function changed(){if(!on||!ss.session)return;ss.dirty=true;keep();set(navigator.onLine?'pending':'offline');clearTimeout(timer);timer=setTimeout(sync,1500)}
  async function signIn(email,password){
    setSession(await call('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email,password}}));await sync();H.auth&&H.auth(true)}
  async function signUp(email,password){
    const j=await call('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect()),{method:'POST',auth:false,body:{email,password}});
    if(j&&j.access_token){setSession(j);await sync();H.auth&&H.auth(true);return'in'}return'confirm'}
  async function recover(email){await call('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect()),{method:'POST',auth:false,body:{email}})}
  async function signOut(quiet){if(ss.session){try{await call('/auth/v1/logout',{method:'POST'})}catch(e){}}
    ss.session=null;ss.dirty=false;keep();set('off');H.auth&&H.auth(false)}
  // Authentifizierter Lesezugriff für weitere Daten (z. B. Bauzeitenplan)
  async function api(path){if(!ss.session)throw new HttpErr(401,'Nicht angemeldet');await token();return call(path)}
  // Konto-Dialog
  function account(msg=''){
    const d=$('#acct'),u=ss.session&&ss.session.user,err=status==='err'&&detail?`<p class="msg err">Letzter Fehler: ${e$(detail)}</p>`:'';
    d.innerHTML=u?`<h2>Cloud-Sync</h2><p>Angemeldet als <b>${e$(u.email)}</b>.</p><p class="muted">Alle Bauvorhaben und Haken werden mit deinen anderen Geräten abgeglichen, auf denen du mit demselben Konto angemeldet bist.</p>${err}<p class="msg">${msg}</p>
      <div class="row"><button id="aSync" class="pri">Jetzt synchronisieren</button></div>
      <div class="row"><button id="aOut" class="sec">Abmelden</button><button id="aClose" class="sec">Schließen</button></div>
      <p class="muted">Beim Abmelden bleiben die Daten auf diesem Gerät erhalten.</p>`
    :`<h2>Cloud-Sync</h2><p class="muted">Melde dich auf iPhone und iPad mit demselben Konto an, dann haben beide Geräte denselben Stand. Ohne Anmeldung funktioniert die App wie bisher nur auf diesem Gerät.</p>
      <form id="aForm"><label>E-Mail<input name="email" type="email" autocomplete="username" required></label>
      <label>Passwort<input name="pw" type="password" autocomplete="current-password" minlength="6" required></label>
      <p class="msg">${msg}</p>
      <div class="row"><button value="in" class="pri">Anmelden</button></div>
      <div class="row"><button value="up" class="sec">Konto anlegen</button><button value="close" type="button" id="aClose" class="sec">Schließen</button></div>
      <p><a href="#" id="aReset">Passwort vergessen?</a></p></form>`;
    const m=t=>{d.querySelector('.msg').textContent=t};
    const close=d.querySelector('#aClose');close.onclick=()=>d.close();
    if(u){d.querySelector('#aSync').onclick=async()=>{m('Synchronisiere …');await sync();m(status==='ok'?'Synchronisiert.':txt[status]+(detail?': '+detail:''))};
      d.querySelector('#aOut').onclick=async()=>{if(confirm('Abmelden? Die Daten bleiben auf diesem Gerät, werden aber nicht mehr abgeglichen.')){await signOut();account('Abgemeldet.')}}}
    else{const f=d.querySelector('#aForm');let act='in';
      f.querySelectorAll('button[value]').forEach(b=>b.onclick=()=>act=b.value);
      f.onsubmit=async e=>{e.preventDefault();const email=f.email.value.trim(),pw=f.pw.value;
        try{if(act==='up'){m('Lege Konto an …');const r=await signUp(email,pw);
            if(r==='confirm'){m('Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link in der Mail. Danach hier mit E-Mail und Passwort anmelden.');return}}
          else{m('Melde an …');await signIn(email,pw)}
          d.close();
        }catch(e){m(e.status?fehler(e.message):'Keine Verbindung. Bitte später erneut versuchen.')}};
      d.querySelector('#aReset').onclick=async e=>{e.preventDefault();const email=f.email.value.trim();
        if(!email){m('Bitte zuerst die E-Mail-Adresse eintragen.');return}
        try{await recover(email);m('Wenn ein Konto existiert, kommt gleich eine Mail mit einem Link. Der Link öffnet sich in Safari: dort ein neues Passwort festlegen und dich danach hier in der App anmelden.')}
        catch(e){m(e.status?fehler(e.message):'Keine Verbindung.')}}}
    if(!d.open)d.showModal();
  }
  const fehler=t=>({'Invalid login credentials':'E-Mail oder Passwort falsch.','Email not confirmed':'Die E-Mail-Adresse ist noch nicht bestätigt. Bitte den Link in der Bestätigungsmail öffnen.',
    'User already registered':'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.',
    'email rate limit exceeded':'Gerade wurden zu viele E-Mails verschickt. Bitte in etwa einer Stunde erneut versuchen.'}[t]||(/password/i.test(t)&&/6|short|weak/i.test(t)?'Das Passwort ist zu kurz oder zu schwach (mindestens 6 Zeichen).':'Fehler: '+t));
  // Rückkehr aus Mail-Links (Bestätigung / Passwort zurücksetzen)
  async function handleRedirect(){
    const h=location.hash;if(!/access_token=|error_description=/.test(h))return;
    const q=new URLSearchParams(h.slice(1));history.replaceState(null,'',location.pathname+location.search);
    if(q.get('error_description')){alert('Der Link ist ungültig oder abgelaufen: '+q.get('error_description'));return}
    const tok={access_token:q.get('access_token'),refresh_token:q.get('refresh_token'),expires_in:+q.get('expires_in')||3600};
    try{ss.session={...tok,expires_at:Math.floor(Date.now()/1000)+tok.expires_in,user:{id:'',email:''}};
      const u=await call('/auth/v1/user');setSession({...tok,user:u});
    }catch(e){ss.session=null;keep();alert('Anmeldung über den Link fehlgeschlagen.');return}
    if(q.get('type')==='recovery'){const d=$('#acct');
      d.innerHTML=`<h2>Neues Passwort</h2><form id="pwF"><label>Neues Passwort<input name="pw" type="password" autocomplete="new-password" minlength="6" required></label><p class="msg"></p>
        <div class="row"><button class="pri">Speichern</button></div></form>`;
      const f=d.querySelector('#pwF');f.onsubmit=async e=>{e.preventDefault();
        try{await call('/auth/v1/user',{method:'PUT',body:{password:f.pw.value}});d.close();
          alert('Passwort geändert. Öffne jetzt die App vom Home-Bildschirm und melde dich dort mit dem neuen Passwort an.');sync()}
        catch(err){d.querySelector('.msg').textContent=err.status?fehler(err.message):'Keine Verbindung.'}};d.showModal();
    }else{alert('E-Mail-Adresse bestätigt. Öffne jetzt die App vom Home-Bildschirm und melde dich dort mit E-Mail und Passwort an.');sync()}
  }
  function init(hooks){H=hooks;if(!on)return;
    $('#sync').onclick=()=>account();set(ss.session?(navigator.onLine?'busy':'offline'):'off');
    addEventListener('online',sync);addEventListener('offline',()=>ss.session&&set('offline'));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync()});
    setInterval(()=>{if(document.visibilityState==='visible'&&ss.session)sync()},60000);
    handleRedirect().then(sync);
  }
  return{init,changed,sync,account,signIn,signOut,api,get status(){return status},get user(){return ss.session&&ss.session.user}};
})();
