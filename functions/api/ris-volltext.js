export async function onRequestGet({ request }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^BGBLA_\d{4}_(?:I|II|III)_\d{1,5}$/i.test(id)) {
    return new Response('Ungültige Dokument-ID', { status: 400 });
  }
  const name = id.toUpperCase();
  const url = `https://ogd.ris.bka.gv.at/Dokumente/BgblAuth/${name}/${name}.html`;
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html' }, redirect: 'follow' });
    if (!response.ok) return new Response('RIS-Volltext nicht abrufbar', { status: response.status });
    const text = await response.text();
    if (text.length > 2000000) return new Response('Dokument zu groß', { status: 413 });
    return new Response(text, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  } catch (_) {
    return new Response('RIS-Volltext momentan nicht erreichbar', { status: 502 });
  }
}
