async function listRooms() {
  const res = await fetch('/api/lobby/list');
  const data = await res.json();
  const container = document.getElementById('rooms');
  container.innerHTML = '';
  (data.rooms || []).forEach(r => {
    const div = document.createElement('div');
    div.className = 'room';
    const a = document.createElement('a');
    a.href = `/#${r.id}`;
    a.textContent = r.id;
    const copy = document.createElement('button');
    copy.textContent = 'Copy Link';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(`${window.location.origin}/#${r.id}`); statusMsg(`Copied ${r.id} link`); } catch {}
    };
    const spectate = document.createElement('button');
    spectate.textContent = 'Spectate';
    spectate.onclick = () => { window.location.href = `/?spectate=1#${r.id}`; };
    const join = document.createElement('button');
    join.textContent = `Join${r.members ? ` (${r.members})` : ''}`;
    join.onclick = async () => {
      await fetch('/api/lobby/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: r.id, user: 'anon' })});
      window.location.href = `/${'#'+r.id}`;
    };
    div.appendChild(a);
    div.appendChild(copy);
    div.appendChild(spectate);
    div.appendChild(join);
    container.appendChild(div);
  });
}

async function createRoom() {
  const res = await fetch('/api/lobby/create', { method: 'POST' });
  const data = await res.json();
  document.getElementById('lobbystatus').textContent = `Created room ${data.id}`;
  await listRooms();
}

async function resumeLast() {
  const res = await fetch('/api/games/recent');
  const data = await res.json();
  if (data.id) {
    window.location.href = `/#${data.id}`;
  } else {
    const s = document.getElementById('lobbystatus');
    s.textContent = 'No recent game to resume.';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('createroom').onclick = createRoom;
  document.getElementById('refreshrooms').onclick = listRooms;
  listRooms();
  showUser();
  const container = document.querySelector('.lobby > div');
  const btn = document.createElement('button');
  btn.textContent = 'Resume Last Game';
  btn.style.marginLeft = '8px';
  btn.onclick = resumeLast;
  container.appendChild(btn);
  async function whoAmI() { try { const r = await fetch('/auth/whoami'); return await r.json(); } catch { return {}; } }
  function statusMsg(s){ const el=document.getElementById('lobbystatus'); if(el){ el.textContent=s; setTimeout(()=>{ if(el.textContent===s) el.textContent=''; },1500);} }

async function showUser() {
  const info = await whoAmI();
  const span = document.getElementById('lobbystatus');
  if (info && info.user) {
    const stats = info.stats ? ` — W:${info.stats.wins||0} L:${info.stats.losses||0} C:${info.stats.credits||0}` : '';
    span.textContent = `Signed in as ${info.user}${stats}`;
  }
}
});
