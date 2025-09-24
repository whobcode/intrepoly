export function renderDice(dice) {
  const [d0, d1] = dice || [0, 0];
  const dieEl0 = document.getElementById('die0');
  const dieEl1 = document.getElementById('die1');
  if (dieEl0) {
    dieEl0.style.display = 'block';
    dieEl0.classList.remove('die-no-img');
    dieEl0.innerHTML = d0 ? `<img src="/img/Die_${d0}.png?preset=die&format=auto" alt="Die ${d0} — game die face" title="Die showing ${d0}" width="40" height="40"/>` : '';
    dieEl0.title = d0 ? `Die (${d0} spots)` : 'Die';
  }
  if (dieEl1) {
    dieEl1.style.display = 'block';
    dieEl1.classList.remove('die-no-img');
    dieEl1.innerHTML = d1 ? `<img src="/img/Die_${d1}.png?preset=die&format=auto" alt="Die ${d1} — game die face" title="Die showing ${d1}" width="40" height="40"/>` : '';
    dieEl1.title = d1 ? `Die (${d1} spots)` : 'Die';
  }
}
