/**
 * Evolutionary dynamics on graphs for 2-strategy games (C/D).
 * Strategies: 1 = C, 0 = D
 *
 * Payoff matrix:
 *   vs C   vs D
 * C   R      S
 * D   T      P
 *
 * Fitness mapping (weak selection):
 *   f = 1 - w + w * payoff   (requires w in [0,1] typically)
 *
 * Imitation (Fermi):
 *   P(i adopts j) = 1/(1 + exp(-beta*(pj - pi)))
 */

export function donationToMatrix(b, c) {
  return { R: b - c, S: -c, T: b, P: 0 };
}

export function computePayoffs(g, strat, M) {
  const N = g.N;
  const pay = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const si = strat[i];
    let sum = 0;
    const nei = g.adj[i];
    for (let k = 0; k < nei.length; k++) {
      const j = nei[k];
      const sj = strat[j];
      if (si === 1 && sj === 1) sum += M.R;
      else if (si === 1 && sj === 0) sum += M.S;
      else if (si === 0 && sj === 1) sum += M.T;
      else sum += M.P;
    }
    pay[i] = sum;
  }
  return pay;
}

function pickWeightedIndex(weights, rng) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return rng.int(weights.length);
  let r = rng.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

export function stepDB(g, strat, M, w, mu, rng) {
  // Death–Birth: choose random node to die, neighbors compete proportional to fitness to fill it.
  const N = g.N;
  const pay = computePayoffs(g, strat, M);

  const dead = rng.int(N);
  const neigh = g.adj[dead];
  if (neigh.length === 0) return 1; // isolated node

  const fit = new Float64Array(neigh.length);
  for (let i = 0; i < neigh.length; i++) {
    const j = neigh[i];
    const fj = (1 - w) + w * pay[j];
    fit[i] = Math.max(0, fj);
  }

  const winnerIdx = pickWeightedIndex(fit, rng);
  const parent = neigh[winnerIdx];
  let childStrat = strat[parent];

  // mutation (optional)
  if (mu > 0 && rng.random() < mu) childStrat = 1 - childStrat;

  strat[dead] = childStrat;
  return 1;
}

export function stepBD(g, strat, M, w, mu, rng) {
  // Birth–Death: choose reproducer proportional to fitness, then random neighbor replaced.
  const N = g.N;
  const pay = computePayoffs(g, strat, M);

  const fitAll = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const fi = (1 - w) + w * pay[i];
    fitAll[i] = Math.max(0, fi);
  }

  const parent = pickWeightedIndex(fitAll, rng);
  const neigh = g.adj[parent];
  if (neigh.length === 0) return 1;

  const dead = neigh[rng.int(neigh.length)];
  let childStrat = strat[parent];
  if (mu > 0 && rng.random() < mu) childStrat = 1 - childStrat;
  strat[dead] = childStrat;
  return 1;
}

export function stepImitationFermi(g, strat, M, beta, mu, rng) {
  // Pick random focal i, pick random neighbor j, i adopts j with Fermi probability
  const N = g.N;
  const pay = computePayoffs(g, strat, M);

  const i = rng.int(N);
  const neigh = g.adj[i];
  if (neigh.length === 0) return 1;
  const j = neigh[rng.int(neigh.length)];

  const pi = pay[i], pj = pay[j];
  const pAdopt = 1 / (1 + Math.exp(-beta * (pj - pi)));

  if (rng.random() < pAdopt) {
    let s = strat[j];
    if (mu > 0 && rng.random() < mu) s = 1 - s;
    strat[i] = s;
  }
  return 1;
}

export function countCooperators(strat) {
  let c = 0;
  for (let i = 0; i < strat.length; i++) c += (strat[i] === 1 ? 1 : 0);
  return c;
}

export function isFixated(strat) {
  const first = strat[0];
  for (let i = 1; i < strat.length; i++) if (strat[i] !== first) return false;
  return true;
}
