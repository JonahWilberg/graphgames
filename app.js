import { RNG } from "./rng.js";
import { makeRing, makeLattice, makeErdosRenyi, makeBA, relaxLayout } from "./graph.js";
import {
  donationToMatrix,
  stepDB, stepBD, stepImitationFermi,
  countCooperators, isFixated
} from "./evo.js";

const $ = (id) => document.getElementById(id);

const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const chart = $("chart");
const cctx = chart.getContext("2d");

let rng = new RNG(1);
let g = null;
let strat = null; // Uint8Array of 0/1
let t = 0;
let running = false;
let series = []; // coop fraction over time (downsampled)

function uiMatrix() {
  const useDonation = $("useDonation").checked;
  if (useDonation) {
    const b = parseFloat($("b").value);
    const c = parseFloat($("c").value);
    return donationToMatrix(b, c);
  } else {
    return {
      R: parseFloat($("R").value),
      S: parseFloat($("S").value),
      T: parseFloat($("T").value),
      P: parseFloat($("P").value),
    };
  }
}

function uiUpdateRule() {
  return $("updateRule").value; // DB / BD / IM
}

function uiIntensity() {
  return parseFloat($("intensity").value);
}

function uiMu() {
  return parseFloat($("mu").value);
}

function setTheoryHint() {
  const type = $("graphType").value;
  const rule = uiUpdateRule();
  const useDonation = $("useDonation").checked;
  let hint = "";

  if (type === "ring" && useDonation && rule === "DB") {
    const k = parseInt(paramInput("ring_k").value, 10);
    hint =
      `Weak-selection rule-of-thumb on k-regular graphs (DB): cooperation tends to be favored when b/c > k. ` +
      `Here k=${k}, so try b/c > ${k}.`;
  } else if (type === "ring" && useDonation && rule === "BD") {
    hint =
      `On many regular graphs, BD updating is much less favorable to cooperation than DB under weak selection. ` +
      `Try switching DB vs BD and compare.`;
  } else {
    hint = `Try DB vs BD vs Imitation; vary selection intensity and graph heterogeneity (ER vs BA).`;
  }

  $("theoryHint").textContent = hint;
}

function paramInput(id) {
  return document.querySelector(`[data-param="${id}"]`);
}

function renderGraphParams() {
  const type = $("graphType").value;
  const box = $("graphParams");
  box.innerHTML = "";

  const mk = (label, id, attrs = {}) => {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const inp = document.createElement("input");
    inp.dataset.param = id;
    for (const [k, v] of Object.entries(attrs)) inp.setAttribute(k, v);
    wrap.appendChild(inp);
    box.appendChild(wrap);
    return inp;
  };

  if (type === "ring") {
    mk("Degree k (even)", "ring_k", { type: "number", min: "2", step: "2", value: "4" });
  } else if (type === "lattice") {
    // N must be square; we enforce in builder
    const div = document.createElement("div");
    div.className = "small";
    div.textContent = "Lattice uses von Neumann neighbors (degree 4) with periodic boundaries. N must be a perfect square.";
    box.appendChild(div);
  } else if (type === "erdos") {
    mk("Edge probability p", "erdos_p", { type: "number", min: "0", max: "1", step: "0.01", value: "0.05" });
  } else if (type === "ba") {
    mk("Initial clique m0", "ba_m0", { type: "number", min: "2", step: "1", value: "6" });
    mk("Edges per new node m", "ba_m", { type: "number", min: "1", step: "1", value: "2" });
  }
  setTheoryHint();
}

function buildGraph() {
  const N = parseInt($("N").value, 10);
  const seed = parseInt($("seed").value, 10);
  rng = new RNG(seed);

  const type = $("graphType").value;

  try {
    if (type === "ring") {
      const k = parseInt(paramInput("ring_k").value, 10);
      g = makeRing(N, k, rng);
    } else if (type === "lattice") {
      g = makeLattice(N, rng);
    } else if (type === "erdos") {
      const p = parseFloat(paramInput("erdos_p").value);
      g = makeErdosRenyi(N, p, rng);
      relaxLayout(g, Math.min(220, Math.max(80, Math.floor(40000 / N))), rng);
    } else if (type === "ba") {
      const m0 = parseInt(paramInput("ba_m0").value, 10);
      const m = parseInt(paramInput("ba_m").value, 10);
      g = makeBA(N, m0, m, rng);
      relaxLayout(g, Math.min(220, Math.max(80, Math.floor(40000 / N))), rng);
    }
  } catch (e) {
    alert(e.message);
    return;
  }

  $("graphInfo").textContent = `${type} | N=${g.N} | E=${g.edgeCount()}`;
  $("degInfo").textContent = g.avgDegree().toFixed(2);

  resetPopulation();
  series = [];
  t = 0;
  render();
  setTheoryHint();
}

function resetPopulation() {
  if (!g) return;
  const initC = parseFloat($("initC").value);
  strat = new Uint8Array(g.N);
  for (let i = 0; i < g.N; i++) strat[i] = (rng.random() < initC) ? 1 : 0;
  updateStats();
  render();
}

function stepMany(steps) {
  if (!g || !strat) return;
  const M = uiMatrix();
  const rule = uiUpdateRule();
  const intensity = uiIntensity();
  const mu = uiMu();

  for (let s = 0; s < steps; s++) {
    if (rule === "DB") stepDB(g, strat, M, intensity, mu, rng);
    else if (rule === "BD") stepBD(g, strat, M, intensity, mu, rng);
    else stepImitationFermi(g, strat, M, intensity, mu, rng);

    t += 1;
  }

  const frac = countCooperators(strat) / strat.length;
  if (series.length === 0 || series[series.length - 1].t < t) {
    // downsample for chart
    if (series.length < 900 || t % 10 === 0) series.push({ t, frac });
  }

  updateStats();
  render();
}

function updateStats() {
  if (!g || !strat) return;
  $("timeInfo").textContent = String(t);
  const c = countCooperators(strat);
  $("coopInfo").textContent = `${c}/${strat.length} (${(c / strat.length).toFixed(3)})`;
}

function worldToCanvas(p) {
  const pad = 30;
  const x = pad + (p.x + 1.2) / 2.4 * (canvas.width - 2 * pad);
  const y = pad + (p.y + 1.2) / 2.4 * (canvas.height - 2 * pad);
  return { x, y };
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!g) return;

  // edges
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#9ca3af";
  for (let i = 0; i < g.N; i++) {
    const pi = worldToCanvas(g.pos[i]);
    for (const j of g.adj[i]) if (j > i) {
      const pj = worldToCanvas(g.pos[j]);
      ctx.beginPath();
      ctx.moveTo(pi.x, pi.y);
      ctx.lineTo(pj.x, pj.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // nodes
  const r = Math.max(2, Math.min(7, Math.floor(260 / Math.sqrt(g.N))));
  for (let i = 0; i < g.N; i++) {
    const p = worldToCanvas(g.pos[i]);
    const isC = strat ? strat[i] === 1 : false;
    ctx.fillStyle = isC ? "#60a5fa" : "#f87171";
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  renderChart();
}

function renderChart() {
  cctx.clearRect(0, 0, chart.width, chart.height);
  cctx.lineWidth = 2;
  cctx.strokeStyle = "#e5e7eb";
  cctx.globalAlpha = 0.8;

  // axes
  cctx.globalAlpha = 0.25;
  cctx.strokeStyle = "#9ca3af";
  cctx.beginPath();
  cctx.moveTo(40, 10);
  cctx.lineTo(40, chart.height - 30);
  cctx.lineTo(chart.width - 10, chart.height - 30);
  cctx.stroke();
  cctx.globalAlpha = 1;

  if (series.length < 2) return;

  const tMin = series[0].t;
  const tMax = series[series.length - 1].t;
  const x0 = 40, x1 = chart.width - 10;
  const y0 = 10, y1 = chart.height - 30;

  const X = (tt) => x0 + (tt - tMin) / (tMax - tMin + 1e-9) * (x1 - x0);
  const Y = (ff) => y1 - ff * (y1 - y0);

  cctx.strokeStyle = "#e5e7eb";
  cctx.beginPath();
  cctx.moveTo(X(series[0].t), Y(series[0].frac));
  for (let i = 1; i < series.length; i++) {
    cctx.lineTo(X(series[i].t), Y(series[i].frac));
  }
  cctx.stroke();

  // labels
  cctx.fillStyle = "#9ca3af";
  cctx.font = "12px ui-sans-serif, system-ui";
  cctx.fillText("1.0", 10, y0 + 4);
  cctx.fillText("0.0", 10, y1 + 4);
  cctx.fillText(`t=${tMin}`, x0, chart.height - 10);
  cctx.fillText(`t=${tMax}`, x1 - 60, chart.height - 10);
}

function loop() {
  if (running) {
    const steps = parseInt($("stepsPerTick").value, 10);
    stepMany(steps);
  }
  requestAnimationFrame(loop);
}

// Fixation experiment: start with single mutant C or D, estimate fixation probabilities.
// For PD + cooperation questions, you typically care about C invading D (single C mutant in sea of D).
async function runFixation() {
  if (!g) return;
  const trials = parseInt($("trials").value, 10);
  const maxSteps = parseInt($("maxStepsTrial").value, 10);

  const M = uiMatrix();
  const rule = uiUpdateRule();
  const intensity = uiIntensity();
  const mu = 0; // fixation experiments usually set mutation off
  const baseSeed = parseInt($("seed").value, 10);

  let fixC = 0, fixD = 0, timeout = 0;

  // Alternate: single C in all-D, then single D in all-C, to get both invasion directions.
  for (let tr = 0; tr < trials; tr++) {
    // Different seed per trial for reproducibility
    const trRng = new RNG(baseSeed + 1000 + tr);

    // coin flip which scenario to run each trial
    const scenario = (tr % 2 === 0) ? "C_in_D" : "D_in_C";

    const s = new Uint8Array(g.N);
    if (scenario === "C_in_D") {
      s.fill(0);
      s[trRng.int(g.N)] = 1;
    } else {
      s.fill(1);
      s[trRng.int(g.N)] = 0;
    }

    let steps = 0;
    while (steps < maxSteps && !isFixated(s)) {
      if (rule === "DB") stepDB(g, s, M, intensity, mu, trRng);
      else if (rule === "BD") stepBD(g, s, M, intensity, mu, trRng);
      else stepImitationFermi(g, s, M, intensity, mu, trRng);
      steps++;
    }

    if (!isFixated(s)) {
      timeout++;
    } else {
      const allC = (s[0] === 1);
      if (allC) fixC++; else fixD++;
    }

    // Occasionally yield so the UI stays responsive
    if (tr % 50 === 0) await new Promise(r => setTimeout(r, 0));
  }

  $("fixC").textContent = `${fixC}/${trials} (${(fixC / trials).toFixed(3)})`;
  $("fixD").textContent = `${fixD}/${trials} (${(fixD / trials).toFixed(3)})`;
  $("fixT").textContent = `${timeout}/${trials} (${(timeout / trials).toFixed(3)})`;
}

// UI wiring
$("graphType").addEventListener("change", () => { renderGraphParams(); });
$("useDonation").addEventListener("change", () => {
  const on = $("useDonation").checked;
  $("donationBox").classList.toggle("hidden", !on);
  $("matrixBox").classList.toggle("hidden", on);
  setTheoryHint();
});

$("updateRule").addEventListener("change", setTheoryHint);

$("buildGraph").addEventListener("click", buildGraph);
$("resetPop").addEventListener("click", () => { t = 0; series = []; resetPopulation(); });
$("stepOnce").addEventListener("click", () => stepMany(1));
$("runToggle").addEventListener("click", () => {
  running = !running;
  $("runToggle").textContent = running ? "Pause" : "Run";
});
$("runFixation").addEventListener("click", runFixation);

renderGraphParams();
buildGraph();
loop();
