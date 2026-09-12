"use client";
/* eslint-disable @next/next/no-img-element -- Private image pixels stay in local blob URLs. */
import {useEffect, useRef, useState, type PointerEvent, type CSSProperties} from "react";

import {imagePoint as pointOnImage, rebaseGesture, selectionBox} from "./viewer-gestures.mjs";

type Box = [number, number, number, number];
type ViewportReply = {originalPreview: Blob; preview: Blob; viewport: Box};
type Props = {
  width: number; height: number; name: string; before: string; after: string;
  renderKey: string; busy: boolean; selecting: boolean; region: Box | null;
  focusArea: Box | null; onRegion: (box: Box) => void; onCancelSelection: () => void;
  renderViewport: (box: Box, outputWidth: number) => Promise<ViewportReply>;
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export default function StudyViewer(props: Props) {
  const {width, height, name, before, after, renderKey, busy, selecting, region, focusArea, onRegion, onCancelSelection, renderViewport} = props;
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({width: 900, height: 600});
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([.5, .5]);
  const [split, setSplit] = useState(50);
  const [draft, setDraft] = useState<Box | null>(null);
  const [tile, setTile] = useState<{key: string; before: string; after: string; box: Box} | null>(null);
  const [tileStatus, setTileStatus] = useState("");
  const sequence = useRef(0);
  const urls = useRef<string[]>([]);
  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<ReturnType<typeof rebaseGesture>>(null);
  const fitScale = Math.min(1, Math.max(1, size.width - 36) / width, Math.max(1, size.height - 36) / height);
  const scale = Math.min(4, fitScale * zoom);
  const imageWidth = width * scale, imageHeight = height * scale;
  const visibleX = Math.min(.5, size.width / imageWidth / 2), visibleY = Math.min(.5, size.height / imageHeight / 2);
  const cx = clamp(center[0], visibleX, 1 - visibleX), cy = clamp(center[1], visibleY, 1 - visibleY);
  const left = size.width / 2 - cx * imageWidth, top = size.height / 2 - cy * imageHeight;
  const viewport: Box = [clamp(-left / imageWidth, 0, 1), clamp(-top / imageHeight, 0, 1), clamp((size.width - left) / imageWidth, 0, 1), clamp((size.height - top) / imageHeight, 0, 1)];
  const viewportKey = JSON.stringify([renderKey, ...viewport.map(x => +x.toFixed(6)), size.width, zoom]);
  const currentTile = tile?.key === viewportKey ? tile : null;
  const selection = draft || region;

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const resize = () => setSize({width: node.clientWidth, height: node.clientHeight});
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => {sequence.current++; urls.current.forEach(URL.revokeObjectURL);}, []);
  useEffect(() => {
    if (!focusArea) return;
    const timer = setTimeout(() => {
      setCenter([(focusArea[0] + focusArea[2]) / 2, (focusArea[1] + focusArea[3]) / 2]);
      const targetScale = Math.min(4, (size.width - 60) / ((focusArea[2] - focusArea[0]) * width), (size.height - 60) / ((focusArea[3] - focusArea[1]) * height));
      setZoom(Math.max(1, targetScale / fitScale));
    }, 0);
    return () => clearTimeout(timer);
    // Focus changes only when a visitor chooses an annotated detail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusArea]);
  useEffect(() => {
    const id = ++sequence.current;
    if (zoom <= 1 || !after || busy) return;
    const timer = setTimeout(() => {
      setTileStatus("Opening native image detail…");
      void renderViewport(viewport, Math.min(2048, Math.max(1, Math.ceil(size.width * Math.min(window.devicePixelRatio || 1, 2))))).then(result => {
        if (id !== sequence.current) return;
        urls.current.forEach(URL.revokeObjectURL);
        const original = URL.createObjectURL(result.originalPreview), enhanced = URL.createObjectURL(result.preview);
        urls.current = [original, enhanced];
        setTile({key: viewportKey, before: original, after: enhanced, box: result.viewport});
        setTileStatus("Native image detail ready.");
      }).catch(error => {if (id === sequence.current) setTileStatus(error instanceof Error ? error.message : "Close-up unavailable. Try a smaller area.");});
    }, 140);
    return () => {clearTimeout(timer); sequence.current = id + 1;};
    // viewportKey describes all crop and image dependencies; each request is canceled by generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportKey, after, busy, renderViewport]);

  function setMagnification(value: number) {setZoom(clamp(value, 1, 4 / fitScale));}
  function fit() {setZoom(1); setCenter([.5, .5]);}
  function view() {return {left, top, imageWidth, imageHeight, center: [cx, cy] as [number, number], zoom};}
  function stagePoint(event: PointerEvent): [number, number] {
    const rect = stage.current!.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (busy || !after || event.button !== 0 || pointers.current.size >= (selecting ? 1 : 2)) return;
    event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, stagePoint(event));
    gesture.current = rebaseGesture(pointers.current, view());
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    const point = stagePoint(event);
    pointers.current.set(event.pointerId, point);
    const g = gesture.current;
    if (pointers.current.size === 2 && !selecting) {
      const [a, b] = [...pointers.current.values()];
      if (g.distance) setMagnification(g.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / g.distance);
      else gesture.current = rebaseGesture(pointers.current, view());
      return;
    }
    if (selecting) setDraft(selectionBox(g.start, pointOnImage(point, view())));
    else setCenter([clamp(g.center[0] - (point[0] - g.x) / imageWidth, visibleX, 1 - visibleX), clamp(g.center[1] - (point[1] - g.y) / imageHeight, visibleY, 1 - visibleY)]);
  }
  function finishPointer(event: PointerEvent<HTMLDivElement>, canceled = false) {
    if (!pointers.current.has(event.pointerId)) return;
    if (!canceled && selecting && gesture.current) {
      const box = selectionBox(gesture.current.start, pointOnImage(stagePoint(event), view()));
      if (box[2] - box[0] >= .01 && box[3] - box[1] >= .01) onRegion(box);
    }
    pointers.current.delete(event.pointerId);
    setDraft(null);
    gesture.current = rebaseGesture(pointers.current, view());
  }
  const frameStyle: CSSProperties = {left, top, width: imageWidth, height: imageHeight};
  const tileStyle: CSSProperties | undefined = currentTile ? {left: left + currentTile.box[0] * imageWidth, top: top + currentTile.box[1] * imageHeight, width: (currentTile.box[2] - currentTile.box[0]) * imageWidth, height: (currentTile.box[3] - currentTile.box[1]) * imageHeight} : undefined;
  return <div className="study-viewer">
    <div className="viewer-toolbar">
      <div className="comparison-modes" role="group" aria-label="Comparison mode">{[[100, "Original"], [50, "Compare"], [0, "Enhanced"]].map(([value, label]) => <button key={label} disabled={!after} aria-pressed={split === value} onClick={() => setSplit(Number(value))}>{label}</button>)}</div>
      <span className="false-color-badge">False-color enhancement</span>
    </div>
    <div className="zoom-toolbar" role="group" aria-label="Magnification">
      <button onClick={fit} aria-pressed={zoom === 1}>Fit</button><button onClick={() => setMagnification(1 / fitScale)} aria-label="View at 100 percent magnification">100%</button>
      <button onClick={() => setMagnification(zoom / 1.5)} disabled={zoom <= 1} aria-label="Zoom out">−</button><output aria-live="polite">{Math.round(scale * 100)}%</output><button onClick={() => setMagnification(zoom * 1.5)} disabled={scale >= 4} aria-label="Zoom in">+</button>
      <span>Drag to pan · pinch to zoom</span>
    </div>
    <div className={`native-stage ${selecting ? "selecting" : ""}`} ref={stage} tabIndex={0} role="group" aria-label={`Image viewer: ${name}`} aria-describedby="viewer-keyboard-help"
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => finishPointer(event)} onPointerCancel={event => finishPointer(event, true)} onLostPointerCapture={event => finishPointer(event, true)}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const step = event.shiftKey ? 100 : 30;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0", "1", "Escape"].includes(event.key)) event.preventDefault();
        if (event.key === "+" || event.key === "=") setMagnification(zoom * 1.5);
        if (event.key === "-") setMagnification(zoom / 1.5);
        if (event.key === "0") fit();
        if (event.key === "1") setMagnification(1 / fitScale);
        if (event.key === "Escape") {onCancelSelection(); setDraft(null);}
        if (event.key.startsWith("Arrow")) setCenter([clamp(cx + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0) / imageWidth, visibleX, 1 - visibleX), clamp(cy + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) / imageHeight, visibleY, 1 - visibleY)]);
      }}>
      <img className="native-layer" style={frameStyle} src={before} alt={`Original photograph: ${name}`} draggable={false} />
      {currentTile && <img className="native-layer native-detail" style={tileStyle} src={currentTile.before} alt="" draggable={false} />}
      {after && <div className="enhanced-viewport" style={{clipPath: `inset(0 0 0 ${split}%)`}}><img className="native-layer" style={frameStyle} src={after} alt={`False-color enhancement: ${name}`} draggable={false} />{currentTile && <img className="native-layer native-detail" style={tileStyle} src={currentTile.after} alt="" draggable={false} />}</div>}
      {selection && <div className="native-selection" style={{left: left + selection[0] * imageWidth, top: top + selection[1] * imageHeight, width: (selection[2] - selection[0]) * imageWidth, height: (selection[3] - selection[1]) * imageHeight}} />}
      {after && !selecting && split > 0 && split < 100 && <button className="native-divider" style={{left: `${split}%`}} aria-label="Move comparison divider" onPointerDown={event => {event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event => {if (event.currentTarget.hasPointerCapture(event.pointerId)) {event.stopPropagation(); const rect = stage.current!.getBoundingClientRect(); setSplit(clamp((event.clientX - rect.left) / rect.width * 100, 0, 100));}}} onPointerUp={event => event.stopPropagation()} onKeyDown={event => {if (event.key === "ArrowLeft" || event.key === "ArrowRight") {event.preventDefault(); event.stopPropagation(); setSplit(clamp(split + (event.key === "ArrowRight" ? 5 : -5), 0, 100));}}}>↔</button>}
    </div>
    <label className="viewer-split-control">Original / enhanced<input type="range" min="0" max="100" value={split} onChange={event => setSplit(Number(event.target.value))} aria-label="Before and after divider" aria-valuetext={`${Math.round(split)} percent original`} /></label>
    <p className="viewer-help" id="viewer-keyboard-help">Focus the image: arrow keys pan, +/− zoom, 1 opens 100%, 0 fits. Select a surface with the drawing tool or the keyboard area controls.</p>
    {zoom > 1 && <p className="viewer-help" role="status">{tileStatus || "Opening native image detail…"}</p>}
  </div>;
}
