// Pages Function: read only official RIS pages. Never accept arbitrary upstream URLs.
const json = (data,status=200) => new Response(JSON.stringify(data),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}
});
async function get(url){
  const r=await fetch(url,{headers:{Accept:'text/html'},redirect:'follow'});
  if(!r.ok)throw Error('RIS HTTP '+r.status);
  const html=await r.text();if(html.length>3000000)throw Error('RIS-Dokument zu gross');
  return html;
}
function strip(s){return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim()}
function amendmentRefs(html){
  // Read only the RIS section explicitly headed "Änderung". References elsewhere in the law are excluded.
  const heading=/<h([1-6])\b[^>]*>\s*(?:<[^>]+>\s*)*Änderung\s*(?:<\/[^>]+>\s*)*<\/h\1>/i.exec(html);
  if(!heading)return [];
  const start=heading.index+heading[0].length;
  const tail=html.slice(start,start+250000);
  const end=/<h[1-6]\b[^>]*>/i.exec(tail);
  const section=tail.slice(0,end?end.index:Math.min(tail.length,20000));
  const refs=[];
  const re=/href\s*=\s*["']([^"']*\/eli\/bgbl\/(I|II)\/(\d{4})\/(\d{1,5})(?:\/[^"']*)?)["']/gi;
  for(const match of section.matchAll(re)){
    const part=match[2].toUpperCase(),year=Number(match[3]),number=Number(match[4]);
    if(year>=2004&&year<=2100&&number>0)refs.push({part,year,number});
  }
  return [...new Map(refs.map(x=>[`${x.part}/${x.year}/${x.number}`,x])).values()]
    .sort((a,b)=>b.year-a.year||b.number-a.number);
}
function published(html){
  const text=strip(html);
  const m=/Datum der Kundmachung\s*(\d{2}\.\d{2}\.\d{4})/i.exec(text);
  if(!m)return '';
  const [day,month,year]=m[1].split('.').map(Number);
  const d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?m[1]:'';
}
export async function onRequestGet({request}){
  const id=new URL(request.url).searchParams.get('gesetzesnummer')||'';
  if(!/^\d{8}$/.test(id))return json({error:'Ungueltige Gesetzesnummer'},400);
  try{
    const law=await get('https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer='+id);
    const refs=amendmentRefs(law);
    if(!refs.length)return json({gesetzesnummer:id,note:'Keine eindeutig auslesbare BGBl-Novelle ab 2004 in der RIS-Änderungsliste'});
    // Prefer the latest verifiable publication date, not the highest BGBl number.
    const found=[];
    for(const ref of refs.slice(0,12)){
      const url=`https://www.ris.bka.gv.at/eli/bgbl/${ref.part}/${ref.year}/${ref.number}`;
      try{const html=await get(url);const date=published(html);
        if(date)found.push({date,reference:`BGBl. ${ref.part} Nr. ${ref.number}/${ref.year}`,url,
          iso:date.slice(6)+'-'+date.slice(3,5)+'-'+date.slice(0,2)});
      }catch{} // A failed document is not treated as verified.
    }
    if(!found.length)return json({gesetzesnummer:id,note:'Änderungs-BGBl gefunden, Kundmachungsdatum nicht verifizierbar'});
    // If any candidate could be newer but could not be checked, do not claim a latest date.
    const best=found.sort((a,b)=>b.iso.localeCompare(a.iso))[0];
    const verified=new Set(found.map(x=>x.url));
    if(refs.some(x=>x.year>=Number(best.iso.slice(0,4))&&!verified.has(`https://www.ris.bka.gv.at/eli/bgbl/${x.part}/${x.year}/${x.number}`)))
      return json({gesetzesnummer:id,note:'Eine möglicherweise neuere BGBl-Novelle konnte nicht datiert werden'});
    return json({gesetzesnummer:id,date:best.date,reference:best.reference,url:best.url,
      note:'Kundmachungsdatum des jüngsten belegten BGBl in der RIS-Änderungsliste; nicht Inkrafttreten'});
  }catch(e){return json({gesetzesnummer:id,error:'RIS-Abfrage fehlgeschlagen',detail:String(e.message||e)},502)}
}
