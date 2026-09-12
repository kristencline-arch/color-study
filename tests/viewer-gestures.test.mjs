import assert from 'node:assert/strict';
import test from 'node:test';
import {imagePoint, rebaseGesture, selectionBox} from '../app/viewer-gestures.mjs';

const view = {left: -350, top: -200, imageWidth: 1000, imageHeight: 800, center: [.5, .5], zoom: 4};

test('either finger can leave a pinch and the remaining finger resumes panning without a jump', () => {
  for (const released of [12, 27]) {
    const pointers = new Map([[12, [60, 90]], [27, [240, 210]]]);
    const pinch = rebaseGesture(pointers, view);
    assert.ok(pinch.distance > 0);
    assert.equal(pinch.zoom, 4);
    // The image has moved and zoomed since the two fingers first touched it.
    const current = {...view, center: [.62, .43], zoom: 5};
    pointers.set(12, [50, 80]); pointers.set(27, [250, 220]);
    pointers.delete(released);
    const pan = rebaseGesture(pointers, current), [finger] = pointers.values();
    assert.equal(pan.distance, undefined);
    assert.deepEqual(pan.center, [.62, .43]);
    assert.deepEqual([pan.x, pan.y], finger);
    assert.equal(pan.zoom, 5);
    // No stale displacement from before the pinch, then exactly 30 pixels of pan.
    assert.equal(pan.center[0] - (finger[0] - pan.x) / current.imageWidth, .62);
    assert.equal(pan.center[0] - (finger[0] + 30 - pan.x) / current.imageWidth, .59);
    pointers.clear();
    assert.equal(rebaseGesture(pointers, current), null);
  }
});

test('a fast area selection includes the release position and clamps to the photograph', () => {
  const start = imagePoint([150, 200], view);
  assert.deepEqual(start, [.5, .5]);
  // Release beyond the image, without requiring an intermediate move event.
  assert.deepEqual(selectionBox(start, imagePoint([2000, -900], view)), [.5, 0, 1, .5]);
  assert.deepEqual(selectionBox(start, imagePoint([-2000, 2000], view)), [0, .5, .5, 1]);
  assert.deepEqual(selectionBox(start, start), [.5, .5, .5, .5]);
});
