'use strict';

(() => {

  const API = '/api/me/collections';

  const clean = value =>
    String(value || '')
      .replace(/<\/?br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  async function post(path, body) {

    const response = await fetch(
      API + path,
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    const type =
      response.headers.get('content-type') || '';

    if (!type.includes('application/json')) {
      throw Error(
        'Sammlungs-API nicht bereitgestellt.'
      );
    }

    const data =
      await response.json();

    if (!response.ok) {
      throw Error(
        data.error ||
        ('HTTP ' + response.status)
      );
    }

    return data;
  }

  async function getCollections() {

    const response = await fetch(
      API,
      {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json'
        }
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw Error(
        data.error ||
        ('HTTP ' + response.status)
      );
    }

    return data.collections || [];
  }

  function install() {

    const panel =
      document.getElementById(
        'personalCollectionsPanel'
      );

    if (
      !panel ||
      document.getElementById(
        'lawAddPanel'
      )
    ){
      return;
    }

    const style =
      document.createElement('style');

    style.textContent = `
      .lawAddGrid{
        display:grid;
        grid-template-columns:
          minmax(240px,1fr)
          180px
          230px
          auto;

        gap:12px;
        align-items:end;
        margin-top:16px;
      }

      .lawAddResults{
        display:grid;
        gap:9px;
        margin-top:14px;
      }

      .lawAddCandidate{
  display:grid;
  grid-template-columns:
    minmax(0,1fr)
    250px;

  gap:20px;
  align-items:start;

  padding:16px;

  border:1px solid #405564;
  border-radius:11px;

  background:#172733;
}

      .lawAddCandidate strong{
  display:block;
  font-size:13px;
  line-height:1.5;
  white-space:normal;
  word-break:break-word;
  max-width:100%;
}

      .lawAddMeta{
        margin-top:4px;
        color:#a9bec9;
        font-size:11px;
      }

      @media(max-width:900px){

        .lawAddGrid{
          grid-template-columns:
            1fr
            1fr;
        }

        .lawAddCandidate{
          grid-template-columns:1fr;
        }
      }
    `;

    document.head.append(style);

    const section =
      document.createElement('section');

    section.id = 'lawAddPanel';
    section.className = 'panel';

    section.innerHTML = `
      <h2>Vorschrift hinzufügen</h2>

      <div class="muted">
        RIS durchsuchen und den richtigen Treffer direkt einer Sammlung zuordnen.
      </div>

      <form
        id="lawAddForm"
        class="lawAddGrid">

        <label class="field">
          Name der Vorschrift

          <input
            id="lawAddName"
            maxlength="160"
            required
            placeholder="z. B. Kraftfahrgesetz 1967">
        </label>

        <label class="field">
          Abkürzung (optional)

          <input
            id="lawAddAbbr"
            maxlength="40"
            placeholder="z. B. KFG">
        </label>

        <label class="field">
          Ziel-Sammlung

          <select
  id="lawAddCollection">
</select>
        </label>

        <button
          class="btn"
          id="lawAddSearch"
          type="submit">

          Im RIS suchen

        </button>

      </form>

      <div
        id="lawAddStatus"
        class="status">

        Vorschrift eingeben und im RIS suchen.

      </div>

      <div
        id="lawAddResults"
        class="lawAddResults">
      </div>
    `;

    panel.insertBefore(
      section,
      document.getElementById(
        'personalCollectionGroups'
      )
    );

    const select =
      document.getElementById(
        'lawAddCollection'
      );

    const status =
      document.getElementById(
        'lawAddStatus'
      );

    const results =
      document.getElementById(
        'lawAddResults'
      );

    const button =
      document.getElementById(
        'lawAddSearch'
      );

    async function refresh() {

  const rows =
    await getCollections();

  select.replaceChildren();

  const none =
    document.createElement('option');

  none.value = '';
  none.textContent =
    'Nicht zuweisen';

  select.append(none);

  for (const collection of rows) {

    const option =
      document.createElement('option');

    option.value =
      collection.id;

    option.textContent =
      collection.name;

    select.append(option);
  }

  select.value = '';

  button.disabled = false;
}

    document.addEventListener(
      'rm-collections-changed',
      () => {
        refresh().catch(
          console.error
        );
      }
    );

    function show(list) {

      results.replaceChildren();

      if (!list.length) {

        results.textContent =
          'Keine passende Vorschrift gefunden.';

        return;
      }

      for (const candidate of list) {

        const row =
          document.createElement('div');

        row.className =
          'lawAddCandidate';

        const info =
          document.createElement('div');

        const title =
          document.createElement('strong');

        const meta =
          document.createElement('div');

        const take =
          document.createElement('button');

        title.textContent =
          clean(candidate.title);

        meta.className =
          'lawAddMeta';

        meta.innerHTML = `
<div style="
display:flex;
justify-content:space-between;
align-items:flex-start;
gap:24px;
margin-top:8px;
">

  <div>

    <a
      href="${candidate.risUrl}"
      target="_blank"
      rel="noopener noreferrer"
      style{candidate.risNumber}
    </div>

  </div>

  <div style="
    text-align:right;
    color:#a9bec9;
    font-size:11px;
    white-space:nowrap;
  ">
    <div>
      Gültig ab:
      ${candidate.effectiveFrom || '-'}
    </div>

    <div>
      Letzte Änderung:
      ${candidate.changedAt || '-'}
    </div>
  </div>

</div>
`;
`

        info.append(
          title,
          meta
        );

        take.type = 'button';
        take.className = 'btn alt';

        take.textContent =
          'Diesen Treffer übernehmen';

        take.onclick = async () => {

          take.disabled = true;

          status.textContent =
            'Treffer wird geprüft und gespeichert …';

          try {

           await post(
  '/add',
  {
    collectionId:
      select.value || null,

    risNumber:
      candidate.risNumber
  }
);
            document.dispatchEvent(
              new CustomEvent(
                'rm-collections-changed'
              )
            );

            status.textContent =
              'Vorschrift wurde hinzugefügt.';

            results.replaceChildren();

            document
              .getElementById(
                'menuPersonalCollections'
              )
              ?.click();

          } catch (error) {

            take.disabled = false;

            status.className =
              'status error';

            status.textContent =
              String(
                error.message ||
                error
              );
          }
        };

        row.append(
          info,
          take
        );

        results.append(row);
      }
    }

    document
      .getElementById(
        'lawAddForm'
      )
      .onsubmit =
      async event => {

        event.preventDefault();

        button.disabled = true;

        status.className =
          'status';

        status.textContent =
          'RIS wird durchsucht …';

        results.replaceChildren();

        try {

          const data =
            await post(
              '/search',
              {
                name:
                  document
                    .getElementById(
                      'lawAddName'
                    )
                    .value
                    .trim(),

                abbreviation:
                  document
                    .getElementById(
                      'lawAddAbbr'
                    )
                    .value
                    .trim()
              }
            );

          show(
            data.candidates || []
          );

          status.textContent =
            (data.count || 0) +
            ' RIS-Treffer gefunden. Bitte auswählen.';

        } catch (error) {

          status.className =
            'status error';

          status.textContent =
            String(
              error.message ||
              error
            );

       } finally {

  button.disabled = false;

}
      };

    refresh().catch(error => {

      status.className =
        'status error';

      status.textContent =
        String(
          error.message ||
          error
        );
    });
  }

  if (
    document.readyState === 'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      install,
      { once:true }
    );

  } else {

    install();
  }

})();
