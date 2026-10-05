'use strict';
/* Add-on: Gesetzessammlungen. Bestehende Menuepunkte und Funktionen bleiben unveraendert. */
(() => {
  let groups = {
    'Arbeitnehmerschutz': [
      ['ArbeitnehmerInnenschutzgesetz','ASchG'],['Sicherheits- und Gesundheitsschutzdokumente','DOK-VO'],
      ['Betriebsrats-Geschäftsordnung 1974','BRGO 1974'],['Allgemeine Arbeitnehmerschutzverordnung','AAV'],
      ['Betriebsbewilligung nach dem Arbeitnehmerschutzgesetz','Betriebs'],['Arbeitsstättenverordnung','AStV'],
      ['Kennzeichnungsverordnung','KennV'],['Aerosolpackungslagerungsverordnung','APLV'],
      ['Elektroschutzverordnung 2012','ESV 2012'],['Arbeitsmittelverordnung','AM-VO'],
      ['Nadelstichverordnung','NastV'],['Verordnung biologische Arbeitsstoffe','VbA'],
      ['Grenzwerteverordnung 2021','GKV'],['Verordnung explosionsfähige Atmosphären','VEXAT'],
      ['Gesundheitsüberwachung am Arbeitsplatz','VGÜ'],['Bildschirmarbeitsverordnung','BS-V'],
      ['Fachkenntnisnachweis-Verordnung','FK-V'],['Verordnung Lärm und Vibrationen','VOLV'],
      ['Verordnung Persönliche Schutzausrüstung','PSA-V'],['Fachausbildung der Sicherheitsfachkräfte','SFK-VO'],
      ['Sicherheitsvertrauenspersonen','SVP-VO'],['Arbeitsmedizinische Zentren','AMZ-VO'],
      ['Sicherheitstechnische Zentren','STZ-VO'],['Arbeitszeitgesetz','AZG'],
      ['Arbeitsruhegesetz','ARG'],['Arbeitsruhegesetz-Verordnung','ARG-VO'],
      ['Nachtschwerarbeitsgesetz','NSchG'],['Behinderteneinstellungsgesetz','BEinstG'],
      ['Gleichbehandlungsgesetz','GlBG'],['Mutterschutzgesetz 1979','MSchG'],
      ['Mutterschutzverordnung','MSchV'],['Kinder- und Jugendlichen-Beschäftigungsgesetz 1987','KJBG'],
      ['Beschäftigungsverbote und -beschränkungen für Jugendliche','KJBG-VO'],
      ['Arbeitsinspektionsgesetz 1993','ArbIG']
    ],
    'Lagerung': [
      ['Verordnung über brennbare Flüssigkeiten 2023','VbF 2023'],
      ['Pyrotechnikgesetz 2010','PyroTG 2010'],
      ['Pyrotechnik-Lagerverordnung 2023','Pyr-LV 2023'],
      ['Aerosolpackungslagerungsverordnung','APLV'],
      ['Chemikaliengesetz 1996','ChemG 1996'],['Gewerbeordnung 1994','GewO 1994'],
      ['Giftverordnung 2000','GiftVO'],['Druckbehälter-Aufstellungs-Verordnung','DBA-VO'],
      ['Verordnung explosionsfähige Atmosphären','VEXAT']
    ],
    'Transport': [
      ['Gefahrgutbeförderungsgesetz',''],['Gefahrgutbeförderungsverordnung',''],
      ['Gefahrgutbeförderungsverordnung Geringe Mengen',''],['Güterbeförderungsgesetz 1995',''],
      ['Grundqualifikations- und Weiterbildungsverordnung – Berufskraftfahrer',''],
      ['Kraftfahrgesetz 1967',''],['Kraftfahrgesetz-Durchführungsverordnung 1967',''],
      ['Straßenverkehrsordnung 1960',''],['Kraftfahrzeug-Haftpflichtversicherungsgesetz 1994',''],
      ['Zulassungsstellenverordnung',''],['Internationaler Eisenbahnverkehr – (COTIF)',''],
      ['Internationaler Eisenbahnverkehr – Protokoll (OTIF)',''],
      ['Eisenbahn- und Kraftfahrzeughaftpflichtgesetz',''],['Luftfahrtgesetz',''],
      ['Austro Control-Gebührenverordnung',''],['Schifffahrtsgesetz',''],
      ['Wasserstraßen-Verkehrsordnung',''],['Seen- und Fluss-Verkehrsordnung',''],
      ['Seeschifffahrts-Verordnung','']
    ]
  };
  const api = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht';
  const evidenceApi='/api/ris-novellen';
  const key = 'rechtsmonitor-sammlungen-v1';
  const collectionsApi='/api/gesetzessammlungen';
  let revision=0,onlineReady=false,saving=false;
  const nav = document.querySelector('.side .nav');
  const wrap = document.querySelector('main.wrap');
  if (!nav || !wrap) { console.error('Gesetzessammlungen: Layout nicht gefunden.'); return; }
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'menuItem';
  button.id = 'menuCollections'; button.textContent = '▤   Gesetzessammlungen';
  nav.append(button);
  const panel = document.createElement('div'); panel.id = 'collectionsPanel'; panel.hidden = true;
  panel.innerHTML = `<div class="eyebrow">RIS · BEARBEITBARE BEOBACHTUNGSLISTE</div>
    <h1>Gesetzessammlungen</h1>
    <p class="sub">Sammlungen und Vorschriften verwalten. Der RIS-Abgleich prüft die aktuell angezeigte Liste.</p>
    <section class="panel" style="margin-top:24px">
      <div class="panelhead"><div><h2>RIS-Abgleich</h2><div class="muted">Erster Abruf legt den Vergleichsstand nur in diesem Browser an.</div></div>
      <button type="button" class="btn" id="collectionsRefresh">Alle Sammlungen prüfen</button></div>
      <div id="collectionsStatus" class="status" role="status" aria-live="polite">Noch kein Abgleich durchgeführt.</div>
      <p class="smallnote">Novellendatum = Kundmachungsdatum des jüngsten in der RIS-Änderungsliste belegten BGBl., nicht Inkrafttreten. Ohne eindeutigen Beleg bleibt es offen. Ein geänderter RIS-Datensatz ist kein Beweis für eine Novelle.</p>
    </section>
    <section class="panel"><div class="panelhead"><div><h2>Sammlungen verwalten</h2><div class="muted">Änderungen werden zentral in Cloudflare D1 gespeichert und sind auf allen Geräten sichtbar. Schreibzugriff nur nach Admin-Anmeldung.</div></div></div>
      <form id="collectionsAddGroup" class="controls"><label class="field search">Neue Sammlung
        <input id="collectionsGroupName" type="text" maxlength="80" required placeholder="Name der neuen Sammlung"></label>
        <button class="btn alt" type="submit">Sammlung hinzufügen</button></form>
      <button type="button" id="collectionsImportLocal" class="btn alt" hidden>Meine bisherige Browser-Liste online übernehmen</button>
      <div id="collectionsEditStatus" class="smallnote" role="status" aria-live="polite" style="margin-top:12px"></div>
    </section><div id="collectionsGroups"></div>`;
  wrap.append(panel);
  const $ = id => document.getElementById(id);
  const normalize = x => String(x || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-AT').replace(/[^a-z0-9]/g,'');
  let saved = {}, current = {}, busy = false;
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
  const cells = new Map();
  const status = (text,warning=false) => { $('collectionsStatus').className = 'status'+(warning?' warn':''); $('collectionsStatus').textContent=text; };
  const editStatus = text => { $('collectionsEditStatus').textContent=text; };
  async function loadOnline(){
    try{const response=await fetch(collectionsApi,{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();if(!data.groups||!Number.isInteger(data.revision))throw Error('Ungültige Serverantwort');
      groups=data.groups;revision=data.revision;onlineReady=true;renderGroups();
      editStatus('Online-Daten geladen · Version '+revision+'. Änderungen sind auf allen Geräten sichtbar.');
      $('collectionsImportLocal').hidden=!localLegacy();
    }catch(e){onlineReady=false;editStatus('Online-Speicher nicht erreichbar ('+String(e.message||e)+'). Bearbeiten gesperrt.');}
  }
  function localLegacy(){try{const x=JSON.parse(localStorage.getItem('rechtsmonitor-sammlungen-liste-v1')||'null');return x&&typeof x==='object'&&!Array.isArray(x)?x:null}catch{return null}}
  $('collectionsImportLocal').addEventListener('click',async()=>{
    const legacy=localLegacy();if(!legacy||!onlineReady||saving||busy)return;
    if(!confirm('Die aktuelle Online-Liste durch die bisherige Liste dieses Browsers ersetzen? Dies betrifft alle Geräte.'))return;
    groups=legacy;
    if(await persist()){$('collectionsImportLocal').hidden=true;localStorage.removeItem('rechtsmonitor-sammlungen-liste-v1');renderGroups();editStatus('Bisherige Browser-Liste online übernommen.');}
  });
  async function persist(){
    if(!onlineReady||saving){editStatus('Online-Speicher nicht bereit oder Speichern läuft.');await loadOnline();return false;}
    saving=true;
    if(!window.rmUser||window.rmUser.role!=='admin'){saving=false;editStatus('Nur Administratoren können Sammlungen ändern. Bitte anmelden.');await loadOnline();return false;}
    try{const response=await fetch(collectionsApi,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({groups,revision})});
      if(!response.ok){throw Error('HTTP '+response.status)}
      const data=await response.json();revision=data.revision;saving=false;editStatus('Online gespeichert · Version '+revision);return true;
    }catch(e){saving=false;await loadOnline();editStatus('Änderung NICHT gespeichert ('+String(e.message||e)+'). Aktueller Serverstand wurde neu geladen.');return false;}
  }
  function renderGroups(){
    cells.clear();$('collectionsGroups').replaceChildren();
    for(const [group,items] of Object.entries(groups)){
      const section=document.createElement('section');section.className='panel';
      const head=document.createElement('div');head.className='panelhead';
      const heading=document.createElement('h2');heading.textContent=group+' · '+items.length+' Vorschriften';head.append(heading);
      const removeGroup=document.createElement('button');removeGroup.type='button';removeGroup.className='btn alt';removeGroup.textContent='Sammlung löschen';
      removeGroup.addEventListener('click',async()=>{if(busy){editStatus('Bitte laufenden RIS-Abgleich abwarten.');return}
        if(!confirm('Sammlung „'+group+'“ samt aller Einträge wirklich entfernen?'))return;
        delete groups[group];if(await persist()){renderGroups();editStatus('Sammlung online entfernt.');}});head.append(removeGroup);section.append(head);
      const form=document.createElement('form');form.className='controls';
      const lawLabel=document.createElement('label');lawLabel.className='field search';lawLabel.textContent='Vorschrift hinzufügen';
      const law=document.createElement('input');law.type='text';law.maxLength=160;law.required=true;law.placeholder='Name der Vorschrift';lawLabel.append(law);form.append(lawLabel);
      const shortLabel=document.createElement('label');shortLabel.className='field';shortLabel.textContent='Abkürzung (optional)';
      const short=document.createElement('input');short.type='text';short.maxLength=40;short.placeholder='z. B. ASchG';shortLabel.append(short);form.append(shortLabel);
      const add=document.createElement('button');add.type='submit';add.className='btn alt';add.textContent='Vorschrift hinzufügen';form.append(add);
      form.addEventListener('submit',async e=>{e.preventDefault();if(busy||saving){editStatus('Bitte laufenden Abgleich oder Speichervorgang abwarten.');return}
        const name=law.value.trim(),abbr=short.value.trim();if(!name)return;
        if(!onlineReady){editStatus('Online-Speicher nicht bereit. Keine Vorschrift gespeichert.');return}
        if(!window.rmUser||window.rmUser.role!=='admin'){editStatus('Nur Administratoren können Sammlungen ändern. Bitte anmelden.');return}
        if(groups[group].some(x=>normalize(x[0])===normalize(name))){editStatus('Diese Vorschrift ist in der Sammlung bereits enthalten.');return}
        add.disabled=true;editStatus('Prüfe Vorschrift im RIS …');
        try{
          const valid=await validateLawInRIS(name,abbr);
          if(!valid){editStatus('Kein eindeutiger RIS-Treffer. Die Vorschrift wurde nicht gespeichert.');return}
          if(!groups[group]){editStatus('Sammlung nicht mehr vorhanden.');return}
          if(groups[group].some(x=>normalize(x[0])===normalize(name))){editStatus('Diese Vorschrift ist in der Sammlung bereits enthalten.');return}
          groups[group].push([name,abbr]);if(await persist()){renderGroups();editStatus('RIS-geprüfte Vorschrift online hinzugefügt: '+name);}
        }catch(err){editStatus('RIS-Prüfung fehlgeschlagen; nichts gespeichert ('+String(err.message||err)+').');}
        finally{add.disabled=false}
      });
      section.append(form);
      const scroller=document.createElement('div');scroller.className='tablewrap';scroller.style.marginTop='14px';
      const table=document.createElement('table');table.className='table';
      const thead=document.createElement('thead'),header=document.createElement('tr');
      for(const label of ['Vorschrift','RIS-Stand / Veränderung','RIS-Datum','Letzte Gesetzesänderung','Original','Verwalten']){
        const th=document.createElement('th');th.textContent=label;header.append(th)}
      thead.append(header);table.append(thead);
      const tbody=document.createElement('tbody');table.append(tbody);scroller.append(table);section.append(scroller);$('collectionsGroups').append(section);
      for(const [name,abbr] of items){
        const id=normalize(name),tr=document.createElement('tr');
        const title=document.createElement('td');title.className='title';title.textContent=name+(abbr?' ('+abbr+')':'');tr.append(title);
        const state=document.createElement('td');state.textContent='Noch nicht geprüft';tr.append(state);
        const date=document.createElement('td');date.textContent='—';tr.append(date);
        const amendment=document.createElement('td');amendment.textContent='Nicht verifiziert';tr.append(amendment);
        const link=document.createElement('td');link.textContent='—';tr.append(link);
        const manage=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.className='btn alt';remove.textContent='Entfernen';
        remove.addEventListener('click',async()=>{if(busy){editStatus('Bitte laufenden RIS-Abgleich abwarten.');return}
          groups[group]=groups[group].filter(x=>normalize(x[0])!==id);
          if(await persist()){if(!Object.values(groups).some(list=>list.some(x=>normalize(x[0])===id))){delete saved[id];delete current[id];try{localStorage.setItem(key,JSON.stringify(saved))}catch{}}renderGroups();editStatus('Vorschrift online entfernt: '+name);}});
        const favorite=document.createElement('button');favorite.type='button';favorite.className='btn alt';favorite.style.marginRight='6px';favorite.textContent='☆ Favorit';favorite.addEventListener('click',async()=>{if(!window.rmUser){editStatus('Bitte anmelden, um persönliche Favoriten zu speichern.');return}try{const r=await fetch('/api/favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,abbreviation:abbr})});if(!r.ok)throw Error((await r.json()).error);favorite.textContent='★ Gespeichert';document.dispatchEvent(new Event('rm-favorites-changed'));}catch(e){editStatus('Favorit nicht gespeichert: '+e.message)}});manage.append(favorite,remove);tr.append(manage);tbody.append(tr);
        if(!cells.has(id))cells.set(id,[]);cells.get(id).push({state,date,amendment,link});
        if(current[id])display({id},current[id]);
      }
    }
  }
  $('collectionsAddGroup').addEventListener('submit',async e=>{e.preventDefault();if(busy){editStatus('Bitte laufenden RIS-Abgleich abwarten.');return}
    const input=$('collectionsGroupName'),name=input.value.trim();if(!name)return;
    if(Object.keys(groups).some(x=>normalize(x)===normalize(name))){editStatus('Sammlung bereits vorhanden.');return}
    groups[name]=[];if(await persist()){renderGroups();input.value='';editStatus('Sammlung online angelegt: '+name);}
  });
  renderGroups();loadOnline();
  const metadata = (doc, paths) => {
    const root=doc?.Data?.Metadaten||{};
    for(const path of paths){let x=root;for(const k of path)x=x?.[k];if(typeof x==='string'&&x.trim())return x.trim();}
    return '';
  };
  function documentList(json){const x=json?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference;return !x?[]:Array.isArray(x)?x:[x];}
  function choose(docs, entry){
    const target=normalize(entry.name),short=normalize(entry.abbr);
    const ranked=docs.map(doc=>{
      const title=metadata(doc,[['Bundesrecht','Titel'],['Bundesrecht','Kurztitel'],['Bundesrecht','BrKons','Titel']]);
      const info=metadata(doc,[['Bundesrecht','BrKons','Kurzinformation']]);
      const t=normalize(title),i=normalize(info);
      const exact=t===target||i===target;
      const acronym=short.length>=3&&(t.includes(short)||i.includes(short));
      return {doc,title,score:exact?100:acronym&&t.includes(target)?80:t.includes(target)?65:acronym?35:0};
    }).filter(x=>x.score>=65).sort((a,b)=>b.score-a.score);
    if(!ranked.length)return null;
    const best=ranked.filter(x=>x.score===ranked[0].score);
    if(best.some(x=>normalize(x.title)!==normalize(best[0].title)))return {ambiguous:true};
    return {documents:best.map(x=>x.doc)};
  }
  async function validateLawInRIS(name,abbr=''){
    const url=new URL(api);url.searchParams.set('Applikation','BrKons');url.searchParams.set('Titel',name);
    url.searchParams.set('DokumenteProSeite','OneHundred');url.searchParams.set('Seitennummer','1');
    const response=await fetch(url.toString(),{headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('RIS HTTP '+response.status);
    const json=await response.json();if(json?.OgdSearchResult?.Error)throw Error('RIS-Suchfehler');
    const match=choose(documentList(json),{name,abbr});
    return !!match&&!match.ambiguous;
  }
  function display(entry,result){for(const c of cells.get(entry.id)||[]){
    c.state.textContent=result.state;c.date.textContent=result.date||'Nicht angegeben';
    c.amendment.replaceChildren();
    if(result.amendmentDate&&result.amendmentUrl){const a=document.createElement('a');a.className='open';a.href=result.amendmentUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent=result.amendmentDate+' · '+result.amendmentRef+' ↗';c.amendment.append(a)}
    else c.amendment.textContent=result.amendmentNote||'Nicht verifiziert';c.link.replaceChildren();
    if(result.url){const a=document.createElement('a');a.className='open';a.href=result.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='RIS öffnen ↗';c.link.append(a);}
    else c.link.textContent='—';
  }}
  async function lookup(entry){
    const url=new URL(api);url.searchParams.set('Applikation','BrKons');url.searchParams.set('Titel',entry.name);
    url.searchParams.set('DokumenteProSeite','OneHundred');url.searchParams.set('Seitennummer','1');
    const response=await fetch(url.toString(),{headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('RIS HTTP '+response.status);
    const json=await response.json();if(json?.OgdSearchResult?.Error)throw Error('RIS-Suchfehler');
    const doc=choose(documentList(json),entry);
    if(!doc)return {state:'Kein eindeutiger RIS-Treffer',date:'',url:'',fingerprint:''};
    if(doc.ambiguous)return {state:'Mehrere mögliche Treffer – manuell prüfen',date:'',url:'',fingerprint:''};
    const docs=doc.documents;
    const dates=docs.map(d=>metadata(d,[['Allgemein','Geaendert'],['Allgemein','Veroeffentlicht']])).filter(Boolean);
    const date=dates.sort().at(-1)||'';
    const title=metadata(docs[0],[['Bundesrecht','Titel'],['Bundesrecht','Kurztitel']]);
    const raw=metadata(docs[0],[['Allgemein','DokumentUrl']]);
    const lawNumber=docs.map(d=>metadata(d,[['Bundesrecht','BrKons','Gesetzesnummer'],['Bundesrecht','Gesetzesnummer'],['Technisch','Gesetzesnummer']])).find(x=>/^\d{8}$/.test(x))||(docs.map(d=>metadata(d,[['Allgemein','DokumentUrl']])).join(' ').match(/Gesetzesnummer=(\d{8})/i)||[])[1]||'';
    let link='';try{let u=new URL(raw,'https://www.ris.bka.gv.at');if(u.protocol==='https:'&&/(^|\.)ris\.bka\.gv\.at$/.test(u.hostname))link=u.href;}catch{}
    const fingerprint=JSON.stringify([title,docs.map(d=>[metadata(d,[['Technisch','ID']]),metadata(d,[['Allgemein','Geaendert'],['Allgemein','Veroeffentlicht']])]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
    const old=saved[entry.id];
    const state=old?.fingerprint&&old.fingerprint!==fingerprint?'RIS-Datensatz geändert seit letztem Abruf':old?.fingerprint?'Keine Änderung im verglichenen RIS-Datensatz':'Erststand gespeichert';
    return {state,date,url:link,fingerprint,lawNumber};
  }
  async function refresh(){
    if(busy||saving)return;if(!onlineReady){status('Online-Daten nicht erreichbar; kein RIS-Abgleich möglich.',true);return}busy=true;$('collectionsRefresh').disabled=true;
    const entries=Object.entries(groups).flatMap(([group,items])=>items.map(([name,abbr])=>({group,name,abbr,id:normalize(name)})));
    const unique=[...new Map(entries.map(x=>[x.id,x])).values()];
    if(!unique.length){busy=false;$('collectionsRefresh').disabled=false;status('Keine Vorschriften vorhanden. Bitte eine Vorschrift hinzufügen.');return}
    let ok=0,failed=0,changed=0,verified=0,newNovels=0;const next={...saved};
    for(let i=0;i<unique.length;i++){
      const entry=unique[i];status('Prüfe '+(i+1)+' / '+unique.length+': '+entry.name+' …');
      try{const result=await lookup(entry);
        if(result.lawNumber){try{const res=await fetch(evidenceApi+'?gesetzesnummer='+encodeURIComponent(result.lawNumber),{headers:{Accept:'application/json'}});if(!res.ok)throw Error('HTTP '+res.status);const ev=await res.json();if(ev.gesetzesnummer!==result.lawNumber)throw Error('Gesetzesnummer nicht bestätigt');if(ev.date&&ev.url&&ev.reference){result.amendmentDate=ev.date;result.amendmentUrl=ev.url;result.amendmentRef=ev.reference;verified++}else result.amendmentNote=ev.note||'Keine belegte Novelle ermittelt'}catch(e){result.amendmentNote='Novellenprüfung fehlgeschlagen ('+String(e.message||e)+')'}}else result.amendmentNote='Gesetzesnummer nicht eindeutig';
        const previous=saved[entry.id];
        if(result.amendmentRef&&previous?.amendmentRef&&result.amendmentRef!==previous.amendmentRef){
          result.state='Neue BGBl-Novelle seit letztem Abgleich: '+result.amendmentRef;newNovels++;
        }
        display(entry,result);current[entry.id]=result;
        if(result.fingerprint){ok++;if(result.state.startsWith('RIS-Datensatz geändert'))changed++;
          next[entry.id]={fingerprint:result.fingerprint,amendmentRef:result.amendmentRef||previous?.amendmentRef||'',checkedAt:new Date().toISOString()};}
        else failed++;
      }catch(e){failed++;display(entry,{state:'Abruf fehlgeschlagen: '+String(e.message||e),date:'',url:''});}
    }
    saved=next;try{localStorage.setItem(key,JSON.stringify(saved));}catch{status('Browser-Speicher nicht verfügbar; Vergleichsstand kann nicht gesichert werden.',true);}
    busy=false;$('collectionsRefresh').disabled=false;
    status(ok+' eindeutige RIS-Treffer · '+verified+' Novellendaten mit BGBl-Kundmachung belegt · '+newNovels+' neue BGBl-Novellen seit dem vorherigen Abgleich · '+changed+' RIS-Datensätze geändert · '+failed+' ohne eindeutigen Treffer. Nicht belegte Daten bleiben offen.',failed>0);
  }
  button.addEventListener('click',()=>{
    for(const child of wrap.children){if(child.id&&child.id!=='collectionsPanel'&&/Panel$/.test(child.id))child.hidden=true;}
    panel.hidden=false;for(const item of nav.querySelectorAll('.menuItem'))item.classList.toggle('active',item===button);
    const top=document.querySelector('.top b');if(top)top.textContent='Gesetzessammlungen';
  });
  nav.addEventListener('click',e=>{if(e.target.closest('.menuItem')!==button)panel.hidden=true;},true);
  $('collectionsRefresh').addEventListener('click',refresh);
})();
