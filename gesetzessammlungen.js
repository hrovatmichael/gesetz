'use strict';
/* Add-on: Gesetzessammlungen. Bestehende Menuepunkte und Funktionen bleiben unveraendert. */
(() => {
  const groups = {
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
  const key = 'rechtsmonitor-sammlungen-v1';
  const nav = document.querySelector('.side .nav');
  const wrap = document.querySelector('main.wrap');
  if (!nav || !wrap) { console.error('Gesetzessammlungen: Layout nicht gefunden.'); return; }
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'menuItem';
  button.id = 'menuCollections'; button.textContent = '▤   Gesetzessammlungen';
  nav.append(button);
  const panel = document.createElement('div'); panel.id = 'collectionsPanel'; panel.hidden = true;
  panel.innerHTML = `<div class="eyebrow">RIS · FESTE BEOBACHTUNGSLISTE</div>
    <h1>Gesetzessammlungen</h1>
    <p class="sub">Arbeitnehmerschutz, Lagerung und Transport. Einträge werden im RIS gesucht; Abweichungen seit dem letzten erfolgreichen Abruf werden markiert.</p>
    <section class="panel" style="margin-top:24px">
      <div class="panelhead"><div><h2>RIS-Abgleich</h2><div class="muted">Erster Abruf legt den Vergleichsstand nur in diesem Browser an.</div></div>
      <button type="button" class="btn" id="collectionsRefresh">Alle Sammlungen prüfen</button></div>
      <div id="collectionsStatus" class="status" role="status" aria-live="polite">Noch kein Abgleich durchgeführt.</div>
      <p class="smallnote">„RIS-Datensatz geändert“ ist kein Nachweis einer materiellen Gesetzesänderung. Ein Datum der letzten Gesetzesnovelle wird nur angezeigt, wenn es eindeutig belegt ist; sonst „nicht verifiziert“. Prüfe das RIS-Original.</p>
    </section><div id="collectionsGroups"></div>`;
  wrap.append(panel);
  const $ = id => document.getElementById(id);
  const normalize = x => String(x || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-AT').replace(/[^a-z0-9]/g,'');
  const entries = Object.entries(groups).flatMap(([group, items]) => items.map(([name,abbr]) => ({group,name,abbr,id:normalize(name)})));
  const unique = [...new Map(entries.map(x => [x.id,x])).values()];
  let saved = {}, current = {}, busy = false;
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
  const cells = new Map();
  const status = (text,warning=false) => { $('collectionsStatus').className = 'status'+(warning?' warn':''); $('collectionsStatus').textContent=text; };
  for (const [group, items] of Object.entries(groups)) {
    const section=document.createElement('section'); section.className='panel';
    const heading=document.createElement('h2');heading.textContent=group;section.append(heading);
    const scroller=document.createElement('div');scroller.className='tablewrap';scroller.style.marginTop='14px';
    const table=document.createElement('table');table.className='table';
    const thead=document.createElement('thead');const header=document.createElement('tr');
    for(const label of ['Vorschrift','RIS-Stand / Veränderung','RIS-Datum','Letzte Gesetzesänderung','Original']){
      const th=document.createElement('th');th.textContent=label;header.append(th);
    }
    thead.append(header);table.append(thead);
    const tbody=document.createElement('tbody');table.append(tbody);scroller.append(table);section.append(scroller);$('collectionsGroups').append(section);
    for(const [name,abbr] of items){
      const id=normalize(name),tr=document.createElement('tr');
      const title=document.createElement('td');title.className='title';title.textContent=name+(abbr?' ('+abbr+')':'');tr.append(title);
      const state=document.createElement('td');state.textContent='Noch nicht geprüft';tr.append(state);
      const date=document.createElement('td');date.textContent='—';tr.append(date);
      const amendment=document.createElement('td');amendment.textContent='Nicht verifiziert';tr.append(amendment);
      const link=document.createElement('td');link.textContent='—';tr.append(link);tbody.append(tr);
      if(!cells.has(id))cells.set(id,[]);cells.get(id).push({state,date,amendment,link});
    }
  }
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
  function display(entry,result){for(const c of cells.get(entry.id)||[]){
    c.state.textContent=result.state;c.date.textContent=result.date||'Nicht angegeben';
    c.amendment.textContent='Nicht verifiziert';c.link.replaceChildren();
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
    let link='';try{let u=new URL(raw,'https://www.ris.bka.gv.at');if(u.protocol==='https:'&&/(^|\.)ris\.bka\.gv\.at$/.test(u.hostname))link=u.href;}catch{}
    const fingerprint=JSON.stringify([title,docs.map(d=>[metadata(d,[['Technisch','ID']]),metadata(d,[['Allgemein','Geaendert'],['Allgemein','Veroeffentlicht']])]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
    const old=saved[entry.id];
    const state=old?.fingerprint&&old.fingerprint!==fingerprint?'RIS-Datensatz geändert seit letztem Abruf':old?.fingerprint?'Keine Änderung im verglichenen RIS-Datensatz':'Erststand gespeichert';
    return {state,date,url:link,fingerprint};
  }
  async function refresh(){
    if(busy)return;busy=true;$('collectionsRefresh').disabled=true;
    let ok=0,failed=0,changed=0;const next={...saved};
    for(let i=0;i<unique.length;i++){
      const entry=unique[i];status('Prüfe '+(i+1)+' / '+unique.length+': '+entry.name+' …');
      try{const result=await lookup(entry);display(entry,result);current[entry.id]=result;
        if(result.fingerprint){ok++;if(result.state.startsWith('RIS-Datensatz geändert'))changed++;
          next[entry.id]={fingerprint:result.fingerprint,checkedAt:new Date().toISOString()};}
        else failed++;
      }catch(e){failed++;display(entry,{state:'Abruf fehlgeschlagen: '+String(e.message||e),date:'',url:''});}
    }
    saved=next;try{localStorage.setItem(key,JSON.stringify(saved));}catch{status('Browser-Speicher nicht verfügbar; Vergleichsstand kann nicht gesichert werden.',true);}
    busy=false;$('collectionsRefresh').disabled=false;
    status(ok+' eindeutige RIS-Treffer · '+changed+' RIS-Datensätze seit dem vorherigen Abruf geändert · '+failed+' ohne eindeutiges Ergebnis. Kein automatisch verifiziertes Datum der letzten Gesetzesnovelle.',failed>0);
  }
  button.addEventListener('click',()=>{
    for(const child of wrap.children){if(child.id&&child.id!=='collectionsPanel'&&/Panel$/.test(child.id))child.hidden=true;}
    panel.hidden=false;for(const item of nav.querySelectorAll('.menuItem'))item.classList.toggle('active',item===button);
    const top=document.querySelector('.top b');if(top)top.textContent='Gesetzessammlungen';
  });
  nav.addEventListener('click',e=>{if(e.target.closest('.menuItem')!==button)panel.hidden=true;},true);
  $('collectionsRefresh').addEventListener('click',refresh);
})();
