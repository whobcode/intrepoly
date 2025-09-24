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

// (Removed inline SVG icon fallbacks; we use real image assets.)
