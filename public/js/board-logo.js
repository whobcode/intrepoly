// Board center logo cycling from whobcode/logos repository

let logos = [];
let currentLogoIndex = 0;
let cycleInterval = null;
const logoContainer = null;

export async function initBoardLogoCycling() {
  // Create logo container in board center if it doesn't exist
  const boardCenter = document.getElementById('board-center-cell');
  if (!boardCenter) return;

  const logoDiv = document.createElement('div');
  logoDiv.id = 'board-logo-container';
  logoDiv.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  `;
  boardCenter.style.position = 'relative';
  boardCenter.style.overflow = 'hidden';
  boardCenter.appendChild(logoDiv);

  // Fetch logos from whobcode/logos repository
  try {
    const response = await fetch('https://api.github.com/repos/whobcode/logos/contents/', {
      headers: { 'Accept': 'application/vnd.github.v3+raw' }
    });

    if (!response.ok) {
      console.warn('Failed to fetch logos from GitHub');
      return;
    }

    const files = await response.json();
    logos = files
      .filter(file => /\.(png|jpg|jpeg|gif|svg)$/i.test(file.name))
      .map(file => ({
        name: file.name,
        url: `https://raw.githubusercontent.com/whobcode/logos/main/${file.name}`
      }));

    if (logos.length === 0) {
      console.warn('No image files found in whobcode/logos');
      return;
    }

    // Display first logo and start cycling
    displayLogo(logoDiv, 0);
    startCycling(logoDiv);
  } catch (error) {
    console.warn('Error initializing board logo cycling:', error);
  }
}

function displayLogo(container, index) {
  if (logos.length === 0) return;
  const logo = logos[index % logos.length];
  container.innerHTML = `<img src="${logo.url}" alt="Board logo" style="width: 100%; height: 100%; object-fit: cover;" />`;
}

function startCycling(container) {
  if (cycleInterval) clearInterval(cycleInterval);

  cycleInterval = setInterval(() => {
    currentLogoIndex = (currentLogoIndex + 1) % logos.length;
    displayLogo(container, currentLogoIndex);
  }, 15000); // Change every 15 seconds
}

export function stopLogoCycling() {
  if (cycleInterval) {
    clearInterval(cycleInterval);
    cycleInterval = null;
  }
}
