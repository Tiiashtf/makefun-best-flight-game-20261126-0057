// Kestrel Ridge Run — the heads-up display.
// One clear job: every number the pilot needs, lit like instruments, plus
// the mission checklist and the centre-screen messages. The attitude
// indicator and the compass are drawn on small canvases; the rest is DOM.

import { headingDeg, altitudeAGL } from './flight.js';
import { MISSIONS } from './config.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    speed: $('hud-speed'), alt: $('hud-alt'), agl: $('hud-agl'),
    hdg: $('hud-hdg'), vspeed: $('hud-vs'), fuel: $('fuel-fill'),
    fuelLabel: $('hud-fuel'), throttle: $('thr-fill'), damage: $('dmg-fill'),
    score: $('hud-score'), timer: $('hud-time'), lives: $('hud-lives'),
    mission: $('hud-mission'), objectives: $('hud-objectives'),
    msg: $('hud-message'), warn: $('hud-warn'),
    attitude: $('att-canvas'), compass: $('compass-canvas'),
    gear: $('hud-gear'), flaps: $('hud-flaps'),
  };
  const actx = els.attitude.getContext('2d');
  const cctx = els.compass.getContext('2d');

  let messageTimer = 0;
  let warnTimer = 0;
  let lastMissionKey = '';

  function fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function showMessage(text, seconds = 3) {
    els.msg.textContent = text;
    els.msg.classList.add('show');
    messageTimer = seconds;
  }

  function showWarning(text, seconds = 2.5) {
    els.warn.textContent = text;
    els.warn.classList.add('show');
    warnTimer = seconds;
  }

  function drawAttitude(roll, pitch) {
    const w = els.attitude.width, h = els.attitude.height;
    const cx = w / 2, cy = h / 2, R = w / 2 - 2;
    actx.save();
    actx.clearRect(0, 0, w, h);
    // Clip to the round dial.
    actx.beginPath();
    actx.arc(cx, cy, R, 0, Math.PI * 2);
    actx.clip();
    // Sky and ground, rolled with the aircraft.
    actx.translate(cx, cy);
    actx.rotate(-roll);
    const horizon = pitch * 70; // px per radian, roughly
    actx.fillStyle = '#3f7fd0';
    actx.fillRect(-R - 4, -R - 4 - horizon, (R + 4) * 2, R + 4 + horizon);
    actx.fillStyle = '#7a5a34';
    actx.fillRect(-R - 4, -horizon, (R + 4) * 2, R + 4 + horizon);
    // Horizon line and pitch ladder.
    actx.strokeStyle = '#ffffff';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.moveTo(-R, -horizon);
    actx.lineTo(R, -horizon);
    actx.stroke();
    actx.lineWidth = 1;
    for (const p of [-0.35, -0.18, 0.18, 0.35]) {
      const y = -horizon - p * 70;
      actx.beginPath();
      actx.moveTo(-16, y);
      actx.lineTo(16, y);
      actx.stroke();
    }
    actx.restore();
    // Fixed wings and centre dot.
    actx.strokeStyle = '#ffe9a0';
    actx.lineWidth = 3;
    actx.beginPath();
    actx.moveTo(cx - 34, cy); actx.lineTo(cx - 12, cy);
    actx.moveTo(cx + 12, cy); actx.lineTo(cx + 34, cy);
    actx.stroke();
    actx.fillStyle = '#ffe9a0';
    actx.beginPath();
    actx.arc(cx, cy, 3, 0, Math.PI * 2);
    actx.fill();
    // Dial rim.
    actx.strokeStyle = 'rgba(255,233,160,0.85)';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.arc(cx, cy, R, 0, Math.PI * 2);
    actx.stroke();
  }

  function drawCompass(heading) {
    const w = els.compass.width, h = els.compass.height;
    cctx.clearRect(0, 0, w, h);
    cctx.fillStyle = 'rgba(8, 18, 28, 0.55)';
    cctx.fillRect(0, 0, w, h);
    const pxPerDeg = 3;
    const cx = w / 2;
    cctx.font = 'bold 15px monospace';
    cctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      const deg = (Math.round(heading) + d + 360) % 360;
      const x = cx + d * pxPerDeg;
      const major = deg % 30 === 0;
      cctx.strokeStyle = major ? '#ffe9a0' : 'rgba(255,233,160,0.45)';
      cctx.lineWidth = major ? 2 : 1;
      cctx.beginPath();
      cctx.moveTo(x, 6);
      cctx.lineTo(x, major ? 18 : 12);
      cctx.stroke();
      if (major && x > 22 && x < w - 22) {
        const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
        cctx.fillStyle = '#ffe9a0';
        cctx.fillText(label, x, 34);
      }
    }
    // Centre lubber line.
    cctx.strokeStyle = '#ff5a3c';
    cctx.lineWidth = 3;
    cctx.beginPath();
    cctx.moveTo(cx, 0);
    cctx.lineTo(cx, 8);
    cctx.stroke();
  }

  function setMission(index, done) {
    const key = `${index}:${done}`;
    if (key === lastMissionKey) return;
    lastMissionKey = key;
    els.objectives.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const li = document.createElement('li');
      if (i < index || (i === index && done)) li.className = 'done';
      else if (i === index) li.className = 'active';
      else li.className = 'todo';
      li.textContent = `${i < index || (i === index && done) ? '✓' : i === index ? '▸' : '·'} ${m.name} — ${m.brief}`;
      els.objectives.appendChild(li);
    });
    els.mission.textContent = done
      ? 'ALL MISSIONS COMPLETE'
      : `MISSION ${index + 1}/3 — ${MISSIONS[index].name}`;
  }

  function update(f, dt, missionIndex, missionDone, ringInfo, gateInfo) {
    els.speed.textContent = `${Math.round(f.speed * 1.944)}`; // knots
    const altM = Math.round(f.y);
    els.alt.textContent = `${altM.toLocaleString('en-US')}`;
    els.agl.textContent = `${Math.round(altitudeAGL(f))}`;
    els.hdg.textContent = String(Math.round(headingDeg(f))).padStart(3, '0');
    const vs = f.vspeed;
    els.vspeed.textContent = `${vs >= 0 ? '+' : ''}${vs.toFixed(1)}`;
    els.vspeed.className = vs < -6 ? 'bad' : '';
    els.fuel.style.width = `${f.fuel}%`;
    els.fuelLabel.textContent = `FUEL ${Math.round(f.fuel)}%`;
    els.fuel.className = f.fuel < 20 ? 'low' : '';
    els.throttle.style.width = `${Math.round(f.throttle * 100)}%`;
    els.damage.style.width = `${f.damage}%`;
    els.score.textContent = String(f.score);
    els.timer.textContent = fmtTime(f.time);
    els.lives.textContent = '✈'.repeat(Math.max(0, f.lives));
    els.gear.textContent = f.gearDown ? 'GEAR DOWN' : 'GEAR UP';
    els.flaps.textContent = f.flaps ? 'FLAPS' : 'CLEAN';
    if (missionIndex !== undefined) setMission(missionIndex, missionDone);

    drawAttitude(f.roll, f.pitch);
    drawCompass(headingDeg(f));

    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) els.msg.classList.remove('show');
    }
    if (warnTimer > 0) {
      warnTimer -= dt;
      if (warnTimer <= 0) els.warn.classList.remove('show');
    }

    // Next-target hint under the compass.
    const hint = document.getElementById('hud-next');
    if (ringInfo) hint.textContent = ringInfo;
    else if (gateInfo) hint.textContent = gateInfo;
    else hint.textContent = '';
  }

  return { update, showMessage, showWarning, setMission };
}
