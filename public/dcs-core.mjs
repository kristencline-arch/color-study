/* Independent regularized RGB decorrelation stretch. No generative processing.
 * Background: https://www.dstretch.com/AlgorithmDescription.html
 * Browser previews and native-size exports use the same fitted affine matrix.
 */
export function eigenSymmetric(covariance) {
  const a = covariance.map(row => [...row]);
  const v = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) => +(i === j)));
  const tolerance = Math.max(1, a[0][0] + a[1][1] + a[2][2]) * 1e-13;
  for (let iteration = 0; iteration < 100; iteration++) {
    let p = 0, q = 1;
    for (const [i, j] of [[0, 2], [1, 2]]) if (Math.abs(a[i][j]) > Math.abs(a[p][q])) { p = i; q = j; }
    if (Math.abs(a[p][q]) <= tolerance) break;
    if (iteration === 99) throw new Error('The color calculation did not converge. Try a different image area.');
    const tau = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = (tau < 0 ? -1 : 1) / (Math.abs(tau) + Math.hypot(1, tau));
    const c = 1 / Math.sqrt(1 + t * t), s = t * c, off = a[p][q];
    a[p][p] -= t * off; a[q][q] += t * off; a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      if (k !== p && k !== q) {
        const kp = a[k][p], kq = a[k][q];
        a[k][p] = a[p][k] = c * kp - s * kq;
        a[k][q] = a[q][k] = s * kp + c * kq;
      }
      const vp = v[k][p], vq = v[k][q];
      v[k][p] = c * vp - s * vq; v[k][q] = s * vp + c * vq;
    }
  }
  const values = a.map((row, i) => Math.max(0, row[i]));
  let residual = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const restored = values.reduce((sum, value, k) => sum + v[i][k] * value * v[j][k], 0);
    residual = Math.max(residual, Math.abs(restored - covariance[i][j]));
  }
  if (!Number.isFinite(residual) || residual > Math.max(1, ...values) * 1e-8) throw new Error('The image colors could not be analyzed reliably.');
  return { values, vectors: v, residual };
}

export function fitTransform(pixels, settings = {}) {
  if (!(pixels instanceof Uint8ClampedArray || pixels instanceof Uint8Array) || !pixels.length || pixels.length % 4) throw new Error('Expected a nonempty RGBA image.');
  const targetStd = Number(settings.targetStd ?? 42);
  const maxGain = Number(settings.maxGain ?? 12);
  if (!Number.isFinite(targetStd) || targetStd < 8 || targetStd > 80 || !Number.isFinite(maxGain) || maxGain < 1 || maxGain > 24) throw new Error('Enhancement settings are outside the supported range.');
  const noiseFloor = 2;
  const sums = [0, 0, 0], products = [0, 0, 0, 0, 0, 0];
  let n = 0;
  const usable = i => pixels[i + 3] >= 250 && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 250 && .299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2] >= 8 && .299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2] <= 247;
  for (let i = 0; i < pixels.length; i += 4) {
    if (!usable(i)) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    sums[0] += r; sums[1] += g; sums[2] += b;
    products[0] += r * r; products[1] += r * g; products[2] += r * b;
    products[3] += g * g; products[4] += g * b; products[5] += b * b; n++;
  }
  if (n < 32) throw new Error('Choose a larger area with visible color and fewer deep shadows or clipped highlights.');
  const mean = sums.map(sum => sum / n);
  const covariance = Array.from({ length: 3 }, () => [0, 0, 0]);
  let k = 0;
  for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) covariance[i][j] = covariance[j][i] = (products[k++] - sums[i] * sums[j] / n) / (n - 1);
  const eigen = eigenSymmetric(covariance);
  if (Math.max(...eigen.values) < 1e-7) throw new Error('This area has almost no color variation. Try a larger area or a different photograph.');
  const gains = eigen.values.map(value => Math.min(maxGain, targetStd / Math.sqrt(Math.max(value, noiseFloor ** 2))));
  const matrix = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) => gains.reduce((sum, gain, axis) => sum + eigen.vectors[i][axis] * gain * eigen.vectors[j][axis], 0)));
  const offset = matrix.map(row => 127.5 - row.reduce((sum, value, i) => sum + value * mean[i], 0));
  let clipped = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (!usable(i)) continue;
    if (matrix.some((row, channel) => {
      const value = row[0] * pixels[i] + row[1] * pixels[i + 1] + row[2] * pixels[i + 2] + offset[channel];
      return value < 0 || value > 255;
    })) clipped++;
  }
  return { algorithm: 'regularized-rgb-decorrelation-stretch-v1', matrix, offset, mean, covariance, eigenvalues: eigen.values, eigenvectors: eigen.vectors, gains, targetStd, maxGain, noiseFloor, sampleCount: n, excludedSamples: pixels.length / 4 - n, fitClippedFraction: clipped / n, eigenReconstructionError: eigen.residual, independentColorAxes: eigen.values.filter(value => value > noiseFloor ** 2).length };
}

export function applyTransform(pixels, fit) {
  const a = fit.matrix, b = fit.offset;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = pixels[i], g = pixels[i + 1], blue = pixels[i + 2];
    for (let channel = 0; channel < 3; channel++) {
      const value = a[channel][0] * r + a[channel][1] * g + a[channel][2] * blue + b[channel];
      pixels[i + channel] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }
  return pixels;
}
