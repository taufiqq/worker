// script.js (VERSI ASLI ANDA, SUDAH DIREKONSTRUKSI)

// --- BAGIAN STATE & SETUP AWAL ---
const controlState = { steering: 0, gas: 0, brake: 0, gasActive: false, timerGas: 100, timerBelok: 350, terakhirBelok: 0, terakhirGas: 0 };
const debugDisplay = document.getElementById('debug-display');
const activeControls = new Map();
const initialPositions = new Map()
const idMobil = window.MQTT_CREDENTIALS.id_mobil;

let animationFrameId;

document.querySelectorAll('.movable-control').forEach(movable => {
    initialPositions.set(movable, {
        top: movable.style.top,
        left: movable.style.left,
        transform: movable.style.transform
    });
});

// --- BAGIAN KONTROL UI (SENTUHAN) ---
function moveElement(element, zone, axis, clientX, clientY) {
    const rect = zone.getBoundingClientRect();
    const targetX = clientX - rect.left;
    const targetY = clientY - rect.top;

    if (axis === 'x') {
        const halfWidth = element.offsetWidth / 2;
        let newLeft = Math.max(halfWidth, Math.min(targetX, zone.clientWidth - halfWidth));
        element.style.left = `${newLeft}px`;
        const travelRange = zone.clientWidth - element.offsetWidth;
        const currentPosition = newLeft - halfWidth;
        const normalizedValue = currentPosition / travelRange;
        controlState.steering = (normalizedValue * 30) - 15;
    } else if (axis === 'y') {
        const halfHeight = element.offsetHeight / 2;
        let newTop = Math.max(halfHeight, Math.min(targetY, zone.clientHeight - halfHeight));
        element.style.top = `${newTop}px`;
        const travelRange = zone.clientHeight - element.offsetHeight;
        const currentPosition = newTop - halfHeight;
        const normalizedValue = currentPosition / travelRange;
        controlState.gas = (1 - normalizedValue) * 30;
    }
}

function onTouchStart(event) {
    event.preventDefault();
    const zone = event.currentTarget;
    const movable = zone.querySelector('.movable-control');
    if (!movable) return;
    const axis = zone.dataset.axis;
    for (const touch of event.changedTouches) {
        activeControls.set(touch.identifier, { movable, zone, axis });
        movable.classList.add('is-active');
        moveElement(movable, zone, axis, touch.clientX, touch.clientY);
    }
}

function onTouchMove(event) {
    for (const touch of event.changedTouches) {
        if (activeControls.has(touch.identifier)) {
            const { movable, zone, axis } = activeControls.get(touch.identifier);
            moveElement(movable, zone, axis, touch.clientX, touch.clientY);
        }
    }
}

function onTouchEnd(event) {
    for (const touch of event.changedTouches) {
        if (activeControls.has(touch.identifier)) {
            const { movable, zone } = activeControls.get(touch.identifier);
            movable.classList.remove('is-active');
            const initial = initialPositions.get(movable);
            movable.style.left = initial.left;
            movable.style.top = initial.top;
            if (zone.dataset.axis === 'x') {
                controlState.steering = 0;
            } else if (zone.dataset.axis === 'y') {
                controlState.gas = 0;
            }
            activeControls.delete(touch.identifier);
        }
    }
}

document.querySelectorAll('.control-zone').forEach(zone => {
    zone.addEventListener('touchstart', onTouchStart, { passive: false });
});
document.addEventListener('touchmove', onTouchMove, { passive: false });
document.addEventListener('touchend', onTouchEnd, { passive: false });
document.addEventListener('touchcancel', onTouchEnd, { passive: false });

const brakeButton = document.getElementById('brake-pedal');
brakeButton.addEventListener('touchstart', (e) => { e.preventDefault(); brakeButton.classList.add('is-active'); controlState.brake = 1; });
brakeButton.addEventListener('touchend', (e) => { e.preventDefault(); brakeButton.classList.remove('is-active'); controlState.brake = 0; });
const gasButton = document.getElementById('mulai-gas');
gasButton.addEventListener('touchstart', () => { controlState.gasActive = true; });
gasButton.addEventListener('touchend', () => { controlState.gasActive = false; });


// --- BAGIAN LOGIKA MQTT & GAME ---
function mulaiWebsocket(){
  ws = new WebSocket(`wss://${window.location.host}/mqtt/${idMobil}?p=pemain`);
  ws.onopen = () => {
    console.log("sukses");
  }
  ws.onclose = () => {
    setTimeout(mulaiWebsocket,5000);
    console.log("error mulai dalam 5 detik");
  }
}

function kirimPesan(pesan){
  if ( ws.readyState === WebSocket.OPEN){
    ws.send(pesan);
  }
}



function showKickOverlay(text) {
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); }
    const gameControls = document.querySelector('.game-controls');
    if (gameControls) { gameControls.style.display = 'none'; }
    let overlay = document.getElementById('kick-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'kick-overlay';
        Object.assign(overlay.style, { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.9)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', zIndex: '10000', fontSize: '1.5em', fontFamily: 'sans-serif', padding: '20px' });
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div>⚠️<br><br>${text}</div>`;
    overlay.style.display = 'flex';
}

// --- LOGIKA UTAMA PERHITUNGAN RODA ---
const wheelState = { kanan: 0, kiri: 0, belok: 0 };
const GAS_LEVELS = [{ threshold: 1, value: 200 }, { threshold: 11, value: 230 }, { threshold: 26, value: 255 }];
const STEERING_LEVELS = [{ threshold: -13, value: -35 }, { threshold: -5, value: -20 }, { threshold: 5, value: 20 }, { threshold: 13, value: 35 }];
function mapValueToLevel(inputValue, levelsConfig) {
    if (inputValue > 0) { for (let i = levelsConfig.length - 1; i >= 0; i--) { const level = levelsConfig[i]; if (level.threshold > 0 && inputValue >= level.threshold) return level.value; } }
    else if (inputValue < 0) { for (let i = 0; i < levelsConfig.length; i++) { const level = levelsConfig[i]; if (level.threshold < 0 && inputValue <= level.threshold) return level.value; } }
    return 0;
}
function processWheelCommands(belok, gas) {
    let targetRodaKiri = 0, targetRodaKanan = 0;
    if (belok !== wheelState.belok && controlState.timerBelok < Date.now() - controlState.terakhirBelok ) {
      let ledDepan = 0;
      if (belok  < 0 ) {
        ledDepan = 1;
      } else if (belok > 0){
        ledDepan = 2;
      } else {
        ledDepan = 0;
      }
      kirimPesan(`${idMobil}a${92 - belok}/${ledDepan}`); wheelState.belok = belok; controlState.terakhirBelok = Date.now(); }
    switch (belok) {
        case 0: targetRodaKiri = gas; targetRodaKanan = gas; break;
        case 20: targetRodaKiri = gas; targetRodaKanan = gas * 0.8; break;
        case 35: targetRodaKiri = gas; targetRodaKanan = gas * 0.6; break;
        case -20: targetRodaKiri = gas * 0.8; targetRodaKanan = gas; break;
        case -35: targetRodaKiri = gas * 0.6; targetRodaKanan = gas; break;
    }
    targetRodaKiri = Math.round(targetRodaKiri);
    targetRodaKanan = Math.round(targetRodaKanan);
    if(controlState.timerGas < Date.now() - controlState.terakhirGas){
      if (targetRodaKiri !== wheelState.kiri) { wheelState.kiri = targetRodaKiri;
        let ledKiri = (wheelState.kiri > wheelState.kanan) ? 0 : 1;
        kirimPesan(`${idMobil}b${wheelState.kiri}/${ledKiri}`); controlState.terakhirGas = Date.now(); }
      if (targetRodaKanan !== wheelState.kanan) { wheelState.kanan = targetRodaKanan; let ledKanan = (wheelState.kanan > wheelState.kiri) ? 0 : 1;
        kirimPesan(`${idMobil}c${wheelState.kanan}/${ledKanan}`);
        controlState.terakhirGas = Date.now(); }
    }
}

// --- GAME LOOP ---
function updateGameData() {
    if (controlState.brake > 0) {
        const steeringCommand = mapValueToLevel(controlState.steering, STEERING_LEVELS);
        processWheelCommands(steeringCommand, -200);
    } else if (controlState.gasActive) {
        const gasCommand = mapValueToLevel(controlState.gas + 1, GAS_LEVELS);
        const steeringCommand = mapValueToLevel(controlState.steering, STEERING_LEVELS);
        processWheelCommands(steeringCommand, gasCommand);
    } else {
        const steeringCommand = mapValueToLevel(controlState.steering, STEERING_LEVELS);
        processWheelCommands(steeringCommand, 0);
    }
    animationFrameId = requestAnimationFrame(updateGameData);
}

// --- INISIASI ---
updateGameData();

// --- LOGIKA ORIENTASI & FULLSCREEN ---
document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-fullscreen-btn');
    if (startButton) {
        startButton.addEventListener('click', () => {
            const docElm = document.documentElement;
            if (docElm.requestFullscreen) { docElm.requestFullscreen(); }
            else if (docElm.mozRequestFullScreen) { docElm.mozRequestFullScreen(); }
            else if (docElm.webkitRequestFullscreen) { docElm.webkitRequestFullscreen(); }
            else if (docElm.msRequestFullscreen) { docElm.msRequestFullscreen(); }
            if (screen.orientation && typeof screen.orientation.lock === 'function') {
                screen.orientation.lock('landscape').catch(err => console.warn("Tidak dapat mengunci orientasi:", err));
            }
        });
    }
});