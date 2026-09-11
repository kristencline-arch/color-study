"use client";

/* eslint-disable @next/next/no-img-element -- Blob previews must stay local; study thumbnails are already resized assets. */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import sourceData from "../public/sources.json";
import targets from "../public/targets.json";
import collections from "../public/collections.json";
import Showcase from "./Showcase";
import Catalog from "./Catalog";
import Community, {type CommunityPhoto} from "./Community";
import { NASA_ARTICLE, REPOSITORY, BUY_ME_A_COFFEE } from "./links";

type Region = [number, number, number, number];
type Settings = { targetStd: number; maxGain: number };
type Fit = { fitClippedFraction: number; sampleCount: number; independentColorAxes: number; width: number; height: number; sourceSHA256: string; [key: string]: unknown };
type Reply = { jobId: number; type: string; imageId: number; width: number; height: number; originalPreview: Blob; preview: Blob; blob: Blob; fit: Fit; error?: string; progress?: number };
type Photo = { name: string; sampleId?: string; communityId?: string; author?: string; source?: string; originalURL?: string; notes?: string; license?: string; licenseURL?: string; imageId: number; width: number; height: number };
type Sample = Pick<(typeof sourceData)[number], "id" | "title" | "original_file" | "source_page" | "author" | "license" | "license_url" | "focus_box_fraction"> & {notes?: string; communityId?: string};
const labels: Record<string, string> = Object.fromEntries(sourceData.map(item => [item.id, item.short_title]));
const DEFAULTS: Settings = { targetStd: 42, maxGain: 12 };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function asCommunitySample(photo: CommunityPhoto): Sample {
  return {id: photo.id, communityId: photo.id, title: photo.title, original_file: `api/community/${photo.id}/image`, source_page: photo.image_url, author: photo.author, license: photo.license, license_url: photo.license_url, focus_box_fraction: [.2, .2, .8, .8], notes: `${photo.location}. ${photo.description} Contributor-submitted photograph; context and credit are supplied by the contributor.`};
}

export default function ColorStudy() {
  const [tab, setTab] = useState("showcase");
  const [communityOpened, setCommunityOpened] = useState(false);
  const [catalogOpened, setCatalogOpened] = useState(false);
  const [catalogCollection, setCatalogCollection] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [before, setBefore] = useState("");
  const [afterURL, setAfter] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [region, setRegion] = useState<Region | null>(null);
  const [draftRegion, setDraftRegion] = useState<Region | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [split, setSplit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rendered, setRendered] = useState<{key: string; fit: Fit | null}>({key: "", fit: null});
  const renderKey = JSON.stringify([photo?.imageId, settings, region]);
  const fit = rendered.key === renderKey ? rendered.fit : null;
  const after = fit ? afterURL : "";
  const processing = !!photo && !loading && rendered.key !== renderKey;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [shareURL, setShareURL] = useState("");
  const [dragging, setDragging] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, { resolve: (reply: Reply) => void; reject: (error: Error) => void }>());
  const jobSequence = useRef(0), loadSequence = useRef(0), renderSequence = useRef(0);
  const urls = useRef({ before: "", after: "" });
  const mounted = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null), frameRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<[number, number] | null>(null);
  const fetchController = useRef<AbortController | null>(null);
  const busy = loading || exporting;

  const request = useCallback((type: string, payload: Record<string, unknown>): Promise<Reply> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) return reject(new Error("Image processing is unavailable. Use a current version of Chrome, Edge, Firefox or Safari."));
      const jobId = ++jobSequence.current;
      pending.current.set(jobId, { resolve, reject });
      workerRef.current.postMessage({ jobId, type, ...payload });
    });
  }, []);

  const replaceURL = useCallback((kind: "before" | "after", blob?: Blob) => {
    const url = blob ? URL.createObjectURL(blob) : "";
    if (urls.current[kind]) URL.revokeObjectURL(urls.current[kind]);
    urls.current[kind] = url;
    (kind === "before" ? setBefore : setAfter)(url);
  }, []);

  const loadPhoto = useCallback(async (sample?: Sample, file?: File, initial?: { settings: Settings; region: Region | null }) => {
    if (file && (!/\.(jpe?g|png|webp|avif)$/i.test(file.name) || file.size > 80 * 1024 * 1024)) {
      setError("Choose a JPEG, PNG, WebP or AVIF photograph under 80 MB."); return;
    }
    const imageId = ++loadSequence.current;
    renderSequence.current++;
    fetchController.current?.abort();
    const controller = new AbortController(); fetchController.current = controller;
    setLoading(true); setError(""); setNotice(""); setSelecting(false); setDraftRegion(null);
    try {
      let blob: Blob;
      if (file) blob = file;
      else {
        const response = await fetch(`/${sample!.original_file}`, { signal: controller.signal });
        if (!response.ok) throw new Error("The example photo could not load. Try again or choose your own image.");
        blob = await response.blob();
      }
      if (imageId !== loadSequence.current) return;
      const result = await request("load", { blob, imageId });
      if (!mounted.current || imageId !== loadSequence.current) return;
      replaceURL("before", result.originalPreview); replaceURL("after");
      setPhoto({ name: file?.name || sample!.title, sampleId: sample?.communityId ? undefined : sample?.id, communityId: sample?.communityId, author: sample?.author, source: sample?.source_page, originalURL: sample ? `/${sample.original_file}` : undefined, notes: sample?.notes, license: sample?.license, licenseURL: sample?.license_url, imageId, width: result.width, height: result.height });
      setSettings(initial?.settings || DEFAULTS); setRegion(initial?.region || null); setRendered({key: "", fit: null}); setSplit(50);
    } catch (reason) {
      if (mounted.current && imageId === loadSequence.current) setError(errorText(reason));
    } finally { if (mounted.current && imageId === loadSequence.current) setLoading(false); }
  }, [request, replaceURL]);

  useEffect(() => {
    mounted.current = true;
    const tasks = pending.current, previewURLs = urls.current;
    let worker: Worker | null = null;
    const startup = setTimeout(() => {
      try {
        if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
          setLoading(false); setError("This browser cannot run the image lab. Please use a current Chrome, Edge, Firefox or Safari. The target guide is still available."); return;
        }
        worker = new Worker("/dcs-worker.js", { type: "module" });
        workerRef.current = worker;
        worker.onmessage = ({ data }: MessageEvent<Reply>) => {
          if (data.type === "progress") { setProgress(data.progress || 0); return; }
          const task = pending.current.get(data.jobId);
          if (!task) return;
          pending.current.delete(data.jobId);
          if (data.type === "error") task.reject(new Error(data.error || "Image processing failed.")); else task.resolve(data);
        };
        worker.onerror = () => {
          const reason = new Error("Image processing stopped. Refresh the page or try a smaller photograph in a current browser.");
          worker?.terminate(); workerRef.current = null;
          for (const task of pending.current.values()) task.reject(reason);
          pending.current.clear(); setError(reason.message); setLoading(false); setExporting(false);
        };
        const hash = window.location.hash.slice(1);
        if (["targets", "method", "community", "collection", "lab"].includes(hash)) setTab(hash);
        if (hash === "community") setCommunityOpened(true);
        if (hash === "collection") setCatalogOpened(true);
        const params = new URLSearchParams(hash);
        if (params.has("collection")) {
          const selected = collections.find(item => item.id === params.get("collection"));
          setCatalogCollection(selected?.id || ""); setTab("collection"); setCatalogOpened(true);
        }
        const sample = sourceData.find(item => item.id === params.get("sample")) || sourceData.find(item => item.id === "cueva-hands")!;
        const strength = Number(params.get("strength") || 42), gain = Number(params.get("gain") || 12);
        const initialSettings = { targetStd: Number.isFinite(strength) ? Math.max(12, Math.min(65, strength)) : 42, maxGain: Number.isFinite(gain) ? Math.max(3, Math.min(24, gain)) : 12 };
        const values = params.get("area")?.split(",").map(Number);
        const initialRegion = values?.length === 4 && values.every(value => Number.isFinite(value) && value >= 0 && value <= 1) && values[2] > values[0] && values[3] > values[1] ? values as Region : null;
        if (params.has("community")) {
          setTab("lab"); setLoading(true);
          const id = params.get("community")!;
          const controller = new AbortController(); fetchController.current = controller;
          void fetch(`/api/community/${encodeURIComponent(id)}`, {signal: controller.signal}).then(async response => {
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "This contribution could not be opened.");
            if (mounted.current && fetchController.current === controller) await loadPhoto(asCommunitySample(result.photo), undefined, {settings: initialSettings, region: initialRegion});
          }).catch(reason => {if (mounted.current && !controller.signal.aborted) {setError(errorText(reason)); setLoading(false);}});
        } else if (params.has("sample") || hash === "lab") {
          setTab("lab"); void loadPhoto(sample, undefined, { settings: initialSettings, region: initialRegion });
        }
      } catch (reason) { setError(errorText(reason)); setLoading(false); }
    }, 0);
    return () => {
      clearTimeout(startup); mounted.current = false;
      worker?.terminate(); workerRef.current = null; fetchController.current?.abort();
      for (const task of tasks.values()) task.reject(new Error("Image lab closed."));
      tasks.clear(); Object.values(previewURLs).forEach(url => { if (url) URL.revokeObjectURL(url); });
    };
  }, [loadPhoto]);

  useEffect(() => {
    if (!photo || loading) return;
    const sequence = ++renderSequence.current;
    let disposed = false;
    const timer = setTimeout(async () => {
      setError("");
      try {
        const result = await request("preview", { imageId: photo.imageId, settings, region });
        if (disposed || !mounted.current || sequence !== renderSequence.current) return;
        replaceURL("after", result.preview); setRendered({key: renderKey, fit: result.fit});
      } catch (reason) { if (!disposed && mounted.current && sequence === renderSequence.current) { setError(errorText(reason)); setRendered({key: renderKey, fit: null}); } }
    }, 140);
    return () => { clearTimeout(timer); disposed = true; };
  }, [photo, settings, region, loading, renderKey, request, replaceURL]);

  useEffect(() => {
    if (tab !== "lab" || !stageRef.current || !photo) return;
    const stage = stageRef.current;
    const resize = () => {
      const scale = Math.min(1, (stage.clientWidth - 36) / photo.width, (stage.clientHeight - 36) / photo.height);
      setFrameSize({ width: Math.max(1, photo.width * scale), height: Math.max(1, photo.height * scale) });
    };
    const observer = new ResizeObserver(resize); observer.observe(stage); resize();
    return () => observer.disconnect();
  }, [photo, tab]);

  function switchTab(next: string, loadDefault = true) { setTab(next); if (next === "community") setCommunityOpened(true); if (next === "collection") setCatalogOpened(true); setShareURL(""); window.history.replaceState(null, "", next === "showcase" ? window.location.pathname : next === "collection" && catalogCollection ? `#collection=${catalogCollection}` : `#${next}`); window.scrollTo({top: 0, behavior: "auto"}); if (next === "lab" && loadDefault && !photo && !loading) void loadPhoto(sourceData.find(item => item.id === "cueva-hands")!); }
  function openCollection(id = "") {const selected = collections.find(item => item.id === id)?.id || ""; setCatalogCollection(selected); switchTab("collection"); window.history.replaceState(null, "", selected ? `#collection=${selected}` : "#collection");}
  function pickFile(file?: File) { if (file && !exporting) { switchTab("lab", false); void loadPhoto(undefined, file); } }
  function openStudy(id: string) {const sample = sourceData.find(item => item.id === id); if (sample) {switchTab("lab", false); void loadPhoto(sample, undefined, {settings: {targetStd: 34, maxGain: 12}, region: sample.focus_box_fraction as Region});}}
  function openCommunity(photo: CommunityPhoto) {switchTab("lab", false); void loadPhoto(asCommunitySample(photo));}
  function point(event: PointerEvent<HTMLDivElement>): [number, number] {
    const rect = frameRef.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  }
  function rectangle(start: [number, number], end: [number, number]): Region { return [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1])]; }
  function startSelection(event: PointerEvent<HTMLDivElement>) { if (!selecting || busy) return; pointerStart.current = point(event); event.currentTarget.setPointerCapture(event.pointerId); setDraftRegion(rectangle(pointerStart.current, pointerStart.current)); }
  function moveSelection(event: PointerEvent<HTMLDivElement>) { if (pointerStart.current) setDraftRegion(rectangle(pointerStart.current, point(event))); }
  function endSelection(event: PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current) return;
    const box = rectangle(pointerStart.current, point(event)); pointerStart.current = null; setDraftRegion(null);
    if (box[2] - box[0] < .01 || box[3] - box[1] < .01) { setNotice("Drag a larger rectangle, or use the center-area button."); return; }
    setRegion(box); setSelecting(false); setNotice("");
  }

  function recipe(result: Fit = fit!) { return { app: "Color Study", createdUTC: new Date().toISOString(), source: photo, settings, selectedArea: region, processing: result, interpretation: "False-color enhancement of existing pixels. Not evidence of new markings or original pigment color." }; }
  async function exportImage() {
    if (!photo || !fit || busy || processing) return;
    setExporting(true); setProgress(0); setError("");
    try {
      const result = await request("export", { imageId: photo.imageId, settings, region });
      download(result.blob, `${(photo.sampleId || photo.name.replace(/\.[^.]+$/, "")).replace(/[^a-zA-Z0-9._-]/g, "-")}-color-study.png`);
      setRendered({key: renderKey, fit: result.fit}); setNotice(`Exported ${photo.width.toLocaleString()} x ${photo.height.toLocaleString()} pixels. Save the processing record to keep settings and source credit with your image.`);
    } catch (reason) { setError(`${errorText(reason)} If your browser ran out of memory, try a smaller image.`); }
    finally { setExporting(false); }
  }
  function saveRecipe() { if (fit) download(new Blob([JSON.stringify(recipe(), null, 2)], { type: "application/json" }), "color-study-processing.json"); }
  async function share() {
    const url = new URL(window.location.origin + window.location.pathname);
    if (tab !== "lab" && tab !== "showcase") url.hash = tab === "collection" && catalogCollection ? `collection=${catalogCollection}` : tab;
    else if (tab === "lab" && (photo?.sampleId || photo?.communityId)) {
      const params = new URLSearchParams({ [photo.communityId ? "community" : "sample"]: photo.communityId || photo.sampleId!, strength: String(settings.targetStd), gain: String(settings.maxGain) });
      if (region) params.set("area", region.map(value => value.toFixed(5)).join(","));
      url.hash = params.toString();
    }
    if (navigator.share) {
      try { await navigator.share({title: "Color Study", text: "Look a little closer. Explore textiles and surviving paint, try your own photograph, and help grow an open photo collection.", url: url.href}); return; }
      catch (reason) {if (reason instanceof Error && reason.name === "AbortError") return;}
    }
    try { await navigator.clipboard.writeText(url.href); setNotice(photo?.sampleId || photo?.communityId || tab !== "lab" ? "Link copied. Invite someone to explore the photographs or add one of their own." : "App link copied. Your imported photo is not included."); }
    catch { setShareURL(url.href); }
  }
  function saveTargets() {
    const content = "# Color Study: targets to explore\n\nDocumented = published decorrelation-stretch examples. Candidate = proposed use based on the photographed material, not verified use at that site. Exploratory = a lower-confidence application. These are photo-analysis targets, not claims of undiscovered art.\n\n" + targets.map((item, i) => `## ${i + 1}. ${item.name} (${item.location})\n\n${item.kind} | ${item.material} | ${item.priority}\n\n${item.why}\n\nPhoto to seek: ${item.photo}\n\nInterpretation: ${item.caveat}\n\n[${item.sourceLabel}](${item.source})\n`).join("\n");
    download(new Blob([content], { type: "text/markdown" }), "color-study-targets.md");
  }
  const visibleTargets = targets.filter(item => (filter === "All" || item.kind === filter) && `${item.name} ${item.location} ${item.material} ${item.why}`.toLowerCase().includes(query.toLowerCase()));
  const activeRegion = draftRegion || region;
  const selectedSample = sourceData.find(item => item.id === photo?.sampleId);

  return <div className="app-shell">
    <header className="app-header">
      <button className="brand" onClick={() => switchTab("showcase")} aria-label="Color Study home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Color Study<small>LOOK A LITTLE CLOSER</small></span></button>
      <nav aria-label="Main navigation">{[["showcase", "Discover"], ["collection", "Collection"], ["lab", "Image lab"], ["community", "Contribute"], ["targets", "Field guide"]].map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => switchTab(key)}>{label}</button>)}</nav>
      <div className="header-links"><a className="header-nasa" href={NASA_ARTICLE} target="_blank" rel="noopener noreferrer">NASA article ↗</a><a href={REPOSITORY} target="_blank" rel="noopener noreferrer">GitHub ↗</a><button className="button ghost share-button" onClick={share}>Share <span aria-hidden="true">↗</span></button></div>
    </header>
    <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.avif" className="sr-only" tabIndex={-1} aria-label="Choose a photo" onChange={event => { pickFile(event.target.files?.[0]); event.target.value = ""; }} />
    {shareURL && <div className="message share-fallback"><label>Copy this app link<input readOnly value={shareURL} onFocus={event => event.target.select()} /></label><button className="text-button" onClick={() => setShareURL("")}>Close</button></div>}
    {error && <div className="message error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">&#215;</button></div>}
    {notice && <div className="message notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice">&#215;</button></div>}
    <main>
      {tab === "showcase" && <Showcase onCollection={openCollection} onStudy={openStudy} onLab={() => switchTab("lab")} onCommunity={() => switchTab("community")} onGuide={() => switchTab("targets")} onShare={share} />}
      {catalogOpened && <div hidden={tab !== "collection"}><Catalog key={catalogCollection} collection={catalogCollection} onCollection={openCollection} onStudy={openStudy} onContribute={() => switchTab("community")} /></div>}
      {communityOpened && <div hidden={tab !== "community"}><Community onPhoto={openCommunity} onShare={share} /></div>}
      {tab === "lab" && <div className="lab" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); pickFile(event.dataTransfer.files[0]); }}>
        {dragging && <div className="drop-overlay">Drop a photograph to begin.</div>}
        <aside className="sidebar" aria-label="Photo and enhancement controls">
          <div className="intro-block"><p className="eyebrow">A PHOTOGRAPHIC FIELD LAB</p><h1>Look a little<br /><em>closer.</em></h1><p>Explore surviving paint in murals, cave art and sculpture. Start with a study or your own photograph.</p></div>
          <button className="button import-button" disabled={exporting} onClick={() => inputRef.current?.click()}><span aria-hidden="true">+</span> Open your photo</button>
          <p className="local-note"><span className="status-dot" /> Your photo stays in this browser.</p>
          <div className="control-section"><p className="section-label">01 / CHOOSE A STUDY</p><div className="sample-grid">{sourceData.filter(item => item.study_type === "paint").slice(0, 6).map(item => <button key={item.id} className={`sample ${photo?.sampleId === item.id ? "chosen" : ""}`} disabled={busy} onClick={() => void loadPhoto(item)} aria-pressed={photo?.sampleId === item.id}><img src={`/thumbnails/${item.id}.jpg`} alt="" /><span>{labels[item.id]}</span></button>)}</div><label className="study-picker" htmlFor="study">Browse all {sourceData.length} photographs<select id="study" disabled={busy} value={photo?.sampleId || ""} onChange={event => { const chosen = sourceData.find(item => item.id === event.target.value); if (chosen) void loadPhoto(chosen); }}><option value="" disabled>Select a study</option>{[["textile", "Textiles / dyes and painted cloth"], ["paint", "Painted surfaces"], ["limits", "Technique limits / original studies"]].map(([group, title]) => <optgroup key={group} label={title}>{sourceData.filter(item => item.study_type === group).map(item => <option key={item.id} value={item.id}>{item.short_title} · {(item.expected_dimensions[0] * item.expected_dimensions[1] / 1000000).toFixed(1)} MP</option>)}</optgroup>)}</select></label></div>
          <fieldset className="control-section" disabled={!photo || busy}>
            <legend className="section-label">02 / ADJUST THE COLOR</legend>
            <label className="slider-label" htmlFor="strength">Color separation <output>{settings.targetStd}</output></label><input id="strength" type="range" min="12" max="65" value={settings.targetStd} onChange={event => setSettings(old => ({ ...old, targetStd: Number(event.target.value) }))} /><div className="range-captions"><span>Gentle</span><span>Strong</span></div>
            <label className="slider-label second-slider" htmlFor="gain">Amplification limit <output>{settings.maxGain}x</output></label><input id="gain" type="range" min="3" max="24" value={settings.maxGain} onChange={event => setSettings(old => ({ ...old, maxGain: Number(event.target.value) }))} /><p className="help">A lower limit restrains amplification of weak color signals and noise.</p>
          </fieldset>
          <fieldset className="control-section" disabled={!photo || busy}>
            <legend className="section-label">03 / CHOOSE WHAT TO FIT</legend>
            <div className="segmented"><button type="button" className={!region && !selecting ? "selected" : ""} onClick={() => { setRegion(null); setSelecting(false); }}>Whole photo</button><button type="button" className={region || selecting ? "selected" : ""} onClick={() => { setSelecting(true); setNotice(""); }}>Select surface</button></div>
            <p className="help">{selecting ? "Drag a rectangle on the photo, or use the center area below." : region ? "The transform is fitted to your rectangle and applied to the full photo." : "Use a selected surface to keep other colors from dominating the calculation."}</p>
            <div className="small-actions"><button type="button" onClick={() => { setRegion([.2, .2, .8, .8]); setSelecting(false); }}>Use center area</button>{selectedSample && <button type="button" onClick={() => { setRegion(selectedSample.focus_box_fraction as Region); setSettings(old => ({ ...old, targetStd: 34 })); setSelecting(false); }}>Study area</button>}</div>
          </fieldset>
          <div className="sidebar-bottom"><button className="text-button" disabled={busy} onClick={() => { setSettings(DEFAULTS); setRegion(null); setSelecting(false); setSplit(50); }}>Reset adjustments</button><button className="text-button" disabled={!fit || busy || processing} onClick={saveRecipe}>Save record</button></div>
        </aside>
        <section className="workspace" aria-label="Before and after image comparison">
          <div className="workspace-heading"><div><p className="eyebrow">{photo?.communityId ? "FROM THE COMMUNITY COLLECTION" : photo?.sampleId ? "FROM THE STUDY COLLECTION" : "YOUR PHOTOGRAPH"}</p><h2>{photo ? photo.sampleId ? labels[photo.sampleId] : photo.name : "Preparing the image lab"}</h2></div><button className="button export-button" onClick={exportImage} disabled={!fit || busy || processing}>{exporting ? `Exporting ${progress}%` : "Export PNG"}<span aria-hidden="true">&#8595;</span></button></div>
          <div className="viewer-toolbar"><div className="comparison-modes" role="group" aria-label="Comparison mode">{[[100, "Original"], [50, "Compare"], [0, "Enhanced"]].map(([value, label]) => <button key={label} disabled={!after} aria-pressed={split === value} className={split === value ? "selected" : ""} onClick={() => { setSplit(Number(value)); setSelecting(false); }}>{label}</button>)}</div><span className="false-color-badge"><span /> False-color enhancement</span></div>
          <div className="stage" ref={stageRef}>
            {before && <div className="image-frame" ref={frameRef} style={{ width: frameSize.width || "100%", height: frameSize.height || "100%", "--split": `${split}%` } as CSSProperties}>
              <img className="original-image" src={before} alt={`Original photograph: ${photo?.name}`} draggable={false} />
              {after && <img className="enhanced-image" src={after} alt={`False-color enhancement of ${photo?.name}`} draggable={false} />}
              {after && !selecting && <><span className="divider" aria-hidden="true"><span className="divider-grip">&#8249; &#8250;</span></span><input className="comparison-range" type="range" min="0" max="100" step="0.1" value={split} aria-label="Before and after divider" aria-valuetext={`${Math.round(split)} percent original`} onChange={event => setSplit(Number(event.target.value))} /></>}
              {activeRegion && <div className="selection-box" style={{ left: `${activeRegion[0] * 100}%`, top: `${activeRegion[1] * 100}%`, width: `${(activeRegion[2] - activeRegion[0]) * 100}%`, height: `${(activeRegion[3] - activeRegion[1]) * 100}%` }}><span>Fitting area</span></div>}
              {selecting && <div className="selection-layer" onPointerDown={startSelection} onPointerMove={moveSelection} onPointerUp={endSelection} onPointerCancel={() => { pointerStart.current = null; setDraftRegion(null); }} tabIndex={0} role="group" aria-label="Draw a fitting area; Escape cancels, Enter uses center area" onKeyDown={event => { if (event.key === "Escape") setSelecting(false); if (event.key === "Enter") { setRegion([.2, .2, .8, .8]); setSelecting(false); } }} />}
              <span className="image-badge original-badge">Original</span>{after && <span className="image-badge enhanced-badge">Enhanced</span>}
            </div>}
            {(loading || processing || exporting) && <div className="processing-status" role="status"><span className="spinner" />{loading ? "Opening original photo..." : exporting ? `Rendering full resolution: ${progress}%` : "Calculating color separation..."}</div>}
          </div>
          <div className="image-footer"><span>{photo ? `${photo.width.toLocaleString()} x ${photo.height.toLocaleString()} source pixels` : "Loading study"}</span><span>{selecting ? "Draw on the image to choose a surface" : "Drag the divider to compare"}</span><span>{photo ? `${(photo.width * photo.height / 1000000).toFixed(1)} MP / native export` : "Native-size export"}</span></div>
          {photo && <div className="source-caption"><p>{photo.notes || "Imported photos are processed locally in this tab. They are not uploaded or included in shared links."}</p><div>{photo.author && <>Photo: {photo.author}<br /><a href={photo.source} target="_blank" rel="noopener noreferrer">Original source</a><span> / </span><a href={photo.licenseURL} target="_blank" rel="noopener noreferrer">{photo.license}</a></>}{photo.originalURL && <><br /><a href={photo.originalURL} download>Download source photo</a><br />Enhancements change color; keep this credit and license with shared images.</>}{!photo.author && "Your original file remains unchanged."}</div></div>}
          {fit && <div className="analysis-foot"><span><i /> {fit.sampleCount.toLocaleString()} color samples</span><span>{(fit.fitClippedFraction * 100).toFixed(1)}% of fitted samples reach a display limit</span>{fit.independentColorAxes < 2 && <span>Limited independent color information</span>}</div>}
        </section>
      </div>}
      {tab === "targets" && <section className="guide-page">
        <div className="guide-heading"><div><p className="eyebrow">A FIELD GUIDE / {targets.length} STUDY LEADS</p><h1>Where color<br /><em>has more to say.</em></h1><p>Follow the surviving paint: worn murals, cave paintings, painted plaster and traces of color on sculpture. Featured photographs open directly in the lab; research targets link to their evidence.</p></div><button className="button" onClick={saveTargets}>Download target list <span aria-hidden="true">&#8595;</span></button></div>
        <div className="evidence-key"><p><strong>Documented</strong> Published examples of decorrelation stretch.</p><p><strong>Candidate</strong> Suggested applications based on the material.</p><p><strong>Exploratory</strong> Lower-confidence uses that expose the limits.</p></div>
        <div className="guide-filters"><label className="search-field"><span className="sr-only">Search targets</span><input type="search" placeholder="Search a place, country or material..." value={query} onChange={event => setQuery(event.target.value)} /></label><div className="filter-buttons" role="group" aria-label="Evidence filter">{["All", "Documented", "Candidate", "Exploratory"].map(kind => <button key={kind} className={filter === kind ? "selected" : ""} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind}</button>)}</div></div>
        <p className="results-count" aria-live="polite">{visibleTargets.length} {visibleTargets.length === 1 ? "target" : "targets"}</p>
        <div className="target-grid">{visibleTargets.map(item => <article className="target-card" key={item.name}><div className="target-card-top"><span className={`evidence-badge ${item.kind.toLowerCase()}`}>{item.kind}</span><span>{item.priority}</span></div><p className="eyebrow">{item.location}</p><h2>{item.name}</h2><p className="material">{item.material}</p><p>{item.why}</p><details><summary>What to photograph</summary><p>{item.photo}</p><p className="target-caveat">{item.caveat}</p></details><div className="target-links"><a href={item.source} target="_blank" rel="noopener noreferrer" title={item.sourceLabel}>Source &amp; evidence <span aria-hidden="true">&#8599;</span></a>{item.sample && <button disabled={busy} onClick={() => { switchTab("lab", false); void loadPhoto(sourceData.find(sample => sample.id === item.sample)!); }}>Try study photo <span aria-hidden="true">&#8594;</span></button>}</div></article>)}</div>
        {!visibleTargets.length && <p className="empty-results">No matching targets. Try a different place or material.</p>}
        <p className="guide-note">For damaged or overpainted works, compare dated photographs and conservation records. Enhancement alone cannot determine whether a loss was intentional or recover paint hidden by an opaque layer. Candidate ratings are suggestions, not confirmed uses at those sites or claims of undiscovered art. The sources support the site or material description. Use images whose licenses allow modification, and retain their credits when sharing an enhancement.</p>
      </section>}
      {tab === "method" && <section className="method-page"><p className="eyebrow">THE TECHNIQUE</p><h1>A new view.<br /><em>The same pixels.</em></h1><div className="method-grid"><div><h2>Color carries clues.</h2><p>In many photographs, red, green and blue change together. Their shared brightness variation can hide much smaller differences in color. Decorrelation stretch separates those directions of variation, expands them, and maps the result back into RGB.</p><p>NASA’s <a href="https://spinoff.nasa.gov/Manipulating_Satellite_Photos_Now_Reveals_Ancient_Images" target="_blank" rel="noopener noreferrer">article about ancient images</a> describes the technique behind DStretch. This app implements its underlying principle independently, using regularized RGB covariance analysis. It does not reproduce DStretch’s custom color spaces.</p></div><div><h2>Make a useful comparison.</h2><ol><li>Open an original color photograph or a study example.</li><li>Adjust color separation gently. The amplification limit helps restrain weak signals.</li><li>Select a surface if unrelated colors dominate the full image.</li><li>Compare against the original and export a PNG with a separate processing record.</li></ol></div><div><h2>What the result means.</h2><p>The output is false color. It may clarify surviving pigment and faded outlines, and can also amplify lighting, surface staining and noise. Reconstructing original appearance requires separate evidence about pigments, conservation and missing areas. It does not identify pigments, date markings, see through walls or recover information absent from the original.</p><p>Grayscale images offer little independent color information. Engravings with no pigment may be better studied with controlled lighting or 3D methods.</p></div><div><h2>Your images stay with you.</h2><p>In the image lab, imported files are decoded and processed locally in a browser worker. Closing the tab clears the working image. The separate contribution form publishes a JPEG copy only after you choose to share it and agree to its public reuse license.</p><p>Previews are reduced for responsiveness. Exports apply the same fitted transform to every source pixel at its decoded native size, up to 64 MP and a 16,000-pixel edge, subject to browser memory. The record includes the file hash, matrix, sample region, settings and source credit.</p></div></div><details className="technical-details"><summary>The calculation and its limits</summary><p>For mean color mu and covariance C = V diag(lambda) V^T, the transform is A = V diag(gain) V^T, with gain = min(limit, strength / sqrt(max(lambda, 4))). Output color is A(x - mu) + (127.5, 127.5, 127.5), clipped and rounded to 8-bit RGB. A two-unit noise floor and the amplification limit regularize weak axes.</p><p>A nearest-neighbor grid with a longest edge of 720 pixels estimates the fitting colors. Nearly transparent pixels, deep shadows and near-clipped channels are excluded from fitting; the fitted transform is applied to the whole image. Display-limit statistics refer to retained fitting samples only. Browser decoding handles orientation and converts the working canvas to sRGB; results can differ slightly from other decoders or DStretch presets.</p><p><a href="https://www.dstretch.com/AlgorithmDescription.html" target="_blank" rel="noopener noreferrer">Read Jon Harman’s algorithm description</a> or <a href="/dcs-core.mjs" target="_blank" rel="noopener">inspect the app’s implementation</a>.</p></details></section>}
    </main>
    <footer className="app-footer"><span>Color Study <span className="footer-dot">/</span> Look a little closer.</span><div className="footer-links"><button className="text-button" onClick={() => switchTab("method")}>How it works</button><a href={NASA_ARTICLE} target="_blank" rel="noopener noreferrer">NASA article ↗</a><a href={REPOSITORY} target="_blank" rel="noopener noreferrer">Open source on GitHub ↗</a><a href={BUY_ME_A_COFFEE} target="_blank" rel="noopener noreferrer">Buy me a coffee ↗</a><button className="text-button" onClick={share}>Share the link ↗</button></div></footer>
  </div>;
}
