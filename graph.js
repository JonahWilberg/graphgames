import { RNG } from "./rng.js";

/**
 * Graph represented by adjacency lists: adj[i] = array of neighbor indices (undirected).
 */
export class Graph {
  constructor(N) {
    this.N = N;
    this.adj = Array.from({ length: N }, () => []);
    this.pos = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
  }
  addEdge(u, v) {
    if (u === v) return;
    // avoid duplicates
    if (!this.adj[u].includes(v)) this.adj[u].push(v);
    if (!this.adj[v].includes(u)) this.adj[v].push(u);
  }
  degree(i) { return this.adj[i].length; }
  avgDegree() {
    let sum = 0;
    for (let i = 0; i < this.N; i++) sum += this.degree(i);
    return sum / this.N;
  }
  edgeCount() {
    let sum = 0;
    for (let i = 0; i < this.N; i++) sum += this.adj[i].length;
    return sum / 2;
  }
}

/** Ring (k-regular): connect i to i±1..±(k/2) */
export function makeRing(N, k, rng = new RNG(1)) {
  if (k % 2 !== 0) throw new Error("Ring degree k must be even.");
  const g = new Graph(N);
  for (let i = 0; i < N; i++) {
    for (let d = 1; d <= k / 2; d++) {
      const j = (i + d) % N;
      const h = (i - d + N) % N;
      g.addEdge(i, j);
      g.addEdge(i, h);
    }
  }
  // positions on circle
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    g.pos[i] = { x: Math.cos(t), y: Math.sin(t) };
  }
  return g;
}

/** 2D lattice, periodic boundaries, von Neumann neighborhood (degree 4) */
export function makeLattice(N, rng = new RNG(1)) {
  const g = new Graph(N);
  const L = Math.round(Math.sqrt(N));
  const M = L;
  const NN = L * M;
  if (NN !== N) throw new Error("For lattice, N must be a perfect square (e.g., 400, 900).");
  const idx = (x, y) => ((y + M) % M) * L + ((x + L) % L);
  for (let y = 0; y < M; y++) for (let x = 0; x < L; x++) {
    const i = idx(x, y);
    g.addEdge(i, idx(x + 1, y));
    g.addEdge(i, idx(x - 1, y));
    g.addEdge(i, idx(x, y + 1));
    g.addEdge(i, idx(x, y - 1));
  }
  // positions in grid
  for (let y = 0; y < M; y++) for (let x = 0; x < L; x++) {
    const i = idx(x, y);
    g.pos[i] = { x: x / (L - 1) * 2 - 1, y: y / (M - 1) * 2 - 1 };
  }
  return g;
}

/** Erdős–Rényi G(N,p) */
export function makeErdosRenyi(N, p, rng = new RNG(1)) {
  const g = new Graph(N);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (rng.random() < p) g.addEdge(i, j);
    }
  }
  // random-ish positions
  for (let i = 0; i < N; i++) {
    g.pos[i] = { x: rng.random() * 2 - 1, y: rng.random() * 2 - 1 };
  }
  return g;
}

/** Barabási–Albert preferential attachment */
export function makeBA(N, m0, m, rng = new RNG(1)) {
  if (m0 < 2) throw new Error("BA: m0 must be >= 2");
  if (m < 1 || m >= m0) throw new Error("BA: require 1 <= m < m0");
  const g = new Graph(N);

  // start with m0-clique
  for (let i = 0; i < m0; i++) {
    for (let j = i + 1; j < m0; j++) g.addEdge(i, j);
  }

  // list for degree-proportional sampling (node appears degree times)
  const pool = [];
  for (let i = 0; i < m0; i++) {
    for (let d = 0; d < g.degree(i); d++) pool.push(i);
  }

  for (let v = m0; v < N; v++) {
    const targets = new Set();
    while (targets.size < m) {
      const t = pool[rng.int(pool.length)];
      targets.add(t);
    }
    for (const u of targets) g.addEdge(v, u);

    // update pool: add endpoints proportional to new degrees
    // easiest: push v degree(v) times, and for each u push u once per new edge
    for (let d = 0; d < g.degree(v); d++) pool.push(v);
    for (const u of targets) pool.push(u);
  }

  // random positions
  for (let i = 0; i < N; i++) {
    g.pos[i] = { x: rng.random() * 2 - 1, y: rng.random() * 2 - 1 };
  }
  return g;
}

/**
 * Quick-and-cheap layout relaxation for non-lattice/ring graphs.
 * Not physically “correct”; just spreads nodes a bit for viewing.
 */
export function relaxLayout(g, steps = 200, rng = new RNG(1)) {
  const N = g.N;
  // initialize if all zeros
  let allZero = true;
  for (const p of g.pos) if (p.x !== 0 || p.y !== 0) { allZero = false; break; }
  if (allZero) {
    for (let i = 0; i < N; i++) g.pos[i] = { x: rng.random() * 2 - 1, y: rng.random() * 2 - 1 };
  }

  const kRepel = 0.0025;
  const kSpring = 0.01;
  const rest = 0.08;

  for (let it = 0; it < steps; it++) {
    const fx = new Float64Array(N);
    const fy = new Float64Array(N);

    // repulsion (O(N^2) — keep N modest)
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = g.pos[i].x - g.pos[j].x;
      const dy = g.pos[i].y - g.pos[j].y;
      const r2 = dx * dx + dy * dy + 1e-6;
      const f = kRepel / r2;
      fx[i] += dx * f; fy[i] += dy * f;
      fx[j] -= dx * f; fy[j] -= dy * f;
    }

    // springs on edges
    for (let i = 0; i < N; i++) for (const j of g.adj[i]) if (j > i) {
      const dx = g.pos[j].x - g.pos[i].x;
      const dy = g.pos[j].y - g.pos[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1e-6;
      const f = kSpring * (dist - rest);
      const ux = dx / dist, uy = dy / dist;
      fx[i] += ux * f; fy[i] += uy * f;
      fx[j] -= ux * f; fy[j] -= uy * f;
    }

    // integrate + keep in bounds
    for (let i = 0; i < N; i++) {
      g.pos[i].x += fx[i];
      g.pos[i].y += fy[i];
      g.pos[i].x = Math.max(-1.1, Math.min(1.1, g.pos[i].x));
      g.pos[i].y = Math.max(-1.1, Math.min(1.1, g.pos[i].y));
    }
  }
}
