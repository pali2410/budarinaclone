export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function getPointID(row, col, gridH) {
  return col * gridH + row;
}

export function getPointsForGridId(id, gridW, gridH) {
  const col = Math.floor(id / gridH);
  const row = id % gridH;
  return { row, col, id };
}

export function getEdgeIdsForGridId(id, gridW, gridH) {
  const col = Math.floor(id / gridH);
  const row = id % gridH;
  const edges = [];
  if (row < gridH - 1) edges.push(id + gridW * gridH);
  if (col < gridW - 1) edges.push(id + gridW * gridH * 2);
  return edges;
}

export function hash(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = n + (n << 3);
  n = n ^ (n >>> 4);
  n = n * 0x27d4eb2d;
  n = n ^ (n >>> 15);
  return (n >>> 0) / 4294967296;
}
