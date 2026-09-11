"use client";

/* eslint-disable @next/next/no-img-element -- Local credited museum thumbnails, with original files linked separately. */
import {useEffect, useState} from "react";
import {REPOSITORY} from "./links";

type CatalogPhoto = {
  id: string; title: string; short_title: string; category: string; region: string; provider: string;
  material: string; culture?: string; location: string; object_date: string; author: string;
  source_page: string; license: string; license_url: string; notes: string;
  image_url: string; thumbnail_url: string; expected_dimensions: number[];
  accession_number?: string; credit_line?: string; master_url?: string;
  master_dimensions?: number[]; master_format?: string; master_size_bytes?: number;
};
type CatalogPage = {
  photos: CatalogPhoto[]; total: number; collection_total: number; page: number; pages: number;
  filters: Record<"category" | "region" | "provider", {value: string; count: number}[]>;
};

export default function Catalog({onStudy, onContribute}: {onStudy: (id: string) => void; onContribute: () => void}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [provider, setProvider] = useState("");
  const [before, setBefore] = useState("");
  const [sort, setSort] = useState("featured");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{key: string; data?: CatalogPage; error?: string} | null>(null);
  const [facets, setFacets] = useState<CatalogPage["filters"] | null>(null);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({q: query.trim(), category, region, provider, before, sort})) if (value) params.set(key, value);
  const downloadURL = `/api/catalog?${params}&download=all`;
  params.set("page", String(page));
  const requestKey = params.toString(), key = `${requestKey}:${retry}`;
  const current = result?.key === key ? result : null;
  const loading = !current;
  const data = current?.data;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog?${requestKey}`, {signal: controller.signal});
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || "The collection could not be loaded.");
        if (!controller.signal.aborted) {setResult({key, data: value}); setFacets(value.filters);}
      } catch (error) {
        if (!controller.signal.aborted) setResult({key, error: error instanceof Error ? error.message : "The collection could not be loaded."});
      }
    }, 220);
    return () => {clearTimeout(timer); controller.abort();};
  }, [key, requestKey]);

  function clear() {setQuery(""); setCategory(""); setRegion(""); setProvider(""); setBefore(""); setSort("featured"); setPage(1);}
  const filtered = !!(query || category || region || provider || before);
  return <section className="catalog-page" aria-labelledby="catalog-title">
    <div className="catalog-heading"><div><p className="eyebrow">THE OPEN COLLECTION / PAINT, DYE &amp; TIME</p><h1 id="catalog-title">Color, carried<br /><em>through centuries.</em></h1><p>Painted cotton. Woven silk. A figure on worn plaster. Explore textiles and ancient art through photographs you can study, download and reuse.</p></div><div className="catalog-heading-aside"><p>Every photograph has a source and a license. Museum dates describe the object; the photograph shows its surviving condition.</p><a className="button ghost" href="/api/dataset?download=all">Download the full database ↓</a><a className="catalog-files" href={`${REPOSITORY}/tree/main/public/originals`} target="_blank" rel="noopener noreferrer">Image files on GitHub ↗</a></div></div>
    <div className="catalog-search"><label><span className="sr-only">Search the collection</span><input type="search" maxLength={120} placeholder="Search cotton, Iran, a museum, a motif…" value={query} onChange={event => {setQuery(event.target.value); setPage(1);}} /></label><button className="text-button" onClick={clear} disabled={!filtered && sort === "featured"}>Clear filters</button></div>
    <div className="catalog-filters">
      {([
        ["category", "Material / object", category, setCategory],
        ["region", "Region", region, setRegion],
        ["provider", "Image collection", provider, setProvider],
      ] as const).map(([field, label, value, setter]) => <label key={field}>{label}<select value={value} onChange={event => {setter(event.target.value); setPage(1);}}><option value="">All {field === "category" ? "materials" : field === "region" ? "regions" : "collections"}</option>{facets?.[field].map(item => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select></label>)}
      <label>Object date<select value={before} onChange={event => {setBefore(event.target.value); setPage(1);}}><option value="">All dates</option><option value="500">Before 500 CE</option><option value="1000">Before 1000 CE</option><option value="1500">Before 1500 CE</option></select></label>
      <label>Sort<select value={sort} onChange={event => {setSort(event.target.value); setPage(1);}}><option value="featured">Selected first</option><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
    </div>
    <div className="catalog-result-line"><p role="status">{loading ? "Opening the collection…" : data ? `${data.total} ${data.total === 1 ? "photograph" : "photographs"}${filtered ? ` from ${data.collection_total} in the collection` : " in the collection"}` : "Collection unavailable"}</p><a href={downloadURL}>Export these records ↓</a></div>
    {before && <p className="catalog-date-note">Date filters use the latest year in the museum’s estimated range. Records without an object date are excluded.</p>}
    <div aria-busy={loading}>
      {current?.error && <div className="catalog-empty" role="alert"><p>{current.error}</p><button className="button ghost" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
      {loading && <div className="catalog-loading"><span className="spinner" aria-hidden="true" /><p>Finding photographs and their source records.</p></div>}
      {data && !data.photos.length && <div className="catalog-empty"><h2>No photographs match yet.</h2><p>Try a broader material or region, or clear the date filter.</p><button className="button ghost" onClick={clear}>Show the whole collection</button></div>}
      {data && data.photos.length > 0 && <div className="catalog-grid">{data.photos.map(photo => <article className="catalog-card" key={photo.id}>
        <button className="catalog-image" onClick={() => onStudy(photo.id)} aria-label={`Study ${photo.title}`}><img src={photo.thumbnail_url} alt={photo.title} width={photo.expected_dimensions[0]} height={photo.expected_dimensions[1]} loading="lazy" /><span className="catalog-open" aria-hidden="true">↗</span></button>
        <div className="catalog-card-copy"><p className="eyebrow">{photo.category} / {photo.region}</p><h2>{photo.short_title}</h2><p className="catalog-date">{photo.object_date === "Not recorded" ? "Object date not recorded" : photo.object_date}</p><p className="catalog-material">{photo.material}</p>
          <div className="catalog-card-actions"><button onClick={() => onStudy(photo.id)}>Study photo →</button><a href={photo.image_url} download>JPEG ↓</a></div>
          <p className="catalog-credit">{photo.provider}<br />{photo.expected_dimensions[0].toLocaleString()} × {photo.expected_dimensions[1].toLocaleString()} px · <a href={photo.license_url} target="_blank" rel="noopener noreferrer">{photo.license}</a></p>
          <details><summary>Source, context &amp; larger files</summary><p><strong>{photo.title}</strong></p><p>{photo.culture && photo.culture !== "Not recorded" ? `${photo.culture}. ` : ""}{photo.location}</p><p>{photo.notes}</p><p>Image credit: {photo.author}{photo.accession_number ? `. Accession ${photo.accession_number}` : ""}.{photo.credit_line ? ` ${photo.credit_line}.` : ""}</p><a href={photo.source_page} target="_blank" rel="noopener noreferrer">View the original source ↗</a>{photo.master_url && <p><a href={photo.master_url} target="_blank" rel="noopener noreferrer">Museum master · {photo.master_format} ↗</a><br />{photo.master_dimensions?.map(value => value.toLocaleString()).join(" × ")} px{photo.master_size_bytes ? ` · ${(photo.master_size_bytes / 1000000).toFixed(0)} MB` : ""}. This file may be larger than the lab can open.</p>}<p><a href={`${REPOSITORY}/issues/new?title=${encodeURIComponent(`Catalog correction: ${photo.id}`)}&body=${encodeURIComponent(`Record: ${photo.source_page}\n\nPlease describe the correction or rights concern:\n`)}`} target="_blank" rel="noopener noreferrer">Report a record or image</a></p></details>
        </div>
      </article>)}</div>}
    </div>
    {data && data.pages > 1 && <nav className="catalog-pagination" aria-label="Collection pages"><button className="button ghost" disabled={page === 1} onClick={() => setPage(value => value - 1)}>← Previous</button><span>Page {page} of {data.pages}</span><button className="button ghost" disabled={page >= data.pages} onClick={() => setPage(value => value + 1)}>Next →</button></nav>}
    <div className="catalog-bottom"><p>Enhancements make existing color differences easier to inspect. They cannot recover an original palette, identify a pigment or establish why a surface faded. The collection includes ancient and later historic works, each with its own date.</p><button className="text-button" onClick={onContribute}>Add your own textile or painted surface →</button></div>
  </section>;
}
