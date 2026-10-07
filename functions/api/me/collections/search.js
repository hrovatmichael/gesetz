import {
  requireUser,
  sameOrigin
} from '../../../_lib/auth.js';

const RIS_API =
  'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

function clean(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function at(object, path) {
  let value = object;

  for (const key of path) {
    value = value?.[key];
  }

  return typeof value === 'string'
    ? value.trim()
    : '';
}

function first(object, paths) {
  for (const path of paths) {
    const value = at(object, path);

    if (value) {
      return value;
    }
  }

  return '';
}

function docs(json) {
  const value =
    json?.OgdSearchResult
      ?.OgdDocumentResults
      ?.OgdDocumentReference;

  if (!value) {
    return [];
  }

  return Array.isArray(value)
    ? value
    : [value];
}

function number(document) {
  const metadata =
    document?.Data?.Metadaten || {};

  const direct = first(metadata, [
    ['Bundesrecht', 'BrKons', 'Gesetzesnummer'],
    ['Bundesrecht', 'Gesetzesnummer'],
    ['Technisch', 'Gesetzesnummer']
  ]);

  if (/^\d{8}$/.test(direct)) {
    return direct;
  }

  const documentUrl = first(metadata, [
    ['Allgemein', 'DokumentUrl']
  ]);

  return documentUrl.match(
    /[?&]Gesetzesnummer=(\d{8})(?:&|$)/i
  )?.[1] || '';
}

function normalizeDate(value) {
  const text = clean(value);
  let match;

  if (
    (match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(text))
  ) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  if (
    (match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text))
  ) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return '';
}

function todayInAustria() {
  const parts = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone: 'Europe/Vienna',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
  ).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function candidate(document) {
  const metadata =
    document?.Data?.Metadaten || {};

  const risNumber = number(document);

  if (!risNumber) {
    return null;
  }

  const title = clean(first(metadata, [
    ['Bundesrecht', 'Titel'],
    ['Bundesrecht', 'Kurztitel'],
    ['Bundesrecht', 'BrKons', 'Titel']
  ]));

  const shortTitle = clean(first(metadata, [
    ['Bundesrecht', 'Kurztitel'],
    ['Bundesrecht', 'BrKons', 'Kurztitel']
  ]));

  const effectiveFrom = normalizeDate(
    first(metadata, [
      ['Bundesrecht', 'BrKons', 'Inkrafttretensdatum'],
      ['Bundesrecht', 'Inkrafttretensdatum']
    ])
  );

  const effectiveTo = normalizeDate(
    first(metadata, [
      ['Bundesrecht', 'BrKons', 'Ausserkrafttretensdatum'],
      ['Bundesrecht', 'Ausserkrafttretensdatum']
    ])
  );

  const changedAt = normalizeDate(
    first(metadata, [
      ['Allgemein', 'Geaendert']
    ])
  );

  const today = todayInAustria();

    const isFuture =
    Boolean(effectiveFrom) &&
    effectiveFrom > today;

  const isExpired =
    Boolean(effectiveTo) &&
    effectiveTo < today;

  const url = new URL(
    'https://www.ris.bka.gv.at/GeltendeFassung.wxe'
  );

  url.searchParams.set('Abfrage', 'Bundesnormen');
  url.searchParams.set('Gesetzesnummer', risNumber);

  return {
    risNumber,
    title:
      title ||
      shortTitle ||
      `RIS-Vorschrift ${risNumber}`,
    shortTitle,
    risUrl: url.href,
    effectiveFrom,
    effectiveTo,
    changedAt,
    isActive: null,
    isExpired,
    isFuture,
    validityStatus: 'unknown'
  };
}

async function search(term) {
  const map = new Map();
  const MAX_PAGES = 20;
  const seenPages = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(RIS_API);

    url.searchParams.set('Applikation', 'BrKons');
    url.searchParams.set('Titel', term);
    url.searchParams.set('DokumenteProSeite', 'OneHundred');
    url.searchParams.set('Seitennummer', String(page));

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(
        `RIS HTTP ${response.status} auf Seite ${page}`
      );
    }

    const json = await response.json();

    if (json?.OgdSearchResult?.Error) {
      throw new Error(
        `RIS-Suche fehlgeschlagen auf Seite ${page}`
      );
    }

    const documents = docs(json);

    if (documents.length === 0) {
      return [...map.values()];
    }

    const signature = JSON.stringify(documents);

    if (seenPages.has(signature)) {
      throw new Error(
        'RIS liefert wiederholt dieselbe Ergebnisseite.'
      );
    }

    seenPages.add(signature);

    for (const document of documents) {
      const result = candidate(document);

      if (result && !map.has(result.risNumber)) {
        map.set(result.risNumber, result);
      }
    }

    if (documents.length < 100) {
      return [...map.values()];
    }
  }

  throw new Error(
    'Die RIS-Suche überschreitet 20 Ergebnisseiten. ' +
    'Bitte den Suchbegriff genauer eingeben.'
  );
}
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) {
    return respond({ error: 'Ungültiger Ursprung.' }, 403);
  }

  const auth = await requireUser(request, env);

  if (auth.error) {
    return auth.error;
  }

  const contentType =
    request.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    return respond({ error: 'JSON erforderlich.' }, 415);
  }

  let input;

  try {
    const raw = await request.text();

    if (raw.length > 3000) {
      return respond({ error: 'Eingabe zu groß.' }, 413);
    }

    input = JSON.parse(raw);
  } catch {
    return respond({ error: 'Ungültiges JSON.' }, 400);
  }

  const name = clean(input?.name);
  const abbreviation = clean(input?.abbreviation);

  if (
    !name ||
    name.length > 160 ||
    abbreviation.length > 40
  ) {
    return respond({
      error: 'Bitte einen gültigen Vorschriftentitel eingeben.'
    }, 400);
  }

  try {
    const map = new Map();

    const terms = [
      ...new Set([abbreviation, name].filter(Boolean))
    ];

    for (const term of terms) {
      const results = await search(term);

      for (const result of results) {
        if (!map.has(result.risNumber)) {
          map.set(result.risNumber, result);
        }
      }
    }

    const candidates = [...map.values()]
      .sort((a, b) => {
        const dateA = a.changedAt || a.effectiveFrom || '';
        const dateB = b.changedAt || b.effectiveFrom || '';

        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }

        return a.title.localeCompare(b.title, 'de-AT');
      })
      .slice(0, 30);

    return respond({
      candidates,
      count: candidates.length
    });
  } catch (error) {
    console.error('RIS-Vorschriften suchen:', error);

    return respond({
      error:
        'RIS-Suche fehlgeschlagen: ' +
        String(error?.message || error)
    }, 503);
  }
}
