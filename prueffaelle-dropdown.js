'use strict';
// Nach dem bestehenden Inline-Script laden. Aendert nur die Darstellung der Gesetzesaenderungen.
(() => {
  const panel = document.getElementById('changesPanel');
  const mainTable = document.getElementById('changesRows');
  if (!panel || !mainTable || typeof changes === 'undefined' ||
      typeof changesRender !== 'function' || typeof changesVisible !== 'function') {
    console.error('Prueffaelle-Dropdown: bestehende Gesetzesaenderungsansicht fehlt.');
    return;
  }
  const mainSection = mainTable.closest('section.panel');
  const details = document.createElement('details');
  details.id = 'changesReviewDetails';
  details.className = 'panel';
  details.style.marginTop = '18px';
  const summary = document.createElement('summary');
  summary.style.cursor = 'pointer';
  summary.style.fontWeight = '700';
  summary.style.fontSize = '16px';
  summary.style.listStylePosition = 'inside';
  const count = document.createElement('span');
  count.id = 'changesReviewCount';
  count.className = 'muted';
  summary.append(document.createTextNode('Prüfung erforderlich '), count);
  const note = document.createElement('p');
  note.className = 'smallnote';
  note.textContent = 'Diese Dokumente sind nicht als bestätigte Änderungen eingestuft. Bitte das RIS-Original prüfen.';
  const wrap = document.createElement('div');
  wrap.className = 'tablewrap';
  const table = mainTable.closest('table').cloneNode(true);
  table.querySelector('tbody').id = 'changesReviewRows';
  wrap.append(table);
  details.append(summary, note, wrap);
  mainSection.after(details);
  const heading = mainSection.querySelector('h2');
  if (heading && heading.firstChild) heading.firstChild.textContent = 'Erkannte Änderungen und gemischte Fälle ';
  const subtitle = panel.querySelector('p.sub');
  if (subtitle) subtitle.textContent = 'Erkannte Änderungen und gemischte Fälle stehen in der Hauptliste. Nicht eindeutig einzuordnende Dokumente bleiben im aufklappbaren Prüffälle-Bereich erhalten.';
  const foot = panel.querySelector('p.foot');
  if (foot) foot.textContent = foot.textContent.replace('„Prüfung erforderlich“ bleibt sichtbar.', '„Prüfung erforderlich“ ist im aufklappbaren Bereich verfügbar.');

  function matchesFilter(row) {
    const q = document.getElementById('changesFilter').value.trim().toLocaleLowerCase('de-AT');
    return !q || [row.title, row.kind, row.reason].some(v =>
      String(v || '').toLocaleLowerCase('de-AT').includes(q));
  }
  function sortRows(rows) {
    return rows.sort((a, b) => dateNumber(b.date) - dateNumber(a.date));
  }
  function appendRow(body, row) {
    const tr = document.createElement('tr');
    const type = cell(tr, row.kind);
    type.style.fontWeight = '700';
    type.style.color = row.kind === 'Beides' ? '#eab967' :
      row.kind === 'Prüfung erforderlich' ? '#b4c9d3' : '#9bd8b6';
    cell(tr, row.title, 'title');
    cell(tr, row.reason + (row.evidence ? ' · Textstelle: ' + row.evidence : ''));
    cell(tr, row.date);
    const td = document.createElement('td');
    const href = safeUrl(row.url);
    if (href) {
      const a = document.createElement('a');
      a.className = 'open';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Im RIS prüfen ↗';
      td.append(a);
    } else td.textContent = 'Kein Link';
    tr.append(td);
    body.append(tr);
  }
  function fill(body, rows, empty) {
    body.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr');
      cell(tr, empty).colSpan = 5;
      body.append(tr);
    } else rows.forEach(row => appendRow(body, row));
  }
  changesVisible = function () {
    return sortRows([...changes.rows.values()].filter(row =>
      row.kind !== 'Neues Gesetz' && row.kind !== 'Prüfung erforderlich' && matchesFilter(row)));
  };
  changesRender = function () {
    const primary = changesVisible();
    const review = sortRows([...changes.rows.values()].filter(row =>
      row.kind === 'Prüfung erforderlich' && matchesFilter(row)));
    document.getElementById('changesCount').textContent = '· ' + primary.length + ' angezeigt';
    count.textContent = '· ' + review.length + ' Fälle';
    fill(mainTable, primary, changes.rows.size ? 'Keine passenden Änderungen.' : 'Noch keine Dokumente geladen.');
    fill(table.querySelector('tbody'), review, changes.rows.size ? 'Keine passenden Prüffälle.' : 'Noch keine Dokumente geladen.');
    document.getElementById('changesCoverage').textContent =
      (changes.page - 1) + ' RIS-Seite(n) geladen · ' + changes.rows.size +
      ' Dokumente erfasst · ' + [...changes.rows.values()].filter(row => row.textChecked).length +
      ' HTML-Volltexte gelesen · ' + changes.errors.length +
      ' nicht gelesene Volltexte. Nur geladene Seiten sind berücksichtigt.';
    document.getElementById('changesMore').hidden = changes.busy || changes.done || changes.page === 1;
  };
  changesRender();
})();
