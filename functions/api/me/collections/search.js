import { requireUser, sameOrigin } from '../../../_lib/auth.js';
const RIS_API='https://data.bka.gv.at/ris/api/v2.6/Bundesrecht';
const H={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const respond=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:H});
const clean=v=>String(v||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function at(o,p){let v=o;for(const k of p)v=v?.[k];return typeof v==='string'?v.trim():''}
function first(o,paths){for(const p of paths){const v=at(o,p);if(v)return v}return ''}
function docs(j){const v=j?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference;return !v?[]:Array.isArray(v)?v:[v]}
function number(d){const m=d?.Data?.Metadaten||{};const n=first(m,[['Bundesrecht','BrKons','Gesetzesnummer'],['Bundesrecht','Gesetzesnummer'],['Technisch','Gesetzesnummer']]);if(/^\d{8}$/.test(n))return n;return first(m,[['Allgemein','DokumentUrl']]).match(/[?&]Gesetzesnummer=(\d{8})(?:&|$)/i)?.[1]||''}
function candidate(d) {
  const m = d?.Data?.Metadaten || {};
  const risNumber = number(d);

  if (!risNumber) return null;

  const title = clean(first(m, [
    ['Bundesrecht', 'Titel'],
    ['Bundesrecht', 'Kurztitel'],
    ['Bundesrecht', 'BrKons', 'Titel']
  ]));

  const shortTitle = clean(first(m, [
    ['Bundesrecht', 'Kurztitel'],
    ['Bundesrecht', 'BrKons', 'Kurztitel']
  ]));

  const effectiveFrom = clean(first(m, [
    ['Bundesrecht', 'BrKons', 'Inkrafttretensdatum'],
    ['Bundesrecht', 'Inkrafttretensdatum']
  ]));

  const effectiveTo = clean(first(m, [
    ['Bundesrecht', 'BrKons', 'Ausserkrafttretensdatum'],
    ['Bundesrecht', 'Ausserkrafttretensdatum']
  ]));

  const changedAt = clean(first(m, [
    ['Allgemein', 'Geaendert']
  ]));

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const isFuture =
    Boolean(effectiveFrom) &&
    effectiveFrom > today;

  const isExpired =
    Boolean(effectiveTo) &&
    effectiveTo < today;

  const isActive =
    !isFuture &&
    !isExpired;

  const u = new URL(
    'https://www.ris.bka.gv.at/GeltendeFassung.wxe'
  );

  u.searchParams.set(
    'Abfrage',
    'Bundesnormen'
  );

  u.searchParams.set(
    'Gesetzesnummer',
    risNumber
  );

  return {
    risNumber,
    title:
      title ||
      shortTitle ||
      `RIS-Vorschrift ${risNumber}`,
    shortTitle,
    risUrl: u.href,
    effectiveFrom,
    effectiveTo,
    changedAt,
    isActive,
    isExpired,
    isFuture
  };
}
async function search(term){const u=new URL(RIS_API);u.searchParams.set('Applikation','BrKons');u.searchParams.set('Titel',term);u.searchParams.set('DokumenteProSeite','OneHundred');u.searchParams.set('Seitennummer','1');const r=await fetch(u.toString(),{headers:{Accept:'application/json'}});if(!r.ok)throw Error('RIS HTTP '+r.status);const j=await r.json();
                           console.log(
  JSON.stringify(
    j,
    null,
    2
  )
); if(j?.OgdSearchResult?.Error)throw Error('RIS-Suche fehlgeschlagen');const map=new Map();for(const d of docs(j)){const c=candidate(d);if(c&&!map.has(c.risNumber))map.set(c.risNumber,c)}return [...map.values()]}
export async function onRequestPost({request,env}){if(!sameOrigin(request))return respond({error:'Ungültiger Ursprung.'},403);const auth=await requireUser(request,env);if(auth.error)return auth.error;if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return respond({error:'JSON erforderlich.'},415);let input;try{const raw=await request.text();if(raw.length>3000)return respond({error:'Eingabe zu groß.'},413);input=JSON.parse(raw)}catch{return respond({error:'Ungültiges JSON.'},400)}const name=clean(input?.name),abbreviation=clean(input?.abbreviation);if(!name||name.length>160||abbreviation.length>40)return respond({error:'Bitte einen gültigen Vorschriftentitel eingeben.'},400);try{const map=new Map();for(const term of [...new Set([abbreviation,name].filter(Boolean))])for(const c of await search(term))if(!map.has(c.risNumber))map.set(c.risNumber,c);const candidates = [...map.values()]
  .sort((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }

    const dateA =
      a.changedAt ||
      a.effectiveFrom ||
      '';

    const dateB =
      b.changedAt ||
      b.effectiveFrom ||
      '';

    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }

    return a.title.localeCompare(
      b.title,
      'de-AT'
    );
  })
  .slice(0, 30);return respond({candidates,count:candidates.length})}catch(e){console.error('RIS-Vorschriften suchen:',e);return respond({error:'RIS-Suche derzeit nicht möglich.'},503)}}
