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

    row.append(
      title,
      toggle
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

    $('adminBox').hidden=
      !user ||
      user.role!=='admin';

    if(
      user &&
      user.role==='admin'
    ){
      await users();
    }

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
