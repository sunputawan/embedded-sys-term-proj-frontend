// Import Firebase SDK (ES Modules from CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// === Firebase Config ===
import {firebaseConfig} from "./config.js"

// DOM elements
const tempValueEl = document.getElementById("temp-value");
const statusEl = document.getElementById("status");
const updatedTimeEl = document.getElementById("updated-time");

const thresholdInputEl = document.getElementById("threshold-input");
const thresholdStatusEl = document.getElementById("threshold-status");
const thresholdForm = document.getElementById("threshold-form");

const normalForm = document.getElementById("normal-form");
const alertForm = document.getElementById("alert-form");
const normalPreview = document.getElementById("normal-preview");
const alertPreview = document.getElementById("alert-preview");
const rgbStatusEl = document.getElementById("rgb-status");

const normalREl = document.getElementById("normal-r");
const normalGEl = document.getElementById("normal-g");
const normalBEl = document.getElementById("normal-b");
const alertREl = document.getElementById("alert-r");
const alertGEl = document.getElementById("alert-g");
const alertBEl = document.getElementById("alert-b");

// Initialize Firebase
let db;

try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  statusEl.textContent = "Connected. Waiting for data...";
} catch (err) {
  console.error("Firebase init error:", err);
  statusEl.textContent = "Failed to connect to Firebase";
}

// Helper: clamp 0–255
function clamp255(n) {
  n = Number(n);
  if (Number.isNaN(n)) return 0;
  return Math.min(255, Math.max(0, Math.round(n)));
}

function updatePreview(box, r, g, b) {
  box.style.backgroundColor = `rgb(${clamp255(r)}, ${clamp255(
    g
  )}, ${clamp255(b)})`;
}

// ========= Realtime listeners =========
if (db) {
  // 1) Temperature
  const tempRef = ref(db, "sensor/temperature");
  onValue(
    tempRef,
    (snapshot) => {
      const temp = snapshot.val();

      if (typeof temp === "number") {
        tempValueEl.textContent = temp.toFixed(1);
        statusEl.textContent = "Live";
        const now = new Date();
        updatedTimeEl.textContent = `Last update: ${now.toLocaleTimeString()}`;
      } else {
        tempValueEl.textContent = "--";
        statusEl.textContent = "No numeric data";
      }
    },
    (error) => {
      console.error("onValue error:", error);
      statusEl.textContent = "Error reading data";
    }
  );

  // 2) Threshold
  const thresholdRef = ref(db, "config/threshold");
  onValue(
    thresholdRef,
    (snapshot) => {
      const th = snapshot.val();
      if (typeof th === "number") {
        thresholdInputEl.value = computeTemperatureFromAdc(th).toFixed(1);
        thresholdStatusEl.textContent = "";
      } else {
        thresholdStatusEl.textContent = "No threshold value in DB";
      }
    },
    (error) => {
      console.error("threshold onValue error:", error);
      thresholdStatusEl.textContent = "Error reading threshold";
    }
  );

  // 3) Normal / Alert RGB
  const configRef = ref(db, "config");
  onValue(
    configRef,
    (snapshot) => {
      const cfg = snapshot.val() || {};

      const nR = cfg.normalR ?? 0;
      const nG = cfg.normalG ?? 0;
      const nB = cfg.normalB ?? 0;
      const aR = cfg.alertR ?? 0;
      const aG = cfg.alertG ?? 0;
      const aB = cfg.alertB ?? 0;

      normalREl.value = nR;
      normalGEl.value = nG;
      normalBEl.value = nB;
      alertREl.value = aR;
      alertGEl.value = aG;
      alertBEl.value = aB;

      updatePreview(normalPreview, nR, nG, nB);
      updatePreview(alertPreview, aR, aG, aB);
      rgbStatusEl.textContent = "";
    },
    (error) => {
      console.error("config onValue error:", error);
      rgbStatusEl.textContent = "Error reading LED config";
    }
  );
}

// ========= Form handlers =========

// Save threshold
if (thresholdForm && db) {
  thresholdForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = thresholdInputEl.value;
    const value = Number(raw);

    if (Number.isNaN(value)) {
      thresholdStatusEl.textContent = "Please enter a number";
      return;
    }

    console.log(value, Math.round(computeAdcFromTemperature(value)))

    try {
      const thresholdRef = ref(db, "config/threshold");
      await set(thresholdRef, computeAdcFromTemperature(value));
      thresholdStatusEl.textContent = "Threshold saved ✔";
    } catch (err) {
      console.error("Error saving threshold:", err);
      thresholdStatusEl.textContent = "Failed to save threshold";
    }
  });
}

// Save normal RGB
if (normalForm && db) {
  normalForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const r = clamp255(normalREl.value);
    const g = clamp255(normalGEl.value);
    const b = clamp255(normalBEl.value);

    try {
      await update(ref(db, "config"), {
        normalR: r,
        normalG: g,
        normalB: b,
      });
      updatePreview(normalPreview, r, g, b);
      rgbStatusEl.textContent = "Normal color saved ✔";
    } catch (err) {
      console.error("Error saving normal color:", err);
      rgbStatusEl.textContent = "Failed to save normal color";
    }
  });
}

// Save alert RGB
if (alertForm && db) {
  alertForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const r = clamp255(alertREl.value);
    const g = clamp255(alertGEl.value);
    const b = clamp255(alertBEl.value);

    try {
      await update(ref(db, "config"), {
        alertR: r,
        alertG: g,
        alertB: b,
      });
      updatePreview(alertPreview, r, g, b);
      rgbStatusEl.textContent = "Alert color saved ✔";
    } catch (err) {
      console.error("Error saving alert color:", err);
      rgbStatusEl.textContent = "Failed to save alert color";
    }
  });
}

function computeTemperatureFromAdc(adc) {
  const V = (adc * 3.3) / 4095.0;
  if (V <= 0.001 || V >= 3.299) return -999;

  const Rseries = 47000.0;
  const Rntc = (V * Rseries) / (3.3 - V);

  const A = 0.001129148;
  const B = 0.000234125;
  const C = 0.0000000876741;

  const lnR = Math.log(Rntc);
  const invT = A + B * lnR + C * lnR * lnR * lnR;
  const T_K = 1.0 / invT;
  return T_K - 273.15; // °C
}

function computeAdcFromTemperature(targetTempC) {
  let low = 10;
  let high = 4096;

  let bestAdc = low;
  let bestDiff = 4096;

  for (let i = 0; i < 30; i++) {
    
    const mid = Math.floor((low + high) / 2);
    const tMid = computeTemperatureFromAdc(mid);

    console.log(low, high, mid, tMid)

    const diff = Math.abs(tMid - targetTempC);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestAdc = mid;
    }

    if (tMid > targetTempC) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }

    if (low > high) break;
  }

  return bestAdc; // integer 0–4095
}


