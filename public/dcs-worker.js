import { fitTransform, applyTransform } from './dcs-core.mjs';

let current = null;
let latestImageId = 0;

function canvas(width, height) {
  const result = new OffscreenCanvas(width, height);
  const context = result.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  if (!context) throw new Error('Your browser could not allocate an image canvas. Try a smaller photograph.');
  return { canvas: result, context };
}

function calculate(settings, region) {
  const { width, height, bitmap } = current;
  const box = region || [0, 0, 1, 1];
  if (box.length !== 4 || box.some(value => !Number.isFinite(value) || value < 0 || value > 1) || box[2] <= box[0] || box[3] <= box[1]) throw new Error('Select a valid image area.');
  const [x, y, right, bottom] = box.map((value, index) => Math.round(value * (index % 2 ? height : width)));
  if (right - x < 4 || bottom - y < 4) throw new Error('Choose a larger image area.');
  const scale = Math.min(1, 720 / Math.max(right - x, bottom - y));
  const w = Math.max(1, Math.round((right - x) * scale)), h = Math.max(1, Math.round((bottom - y) * scale));
  const sample = canvas(w, h);
  sample.context.imageSmoothingEnabled = false;
  sample.context.drawImage(bitmap, x, y, right - x, bottom - y, 0, 0, w, h);
  const fit = fitTransform(sample.context.getImageData(0, 0, w, h).data, settings);
  return { ...fit, fitBoxPixels: [x, y, right, bottom], fitBoxFraction: box, sampling: 'nearest-neighbor grid, longest side <= 720 pixels', sampleGrid: [w, h], width, height, colorSpace: 'browser-decoded sRGB', sourceSHA256: current.sha256, alpha: 'preserved; translucent pixels excluded from fitting' };
}

self.onmessage = async ({ data }) => {
  const { jobId, type, imageId } = data;
  try {
    if (type === 'load') {
      latestImageId = imageId;
      let bitmap;
      try { bitmap = await createImageBitmap(data.blob, { imageOrientation: 'from-image' }); }
      catch { throw new Error('This photo could not be opened. Try a JPEG, PNG, WebP or AVIF image.'); }
      if (imageId !== latestImageId) { bitmap.close(); throw new Error('A newer photo was selected.'); }
      const { width, height } = bitmap;
      if (width * height > 64000000 || Math.max(width, height) > 16000) { bitmap.close(); throw new Error('Use a photograph up to 64 megapixels and 16,000 pixels on its longest edge.'); }
      const scale = Math.min(1, 1600 / Math.max(width, height));
      const previewWidth = Math.max(1, Math.round(width * scale)), previewHeight = Math.max(1, Math.round(height * scale));
      const preview = canvas(previewWidth, previewHeight);
      preview.context.imageSmoothingQuality = 'high';
      preview.context.drawImage(bitmap, 0, 0, previewWidth, previewHeight);
      const originalPreview = await preview.canvas.convertToBlob({ type: 'image/png' });
      const digest = await crypto.subtle.digest('SHA-256', await data.blob.arrayBuffer());
      if (imageId !== latestImageId) { bitmap.close(); throw new Error('A newer photo was selected.'); }
      current?.bitmap.close();
      current = { bitmap, width, height, imageId, previewWidth, previewHeight, sha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') };
      self.postMessage({ jobId, type: 'loaded', imageId, width, height, previewWidth, previewHeight, originalPreview });
      return;
    }
    if (!current || current.imageId !== imageId) throw new Error('Please select a photo first.');
    const fit = calculate(data.settings, data.region);
    if (type === 'preview') {
      const output = canvas(current.previewWidth, current.previewHeight);
      output.context.imageSmoothingQuality = 'high';
      output.context.drawImage(current.bitmap, 0, 0, output.canvas.width, output.canvas.height);
      const pixels = output.context.getImageData(0, 0, output.canvas.width, output.canvas.height);
      applyTransform(pixels.data, fit);
      output.context.putImageData(pixels, 0, 0);
      const preview = await output.canvas.convertToBlob({ type: 'image/png' });
      self.postMessage({ jobId, type: 'preview', imageId, preview, fit });
    } else if (type === 'viewport') {
      // Decode only the visible area from the retained native bitmap. Both
      // layers use exactly the same source crop and fitted transform.
      const source = current;
      const box = data.viewport;
      if (!Array.isArray(box) || box.length !== 4 || box.some(value => !Number.isFinite(value) || value < 0 || value > 1) || box[2] <= box[0] || box[3] <= box[1]) throw new Error('Choose a valid close-up area.');
      const x = Math.floor(box[0] * source.width), y = Math.floor(box[1] * source.height);
      const right = Math.min(source.width, Math.ceil(box[2] * source.width)), bottom = Math.min(source.height, Math.ceil(box[3] * source.height));
      const requested = Number(data.outputWidth);
      if (!Number.isFinite(requested) || requested < 1 || requested > 2048) throw new Error('The close-up is too large.');
      const scale = Math.min(requested / (right - x), 2048 / (bottom - y), 1);
      const width = Math.max(1, Math.round((right - x) * scale)), height = Math.max(1, Math.round((bottom - y) * scale));
      const output = canvas(width, height);
      output.context.imageSmoothingQuality = 'high';
      output.context.drawImage(source.bitmap, x, y, right - x, bottom - y, 0, 0, width, height);
      const originalPreview = await output.canvas.convertToBlob({type: 'image/png'});
      const pixels = output.context.getImageData(0, 0, width, height);
      applyTransform(pixels.data, fit);
      output.context.putImageData(pixels, 0, 0);
      const preview = await output.canvas.convertToBlob({type: 'image/png'});
      if (current !== source || latestImageId !== imageId) throw new Error('The photo changed while opening the close-up.');
      self.postMessage({jobId, type: 'viewport', imageId, originalPreview, preview, fit, viewport: [x / source.width, y / source.height, right / source.width, bottom / source.height], width, height});
    } else if (type === 'export') {
      const output = canvas(current.width, current.height);
      output.context.drawImage(current.bitmap, 0, 0);
      const width = current.width, height = current.height;
      for (let y = 0; y < height; y += 256) {
        if (!current || current.imageId !== imageId) throw new Error('The photo changed during export. Please try again.');
        const stripeHeight = Math.min(256, height - y);
        const stripe = output.context.getImageData(0, y, width, stripeHeight);
        applyTransform(stripe.data, fit);
        output.context.putImageData(stripe, 0, y);
        self.postMessage({ jobId, type: 'progress', progress: Math.round((y + stripeHeight) / height * 95) });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const blob = await output.canvas.convertToBlob({ type: 'image/png' });
      self.postMessage({ jobId, type: 'export', imageId, blob, fit });
    } else throw new Error('Unknown image operation.');
  } catch (error) {
    self.postMessage({ jobId, type: 'error', imageId, error: error instanceof Error ? error.message : 'The image operation could not be completed.' });
  }
};
