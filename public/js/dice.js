export function renderDice(dice) {
  const [d0, d1] = dice || [0, 0];
  const dieEl0 = document.getElementById('die0');
  const dieEl1 = document.getElementById('die1');
  if (dieEl0) {
    dieEl0.style.display = 'block';
    dieEl0.classList.remove('die-no-img');
    dieEl0.innerHTML = renderDieSVG(d0);
    dieEl0.title = d0 ? `Die (${d0} spots)` : 'Die';
  }
  if (dieEl1) {
    dieEl1.style.display = 'block';
    dieEl1.classList.remove('die-no-img');
    dieEl1.innerHTML = renderDieSVG(d1);
    dieEl1.title = d1 ? `Die (${d1} spots)` : 'Die';
  }
}

export function renderDieSVG(n) {
  const pips = {
    1: [[12,12]],
    2: [[7,7],[17,17]],
    3: [[7,7],[12,12],[17,17]],
    4: [[7,7],[7,17],[17,7],[17,17]],
    5: [[7,7],[7,17],[12,12],[17,7],[17,17]],
    6: [[7,7],[7,12],[7,17],[17,7],[17,12],[17,17]],
  }[n] || [];
  const circles = pips.map(([cx,cy]) => `<circle cx="${cx}" cy="${cy}" r="2.2" fill="#111"/>`).join('');
  return `
    <svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img">
      <rect x="1.5" y="1.5" width="21" height="21" rx="3" fill="#fff" stroke="#111" stroke-width="1.5"/>
      ${circles}
    </svg>
  `;
}

