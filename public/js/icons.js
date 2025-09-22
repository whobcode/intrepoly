// SVG icons and group colors used on the board cells

export function groupColor(group) {
  switch (group) {
    case 'brown': return '#955436';
    case 'light-blue': return '#9ADAF1';
    case 'pink': return '#F38EB0';
    case 'orange': return '#F7941D';
    case 'red': return '#ED2939';
    case 'yellow': return '#FFD700';
    case 'green': return '#3CB043';
    case 'dark-blue': return '#1F4E79';
    case 'railroad': return '#222';
    case 'utility': return '#666';
    default: return '#bbb';
  }
}

export function iconForSquare(type) {
  switch (type) {
    case 'go':
      return `<svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 12h12l-4-4m4 4l-4 4" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'jail':
      return `<svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" fill="#f3f4f6" stroke="#222"/><path d="M7 4v16M11 4v16M15 4v16M19 4v16" stroke="#222"/></svg>`;
    case 'free-parking':
      return `<svg width="40" height="40" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="20" width="32" height="12" rx="3" fill="#e11"/><circle cx="16" cy="36" r="4" fill="#111"/><circle cx="32" cy="36" r="4" fill="#111"/></svg>`;
    case 'go-to-jail':
      return `<svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 6h12v12H6z" fill="#fce7f3" stroke="#be123c"/><path d="M9 6v12M12 6v12M15 6v12" stroke="#be123c"/></svg>`;
    case 'railroad':
      return `<svg width="40" height="40" viewBox="0 0 65 60" xmlns="http://www.w3.org/2000/svg"><rect x="12" y="26" width="40" height="18" rx="3" fill="#222"/><rect x="18" y="16" width="22" height="12" rx="2" fill="#444"/><circle cx="22" cy="46" r="4" fill="#111"/><circle cx="42" cy="46" r="4" fill="#111"/></svg>`;
    case 'utility':
      return `<svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14h7l-1 8 11-14h-7z" fill="#f6c31c" stroke="#b58900" stroke-width="1"/></svg>`;
    case 'chance':
      return `<svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="19" r="1.8" fill="#111"/><path d="M8.5 9a3.5 3.5 0 1 1 5.6 2.8c-1.2.9-1.8 1.7-1.8 3.2" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>`;
    case 'community-chest':
      return `<svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="8" width="18" height="10" rx="2" fill="#b5651d" stroke="#7a3e0a"/><rect x="3" y="6" width="18" height="4" rx="1" fill="#d88a3d" stroke="#7a3e0a"/><rect x="11" y="11" width="2" height="4" fill="#ffd166"/></svg>`;
    case 'tax':
      return `<svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v18M7 7.5c0-2 1.8-3 5-3 3 0 5 1 5 3s-2 3-5 3-5 1-5 3 2 3 5 3 5-1 5-3" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>`;
    default:
      return '';
  }
}

