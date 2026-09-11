"use client";

/* eslint-disable @next/next/no-img-element -- Credited, pre-sized photographic derivatives; no image proxy. */
import { useState, type CSSProperties } from "react";
import sources from "../public/sources.json";
import collections from "../public/collections.json";
import targets from "../public/targets.json";
import { NASA_ARTICLE, REPOSITORY, BUY_ME_A_COFFEE } from "./links";

const demonstrations = [
  {id: "commons-nefertari-68", label: "Egypt", place: "Tomb of Nefertari · Egypt", detail: "Beneath a sky of painted stars.", note: "Surviving figures, borders and a star-covered ceiling fill the tomb. Compare the worn passages with the strong colors; the photograph also reflects the surface’s conservation history."},
  {id: "met-247010", label: "Roman fresco", place: "Villa of P. Fannius Synistor · Boscoreale", detail: "A figure on a Roman wall.", note: "Painted plaster preserves a seated figure and surrounding color. Try fitting to a faded passage in the lab. False color also separates cracks, repairs and changes in lighting."},
  {id: "cma-294034", label: "Painted cotton", place: "Chavín-style textile · 800–500 BCE", detail: "A figure, held in the weave.", note: "A painted figure survives on ancient cotton. Compare its faint outlines with the weave and stains. The enhanced colors are a study of the photograph, not its original palette."},
  {id: "met-324017", label: "Persian painting", place: "Kuh-e Khwaja · Iran · 7th century", detail: "A face in a faded fragment.", note: "This Sasanian wall-painting fragment retains a face, clothing and a mouth covering. Inspect the surviving colors alongside the museum record; enhancement cannot recover missing plaster."},
  {id: "cueva-hands", label: "Hand stencils", place: "Cueva de las Manos, Argentina", detail: "Hands, layered in color.", note: "Overlapping stencils survive in red, white and ochre. Move the line to explore their color relationships."},
  {id: "marble-sphinx", label: "Painted marble", place: "Greek marble sphinx · The Met", detail: "Marble was a canvas, too.", note: "This sculpture retains documented traces of paint. Enhanced colors are a way to inspect the photograph, not a reconstruction of its ancient palette."},
];

const selections = [
  {id: "commons-nefertari-68", title: "A painted world inside a tomb.", place: "Tomb of Nefertari · Egypt", description: "Figures, hieroglyphs and a ceiling of stars. Start with a worn section and compare it with the surrounding paint."},
  {id: "met-247010", title: "A Roman room, in fragments.", place: "Boscoreale · Italy", description: "A seated figure from the Villa of P. Fannius Synistor. Follow the surviving contours through the faded plaster."},
  {id: "commons-ramesses-vi-chamber", title: "Color from wall to ceiling.", place: "Tomb of Ramesses VI · Egypt", description: "An expansive tomb interior, with dense painted details to explore at the photograph’s native resolution."},
  {id: "pompeii-mysteries", title: "Pompeii, in red.", place: "Villa of the Mysteries · Italy", description: "A sweeping painted scene, with vivid color and worn passages to compare."},
  {id: "met-324017", title: "The face that survives.", place: "Kuh-e Khwaja · Iran", description: "Faint Sasanian paint on a small plaster fragment. Fit the color study to the painted surface rather than the museum backdrop."},
  {id: "commons-scarlet-ware-6", title: "Figures around a vessel.", place: "Diyala Valley · Iraq", description: "Early Dynastic Scarlet Ware brings painted pottery into the study. Look for changes across the figures and geometric bands."},
  {id: "commons-faras-saint-anne", title: "A gesture on painted plaster.", place: "Faras · Sudan", description: "A Nubian wall painting of Saint Anne, with faded passages and exposed plaster surrounding the surviving face and hand."},
  {id: "iran-chehel-sotoun", title: "A story inside a story.", place: "Chehel Sotoun · Iran", description: "A historic palace mural framed by intricate ornament. Try the worn border; conservation and repainting matter here."},
  {id: "pompeii-vettii", title: "The figure that remains.", place: "House of the Vettii · Italy", description: "A weathered fresco offers a closer study of surviving paint, pale edges and exposed plaster."},
  {id: "commons-sigiriya", title: "Figures above the landscape.", place: "Sigiriya · Sri Lanka", description: "A close color view of surviving painted figures. Compare faint edges while keeping the original photograph beside the study."},
  {id: "commons-eland-panel", title: "Antelope across the rock.", place: "Eland Cave · South Africa", description: "San paintings layer animal forms across a worn surface. Separate the faint painted contours from cracks, shadows and mineral variation."},
  {id: "commons-bagan-dhammayazika", title: "A wall of small details.", place: "Dhammayazika · Bagan, Myanmar", description: "Faded painted ornament fills this temple wall. Work on a small, evenly lit area to compare its remaining color."},
  {id: "bhimbetka-paintings", title: "A wall full of life.", place: "Bhimbetka · India", description: "Small painted figures and layered marks fill this rock shelter. Follow the pigment across the surface."},
  {id: "unas-pyramid", title: "Words on a pyramid wall.", place: "Pyramid of Unas · Egypt", description: "Compare the already-visible inscriptions with the subtle color of the surrounding stone."},
  {id: "marble-sphinx", title: "Beyond white marble.", place: "Greek sculpture · The Met", description: "A winged sphinx with surviving paint: an invitation to look closely at sculpture, too."},
];

type Props = { onStudy: (id: string) => void; onLab: () => void; onCommunity: () => void; onGuide: () => void; onCollection: (id?: string) => void; onShare: () => void };

export default function Showcase({onStudy, onLab, onCommunity, onGuide, onCollection, onShare}: Props) {
  const [active, setActive] = useState(0);
  const [split, setSplit] = useState(50);
  const demo = demonstrations[active];
  const source = sources.find(item => item.id === demo.id)!;
  return <div className="showcase-page">
    <section className="showcase-hero" aria-labelledby="showcase-title">
      <div className="hero-copy">
        <p className="eyebrow">SURVIVING COLOR / A DIFFERENT WAY TO SEE</p>
        <h1 id="showcase-title">Look a little<br /><em>closer.</em></h1>
        <p className="hero-intro">Time fades the color.<br />A photograph can still hold its traces.</p>
        <p className="hero-description">Explore ancient textiles, cave paintings, worn murals and once-painted marble through color separation. Start with a remarkable photograph, or bring your own.</p>
        <div className="hero-actions"><button className="button" onClick={onLab}>Try the image lab <span aria-hidden="true">↗</span></button><button className="text-button" onClick={onCommunity}>Contribute a photograph</button></div>
        <a className="hero-origin" href={NASA_ARTICLE} target="_blank" rel="noopener noreferrer">Inspired by the original NASA Spinoff article <span aria-hidden="true">↗</span></a>
      </div>
      <figure className="hero-study">
        <div className="hero-study-top"><span className="eyebrow">A CLOSER LOOK</span><span>Drag to compare <span aria-hidden="true">↔</span></span></div>
        <div className={`hero-comparison ${["marble-sphinx", "cma-294034", "met-324017"].includes(demo.id) ? "sculpture-comparison" : ""}`} style={{"--split": `${split}%`} as CSSProperties}>
          <img src={`/showcase/${demo.id}-original.webp`} alt={`Original photograph: ${demo.place}`} width={1600} height={1000} fetchPriority="high" draggable={false} />
          <img className="hero-enhanced" src={`/showcase/${demo.id}-enhanced.webp`} alt={`RGB decorrelation stretch of the same ${demo.place} photograph`} width={1600} height={1000} draggable={false} />
          <span className="image-badge original-badge">Original</span><span className="image-badge enhanced-badge">Color study</span>
          <span className="divider" aria-hidden="true"><span className="divider-grip">‹ ›</span></span>
          <input className="hero-divider-input" type="range" min="0" max="100" step=".1" value={split} aria-label={`Compare original and enhanced ${demo.place} photograph`} aria-valuetext={`${Math.round(split)} percent original`} onChange={event => setSplit(Number(event.target.value))} />
        </div>
        <figcaption><div><p className="eyebrow">{demo.place}</p><h2>{demo.detail}</h2></div><button onClick={() => onStudy(demo.id)}>Explore this photo <span aria-hidden="true">↗</span></button></figcaption>
        <p className="hero-study-note">{demo.note}</p>
        <div className="demo-options" role="group" aria-label="Featured photographs">{demonstrations.map((item, index) => <button key={item.id} aria-pressed={active === index} className={active === index ? "selected" : ""} onClick={() => {setActive(index); setSplit(50);}}>{item.label}</button>)}</div>
        <p className="showcase-credit">Photo: {source.author} · <a href={source.source_page} target="_blank" rel="noopener noreferrer">Source</a> · <a href={source.license_url} target="_blank" rel="noopener noreferrer">{source.license}</a>. Color study: modified with RGB decorrelation stretch.</p>
      </figure>
    </section>
    <div className="showcase-principle"><span className="eyebrow">THE SAME PHOTOGRAPH. A DIFFERENT VIEW.</span><p>These are real photographs and mathematical color enhancements. The new colors make differences easier to see; they don’t tell us what the original palette looked like.</p></div>
    <section className="collection-discovery" aria-labelledby="collection-heading">
      <div className="section-heading"><div><p className="eyebrow">{sources.length} PHOTOGRAPHS / OPEN TO EXPLORE</p><h2 id="collection-heading">Follow the color.<br /><em>Choose a collection.</em></h2></div><p>Egyptian tombs and textiles. The painted rooms of Pompeii. Greek sculpture, Mesopotamian pottery and Persian wall paintings. Every photograph opens in the image lab.</p></div>
      <div className="collection-discovery-grid">{collections.map(collection => {
        const photo = sources.find(item => item.id === collection.cover)!;
        return <article className="collection-discovery-card" key={collection.id}><button onClick={() => onCollection(collection.id)}><img src={`/thumbnails/${photo.id}.jpg`} width={photo.expected_dimensions[0]} height={photo.expected_dimensions[1]} alt={photo.title} loading="lazy" /><span className="collection-card-copy"><span className="collection-card-title"><strong>{collection.label}</strong><span aria-hidden="true">↗</span></span><span className="collection-card-count">{collection.count} photographs</span><span className="collection-card-description">{collection.description}</span></span></button><p className="showcase-credit">Cover: {photo.author} · <a href={photo.source_page} target="_blank" rel="noopener noreferrer">Source</a> · <a href={photo.license_url} target="_blank" rel="noopener noreferrer">{photo.license}</a></p></article>;
      })}</div>
      <div className="textile-discovery-actions"><button className="button" onClick={() => onCollection()}>Explore the collection <span aria-hidden="true">→</span></button><a href="/photo-search.md">What we found, and where to look next ↗</a></div>
    </section>
    <section className="textile-discovery" aria-labelledby="textile-heading">
      <div className="section-heading"><div><p className="eyebrow">NEW IN THE OPEN COLLECTION</p><h2 id="textile-heading">Before color faded,<br /><em>it was woven in.</em></h2></div><p>Painted Andean cotton, Egyptian resist-dyed linen and patterned silk from Iran or Central Asia. Browse {sources.length} credited photographs, including {sources.filter(item => item.study_type === "textile").length} textiles.</p></div>
      <div className="textile-discovery-grid">{["cma-294034", "cma-128462", "cma-159371"].map(id => {const item = sources.find(source => source.id === id); return item && <button key={id} className="textile-discovery-card" onClick={() => onStudy(id)}><img src={`/thumbnails/${id}.jpg`} width={item.expected_dimensions[0]} height={item.expected_dimensions[1]} alt={item.title} loading="lazy" /><strong>{item.short_title} ↗</strong><span>{item.object_date} · {item.provider}<br />{item.license}</span></button>;})}</div>
      <div className="textile-discovery-actions"><button className="button" onClick={() => onCollection("textiles")}>Explore all textiles <span aria-hidden="true">→</span></button><a href="/api/catalog?collection=textiles&download=all">Download the textile catalog ↓</a></div>
    </section>
    <section className="selected-studies" aria-labelledby="selected-heading">
      <div className="section-heading"><div><p className="eyebrow">SELECTED PHOTOGRAPHS</p><h2 id="selected-heading">Paint that still has<br /><em>something to say.</em></h2></div><p>From a palace in Iran to the interiors of Pompeii. Every image includes its original source, photographer’s credit and reuse license.</p></div>
      <div className="showcase-grid">{selections.map((item, index) => {
        const photo = sources.find(source => source.id === item.id)!;
        return <article className={`showcase-card ${["marble-sphinx", "met-324017", "commons-scarlet-ware-6"].includes(item.id) ? "sculpture-card" : ""}`} key={item.id}>
          <button className="showcase-photo-link" onClick={() => onStudy(item.id)} aria-label={`Open ${item.place} in the image lab`}><img src={`/showcase/${item.id}-original.webp`} width={photo.expected_dimensions[0]} height={photo.expected_dimensions[1]} alt={photo.title} loading="lazy" /><span className="photo-open" aria-hidden="true">↗</span><span className="photo-size">{(photo.expected_dimensions[0] * photo.expected_dimensions[1] / 1000000).toFixed(1)} MP original</span></button>
          <div className="showcase-card-copy"><p className="eyebrow"><span>{String(index + 1).padStart(2, "0")}</span> {item.place}</p><h3>{item.title}</h3><p>{item.description}</p><button className="study-open-link" onClick={() => onStudy(item.id)}>Open in the image lab <span aria-hidden="true">→</span></button><p className="showcase-credit">{photo.author} · <a href={photo.source_page} target="_blank" rel="noopener noreferrer">Source</a> · <a href={photo.license_url} target="_blank" rel="noopener noreferrer">{photo.license}</a></p></div>
        </article>;
      })}</div>
      <button className="guide-invitation" onClick={onGuide}><span><strong>Where else could we look?</strong> Explore the {targets.length}-target field guide, from Angkor Wat to painted cliff dwellings.</span><span aria-hidden="true">→</span></button>
    </section>
    <section className="origins-grid" aria-label="The original article and open source files">
      <article><p className="eyebrow">THE ORIGINAL STORY</p><h2>From satellites<br /><em>to surviving paint.</em></h2><p>NASA Spinoff tells how decorrelation stretch moved from satellite imagery into archaeology, including the faded paintings of Angkor Wat. That story inspired this independent image lab.</p><a href={NASA_ARTICLE} target="_blank" rel="noopener noreferrer">Read the original NASA article <span aria-hidden="true">↗</span></a></article>
      <article><p className="eyebrow">OPEN SOURCE / OPEN EXPLORATION</p><h2>The files.<br /><em>Yours to explore.</em></h2><p>The engine, website, Python processor and research guide are on GitHub. Download the photographs, inspect how the color changes, or build something of your own.</p><a href={REPOSITORY} target="_blank" rel="noopener noreferrer">Browse the GitHub repository <span aria-hidden="true">↗</span></a><a className="dataset-link" href="/api/dataset?download=all">Download the photo database <span aria-hidden="true">↓</span></a></article>
    </section>
    <section className="share-invitation"><div><p className="eyebrow">A SHARED COLLECTION. A SHARED CURIOSITY.</p><h2>Bring a photograph.<br /><em>Pass it on.</em></h2><p>Have a photograph of a textile or surviving paint? Add it to the open collection with your credit. Know someone who would enjoy looking closer? Send them the link.</p></div><div className="invitation-actions"><button className="button" onClick={onCommunity}>Add your photograph <span aria-hidden="true">+</span></button><button className="button ghost" onClick={onShare}>Share Color Study <span aria-hidden="true">↗</span></button><a className="button ghost" href={BUY_ME_A_COFFEE} target="_blank" rel="noopener noreferrer">Buy me a coffee <span aria-hidden="true">↗</span></a></div></section>
  </div>;
}
