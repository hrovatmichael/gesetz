(()=>{
'use strict';

const nav=document.querySelector('.side .nav');
const wrap=document.querySelector('main.wrap');

if(!nav || !wrap) return;

const menu=document.createElement('button');
menu.className='menuItem';
menu.textContent='★  Mein Konto';

nav.append(menu);

const panel=document.createElement('div');
panel.id='accountPanel';
panel.hidden=true;

panel.innerHTML=`
<div class="eyebrow">PERSÖNLICHER BEREICH</div>

<h1>Mein Konto</h1>

<section class="panel">

  <h2>Anmeldung</h2>

  <div id="accountState" class="status">
    Lade …
  </div>

  <form id="loginForm" class="controls">

    <label class="field">
      Benutzername
      <input
        id="loginName"
        required
        autocomplete="username">
    </label>

    <label class="field">
      Passwort
      <input
        id="loginPassword"
        type="password"
        required
        autocomplete="current-password">
    </label>

    <button class="btn">
      Anmelden
    </button>

  </form>

  <button
    class="btn alt"
    id="logoutButton"
    hidden>

    Abmelden

  </button>

</section>

<section
  class="panel"
  id="adminBox"
  hidden>

  <h2>Nutzerverwaltung</h2>

  <form
    id="newUserForm"
    class="controls">

    <label class="field">
      Benutzername
      <input
        id="newUserName"
        required
        minlength="3"
        maxlength="40">
    </label>

    <label class="field">
      Passwort (mindestens 12 Zeichen)
      <input
        id="newUserPassword"
        type="password"
        required
        minlength="12"
        autocomplete="new-password">
    </label>

    <label class="field">
      Rolle
      <select id="newUserRole">
        <option value="user">Nutzer</option>
        <option value="admin">Admin</option>
      </select>
    </label>

    <button class="btn">
      Nutzer anlegen
    </button>

  </form>
<section
  class="panel"
  id="reportSettingsBox"
  hidden>

  <h2>Tagesberichte</h2>

  <div class="controls">

    <label class="field search">
      Empfänger (eine E-Mail pro Zeile)

      <textarea
        id="reportRecipients"
        style="height:120px"
      ></textarea>
    </label>

    <label class="field">
      Versandzeit

      <select id="reportHour">
        ${Array.from(
          {length:24},
          (_,i)=>
            `<option value="${i}">
              ${String(i).padStart(2,'0')}:00
            </option>`
        ).join('')}
      </select>
    </label>

  </div>

  <div
    style="
      display:flex;
      gap:12px;
      margin-top:14px;
      flex-wrap:wrap;
    "
  >

    <label>
      <input
        type="checkbox"
        id="reportEnabled"
      >
      Automatischen Versand aktivieren
    </label>

    <label>
      <input
        type="checkbox"
        id="reportWhenEmpty"
      >
      Auch ohne Änderungen senden
    </label>

  </div>

  <div
    style="
      display:flex;
      gap:12px;
      margin-top:16px;
      flex-wrap:wrap;
    "
  >

    <button
      class="btn"
      id="saveReportSettings"
      type="button">
      Speichern
    </button>

    <button
      class="btn alt"
      id="sendReportNow"
      type="button">
      Bericht jetzt senden
    </button>

  </div>

</section>
  <div
    id="userList"
    style="margin-top:15px">
  </div>

</section>
`;

wrap.append(panel);

const $=id=>document.getElementById(id);

async function api(url,method='GET',data){

  const response=await fetch(
    url,
    {
      method,
      credentials:'same-origin',
      cache:'no-store',
      headers:data
        ? {'Content-Type':'application/json'}
        : {},
      body:data
        ? JSON.stringify(data)
        : undefined
    }
  );

  const json=await response.json();

  if(!response.ok){
    throw new Error(
      json.error ||
      ('HTTP ' + response.status)
    );
  }

  return json;
}

function message(text){

  $('accountState').textContent=text;
}
async function loadReportSettings(){

  const data =
    await api(
      '/api/me/report-settings'
    );

  $('reportRecipients').value =
    (data.recipients || [])
      .join('\n');

  $('reportEnabled').checked =
    !!data.dailyEnabled;

  $('reportWhenEmpty').checked =
    !!data.sendWhenEmpty;

  $('reportHour').value =
    String(
      data.sendHour ?? 6
    );
}
async function users(){

  const result=
    await api('/api/admin/users');

  const box=$('userList');

  box.replaceChildren();

  for(const user of result.users){

    const row=
      document.createElement('div');

    row.style.cssText=
      'display:flex;gap:12px;align-items:center;padding:9px;border-bottom:1px solid #405564';

    const title=
      document.createElement('span');

    title.style.flex='1';

    title.textContent=
      user.username+
      ' · '+
      user.role+
      ' · '+
      (user.active
        ? 'aktiv'
        : 'deaktiviert');

    const toggle=
      document.createElement('button');

    toggle.className='btn alt';

    toggle.textContent=
      user.active
        ? 'Deaktivieren'
        : 'Aktivieren';

    toggle.disabled=
      user.id===window.rmUser?.id;

    toggle.onclick=async()=>{

      try{

        await api(
          '/api/admin/users',
          'PATCH',
          {
            id:user.id,
            active:!user.active
          }
        );

        await users();

      }catch(error){

        message(
          error.message
        );
      }
    };

    const remove = document.createElement('button');

remove.type = 'button';
remove.className = 'btn alt';
remove.textContent = 'Löschen';
remove.style.color = '#ff6060';

remove.disabled =
  user.id === window.rmUser?.id;

remove.onclick = async () => {
  if (!confirm(
    'Benutzer "' + user.username +
    '" wirklich dauerhaft löschen?'
  )) {
    return;
  }

  remove.disabled = true;
  toggle.disabled = true;

  try {
    await api(
      '/api/admin/users',
      'DELETE',
      {
        id: user.id
      }
    );

    await users();

    message('Benutzer wurde gelöscht.');
  } catch (error) {
    message(error.message);

    remove.disabled =
      user.id === window.rmUser?.id;

    toggle.disabled =
      user.id === window.rmUser?.id;
  }
};

row.append(
  title,
  toggle,
  remove
);

    box.append(row);
  }
}

async function refresh(){

  try{

    const result=
      await api('/api/auth/me');

    window.rmUser=result.user;

    const user=result.user;

    message(
      user
        ? 'Angemeldet als ' +
          user.username +
          ' (' +
          user.role +
          ')'
        : 'Nicht angemeldet.'
    );

    $('loginForm').hidden=!!user;
    $('logoutButton').hidden=!user;

 const isAdmin =
  user &&
  user.role === 'admin';

$('adminBox').hidden =
  !isAdmin;

$('reportSettingsBox').hidden =
  !isAdmin;

if (isAdmin) {

  await users();

  await loadReportSettings();

}
``
  }catch(error){

    message(
      'Verbindung fehlgeschlagen: ' +
      error.message
    );
  }
}

$('loginForm').onsubmit=
async event=>{

  event.preventDefault();

  try{

    await api(
      '/api/auth/login',
      'POST',
      {
        username:$('loginName').value,
        password:$('loginPassword').value
      }
    );

    $('loginPassword').value='';

    await refresh();

  }catch(error){

    message(
      error.message
    );
  }
};

$('logoutButton').onclick=
async()=>{

  try{

    await api(
      '/api/auth/logout',
      'POST'
    );

    await refresh();

  }catch(error){

    message(
      error.message
    );
  }
};

$('newUserForm').onsubmit=
async event=>{

  event.preventDefault();

  try{

    await api(
      '/api/admin/users',
      'POST',
      {
        username:$('newUserName').value,
        password:$('newUserPassword').value,
        role:$('newUserRole').value
      }
    );

    $('newUserName').value='';
    $('newUserPassword').value='';

    await users();

    message(
      'Nutzer angelegt.'
    );

  }catch(error){

    message(
      error.message
    );
  }
};

menu.onclick=()=>{

  for(const child of wrap.children){

    if(
      child.id &&
      child.id.endsWith('Panel')
    ){
      child.hidden=
        child!==panel;
    }
  }

  panel.hidden=false;

  for(
    const item
    of nav.querySelectorAll('.menuItem')
  ){
    item.classList.toggle(
      'active',
      item===menu
    );
  }

  document.querySelector('.top b')
    .textContent='Mein Konto';
$('saveReportSettings')
?.addEventListener(
  'click',
  async ()=>{

    try{

      const recipients =
        $('reportRecipients')
          .value
          .split('\n')
          .map(x=>x.trim())
          .filter(Boolean);

      await api(
        '/api/me/report-settings',
        'POST',
        {
          recipients,
          dailyEnabled:
            $('reportEnabled').checked,
          sendWhenEmpty:
            $('reportWhenEmpty').checked,
          sendHour:
            Number(
              $('reportHour').value
            )
        }
      );
      $('showReportPreview')
?.addEventListener(
  'click',
  async () => {

    try {

      message(
        'Bericht wird erstellt ...'
      );

      const result =
        await api(
          '/api/me/report-preview'
        );

      const box =
        $('reportPreview');

      box.style.display =
        'block';

      box.innerHTML =
        '<h3>Vorschau Tagesbericht</h3><pre>' +
        (result.report || 'Keine Daten vorhanden.') +
        '</pre>';

      message(
        'Vorschau geladen.'
      );

    } catch (error) {

      message(
        error.message
      );

    }

  }
);
$('sendReportNow')
?.addEventListener(
  'click',
  async ()=>{

    try{

      message(
        'Bericht wird versendet ...'
      );

      const result =
        await api(
          '/api/me/report-send',
          'POST'
        );

      message(
        'Bericht erfolgreich versendet.'
      );

      console.log(result);

    }catch(error){

      message(
        error.message
      );

    }

  }
);
      message(
        'Tagesbericht gespeichert.'
      );

    }catch(error){

      message(
        error.message
      );

    }

  }
);
``
  refresh();
};

nav.addEventListener(
  'click',
  event=>{

    if(
      event.target.closest('.menuItem')
      !==menu
    ){
      panel.hidden=true;
    }
  },
  true
);

refresh();

})();
