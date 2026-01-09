export async function whoAmI() {
  const res = await fetch('/auth/whoami');
  return res.json();
}

export async function login(username) {
  const res = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  if (!res.ok) throw new Error('login failed');
  return res.json();
}

export async function logout() {
  const res = await fetch('/auth/logout', { method: 'POST' });
  return res.json();
}

export async function signup(email, username, password) {
  const res = await fetch('/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, username, password }) });
  if (!res.ok) throw new Error('signup failed');
  return res.json();
}

export async function loginEmail(email, password) {
  const res = await fetch('/auth/login-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error('login failed');
  return res.json();
}

export async function requestMagicLink(email) {
  const res = await fetch('/auth/magic-link/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send magic link');
  return data;
}

export async function deleteLobby(roomId) {
  const res = await fetch('/api/lobby/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: roomId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete lobby');
  return data;
}
