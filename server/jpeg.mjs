// Validate JPEG structure and remove APP metadata, comments and trailing bytes.
// Entropy-coded pixels are preserved. ICC profiles are dropped because uploads
// are converted to sRGB in the contribution form before this server-side pass.
export function cleanJPEG(input, maxBytes = 12 * 1024 * 1024, maxPixels = 64000000) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (data.length > maxBytes) throw new Error('The JPEG copy is too large. Please choose a smaller photograph.');
  if (data.length < 16 || data[0] !== 255 || data[1] !== 216) throw new Error('Choose a valid JPEG photograph.');
  const parts = [data.subarray(0, 2)];
  let offset = 2, width = 0, height = 0, scans = 0, ended = false;
  while (offset < data.length) {
    const start = offset;
    if (data[offset++] !== 255) throw new Error('The JPEG structure is invalid.');
    while (data[offset] === 255) offset++;
    const marker = data[offset++];
    if (marker === 217) { parts.push(new Uint8Array([255, 217])); ended = true; break; }
    if (marker === 0 || marker === 216 || (marker >= 208 && marker <= 215)) throw new Error('The JPEG markers are invalid.');
    if (offset + 2 > data.length) throw new Error('The JPEG file is incomplete.');
    const length = (data[offset] << 8) | data[offset + 1];
    const end = offset + length;
    if (length < 2 || end > data.length) throw new Error('The JPEG file is incomplete.');
    if ([192, 193, 194].includes(marker)) {
      if (length < 8 || width || data[offset + 2] !== 8 || ![1, 3].includes(data[offset + 7])) throw new Error('Choose an 8-bit RGB or grayscale JPEG photograph.');
      height = (data[offset + 3] << 8) | data[offset + 4];
      width = (data[offset + 5] << 8) | data[offset + 6];
      if (!width || !height || width > 16000 || height > 16000 || width * height > maxPixels) throw new Error('Choose a photo up to 64 megapixels and 16,000 pixels per edge.');
    }
    const metadata = (marker >= 224 && marker <= 239) || marker === 254;
    if (!metadata) parts.push(data.subarray(start, end));
    offset = end;
    if (marker === 218) {
      if (!width) throw new Error('The JPEG has no image dimensions.');
      scans++;
      const scanStart = offset;
      while (offset < data.length) {
        if (data[offset] !== 255) { offset++; continue; }
        const next = data[offset + 1];
        if (next === 0 || (next >= 208 && next <= 215)) { offset += 2; continue; }
        if (next === 255) { offset++; continue; }
        break;
      }
      parts.push(data.subarray(scanStart, offset));
    }
  }
  if (!ended || !scans || !width) throw new Error('The JPEG file is incomplete or unsupported.');
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) { bytes.set(part, position); position += part.length; }
  return { bytes, width, height };
}
