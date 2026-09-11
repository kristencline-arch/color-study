"use client";

/* eslint-disable @next/next/no-img-element -- Local previews and pre-sized contributor thumbnails must not use an image proxy. */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CONTRIBUTION_LICENSE, REPOSITORY } from "./links";

export type CommunityPhoto = {id: string; created_at: string; title: string; location: string; author: string; description: string; width: number; height: number; sha256: string; image_url: string; thumbnail_url: string; license: string; license_url: string};
type Page = {photos: CommunityPhoto[]; total: number; next_cursor: string | null};
type Receipt = {id: string; removal_key: string};

const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "Please try again.";
async function responseJSON(response: Response) {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "The request could not be completed.");
  return value;
}

async function preparePhoto(file: File) {
  if (file.size > 40 * 1024 * 1024) throw new Error("Choose a photograph under 40 MB.");
  const bitmap = await createImageBitmap(file, {imageOrientation: "from-image"});
  const canvas = document.createElement("canvas"), thumbnail = document.createElement("canvas");
  try {
    if (bitmap.width < 320 || bitmap.height < 320 || bitmap.width > 16000 || bitmap.height > 16000 || bitmap.width * bitmap.height > 64000000) throw new Error("Choose a photo from 320 pixels per side up to 64 MP, with no edge over 16,000 pixels.");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", {alpha: false, colorSpace: "srgb"});
    if (!context) throw new Error("This browser could not prepare the photograph.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0);
    const scale = Math.min(1, 700 / Math.max(bitmap.width, bitmap.height));
    thumbnail.width = Math.round(bitmap.width * scale); thumbnail.height = Math.round(bitmap.height * scale);
    const thumbContext = thumbnail.getContext("2d", {alpha: false, colorSpace: "srgb"});
    if (!thumbContext) throw new Error("This browser could not prepare the thumbnail.");
    thumbContext.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
    const encode = (image: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => image.toBlob(blob => blob ? resolve(blob) : reject(new Error("The photograph could not be encoded.")), "image/jpeg", quality));
    const photo = await encode(canvas, .9), thumb = await encode(thumbnail, .8);
    if (photo.size > 12 * 1024 * 1024) throw new Error("The prepared JPEG is over 12 MB. Please reduce the photo dimensions and try again.");
    return {photo, thumbnail: thumb};
  } finally { bitmap.close(); canvas.width = canvas.height = thumbnail.width = thumbnail.height = 1; }
}

export default function Community({onPhoto, onShare}: {onPhoto: (photo: CommunityPhoto) => void; onShare: () => void}) {
  const [page, setPage] = useState<Page>({photos: [], total: 0, next_cursor: null});
  const [loading, setLoading] = useState(true);
  const [collectionError, setCollectionError] = useState("");
  const [selected, setSelected] = useState<{file: File; preview: string} | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState("");
  const [formError, setFormError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removalStatus, setRemovalStatus] = useState("");
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async (cursor?: string) => {
    const current = ++sequence.current;
    controller.current?.abort(); controller.current = new AbortController();
    setLoading(true); setCollectionError("");
    try {
      const result: Page = await responseJSON(await fetch(`/api/community${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {signal: controller.current.signal}));
      if (current === sequence.current) setPage(old => ({...result, photos: cursor ? [...old.photos, ...result.photos.filter(photo => !old.photos.some(existing => existing.id === photo.id))] : result.photos}));
    } catch (error) { if (current === sequence.current) setCollectionError(errorText(error)); }
    finally { if (current === sequence.current) setLoading(false); }
  }, []);

  const stopRequests = useCallback(() => {sequence.current++; controller.current?.abort();}, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => {clearTimeout(timer); stopRequests();};
  }, [refresh, stopRequests]);
  useEffect(() => () => {if (selected) URL.revokeObjectURL(selected.preview);}, [selected]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || publishing) return;
    const form = event.currentTarget, data = new FormData(form);
    data.delete("file"); // Only the prepared JPEG copy and thumbnail are uploaded.
    setPublishing(true); setFormError(""); setStatus("Preparing a JPEG copy and removing camera metadata…");
    try {
      const prepared = await preparePhoto(selected.file);
      data.set("photo", prepared.photo, "photograph.jpg"); data.set("thumbnail", prepared.thumbnail, "thumbnail.jpg");
      setStatus("Publishing your photograph to the open collection…");
      const result = await responseJSON(await fetch("/api/community", {method: "POST", body: data}));
      setReceipt({id: result.photo.id, removal_key: result.removal_key});
      setSelected(null); form.reset(); setStatus("Your photograph is public. Thank you for adding to the collection.");
      await refresh();
    } catch (reason) { setStatus(""); setFormError(errorText(reason)); }
    finally { setPublishing(false); }
  }

  function saveReceipt() {
    if (!receipt) return;
    const blob = new Blob([JSON.stringify(receipt, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = `color-study-removal-key-${receipt.id}.json`; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setRemoving(true); setRemovalStatus("");
    try {
      const content = new FormData(form).get("receipt");
      if (typeof content !== "string" || content.length > 500) throw new Error("Paste your removal-key file contents.");
      let value; try {value = JSON.parse(content);} catch {throw new Error("Paste the full JSON contents of your removal-key file.");}
      await responseJSON(await fetch("/api/community/remove", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(value)}));
      setRemovalStatus("Your photograph has been removed from this public collection."); form.reset(); await refresh();
    } catch (error) { setRemovalStatus(errorText(error)); }
    finally {setRemoving(false);}
  }

  return <section className="community-page">
    <div className="community-heading"><div><p className="eyebrow">THE OPEN PHOTO COLLECTION</p><h1>One more photo.<br /><em>One more way to see.</em></h1><p>Contribute your own photographs of painted surfaces: faded murals, cave art, painted plaster or traces of color on sculpture. Everyone can browse, download and experiment.</p></div><div className="community-heading-actions"><a className="button ghost" href="/api/dataset?download=all">Download the database <span aria-hidden="true">↓</span></a><button className="text-button" onClick={onShare}>Invite someone to contribute ↗</button></div></div>
    <div className="contribution-layout">
      <div className="contribution-note"><p className="eyebrow">ADD A PHOTOGRAPH</p><h2>Give surviving<br /><em>color a closer look.</em></h2><p>Share a color photograph you took, with enough context for someone else to study it. An unenhanced original is the most useful starting point.</p><ol><li>Choose your photograph.</li><li>Add your credit and a general location.</li><li>Agree to the license and publish.</li></ol><p className="contribution-fineprint">Submissions appear immediately. A full-size JPEG copy is published, with camera metadata removed. This does not remove visible people or identifying details in the picture.</p><p className="contribution-fineprint">Prefer a private experiment? The image lab keeps imported photos in your browser. Only this contribution form publishes them.</p></div>
      <form className="contribution-form" onSubmit={publish}>
        <fieldset disabled={publishing}>
          <label className={`photo-upload ${selected ? "has-photo" : ""}`}><input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif" required aria-label="Choose your contribution photograph" onChange={event => {const file = event.target.files?.[0]; setSelected(file ? {file, preview: URL.createObjectURL(file)} : null); setFormError("");}} />{selected ? <><img src={selected.preview} alt="Your photograph, ready for contribution" /><span>Change photograph</span></> : <><strong>+ Choose a photograph</strong><span>JPEG, PNG, WebP or AVIF · up to 40 MB<br />The published JPEG copy must be under 12 MB.</span></>}</label>
          <div className="form-pair"><label>Photo title<input name="title" required maxLength={120} placeholder="A painted wall, a surviving detail…" /></label><label>Your photographer credit<input name="author" required maxLength={100} autoComplete="nickname" placeholder="Name or public credit" /></label></div>
          <label>Place or region<input name="location" required maxLength={120} placeholder="A general location is enough; no coordinates needed" /></label>
          <label>What should someone look for? <span className="optional">Optional</span><textarea name="description" maxLength={1200} rows={3} placeholder="Describe the painted surface, lighting or any known conservation work." /></label>
          <label className="form-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <label className="license-consent"><input type="checkbox" name="consent" value="cc-by-4.0-v1" required /><span>I took this photograph and have the right to publish it and its description under <a href={CONTRIBUTION_LICENSE} target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. I understand that anyone may download, modify and reuse them, including commercially, with credit.</span></label>
          <p className="publication-note">The photo, title, location, description and credit will be public. License permissions already granted cannot be withdrawn from people who follow the terms.</p>
          <button className="button publish-photo" type="submit" disabled={!selected || publishing}>{publishing ? "Publishing…" : "Publish to the open collection"}<span aria-hidden="true">↗</span></button>
        </fieldset>
        {status && <p className="contribution-status" role="status">{status}</p>}{formError && <p className="contribution-error" role="alert">{formError}</p>}
        {receipt && <div className="removal-receipt"><strong>Keep your private removal key.</strong><p>It lets you remove this site’s public copy later. Downloaded copies and their reuse rights are unaffected. No account or email is collected.</p><button className="button ghost" type="button" onClick={saveReceipt}>Save private removal key ↓</button></div>}
      </form>
    </div>
    <section className="community-collection" aria-labelledby="community-collection-title"><div className="section-heading"><div><p className="eyebrow">CONTRIBUTED BY THE COMMUNITY</p><h2 id="community-collection-title">A collection<br /><em>we can grow together.</em></h2></div>{!loading && !collectionError && <p>{page.total} {page.total === 1 ? "photograph" : "photographs"} contributed · CC BY 4.0<br />Descriptions and credits are supplied by contributors.</p>}</div>
      {collectionError ? <div className="community-empty" role="alert"><p>{collectionError}</p><button className="button ghost" onClick={() => void refresh()}>Try again</button></div> : !page.photos.length ? <div className="community-empty"><p>{loading ? "Opening the collection…" : "The next photograph could be yours."}</p>{!loading && <span>The curated studies are ready in the image lab. Be the first to add a community photograph.</span>}</div> : <div className="community-grid">{page.photos.map(photo => <article key={photo.id} className="community-card"><button className="community-image" onClick={() => onPhoto(photo)} aria-label={`Study ${photo.title}`}><img src={photo.thumbnail_url} alt={photo.title} loading="lazy" width={700} height={500} /></button><div className="community-card-copy"><p className="eyebrow">{photo.location}</p><h3>{photo.title}</h3><p>{photo.description}</p><p className="community-byline">Photo: {photo.author} · <a href={photo.license_url} target="_blank" rel="noopener noreferrer">{photo.license}</a><br />{photo.width.toLocaleString()} × {photo.height.toLocaleString()} pixels</p><div className="community-photo-actions"><button onClick={() => onPhoto(photo)}>Study photo →</button><a href={`${photo.image_url}?download=1`}>Download ↓</a><a href={`${REPOSITORY}/issues/new?title=${encodeURIComponent(`Photo report: ${photo.id}`)}&body=${encodeURIComponent(`Photo: ${photo.image_url}\n\nPlease describe the concern (rights, attribution, content or location privacy):\n`)}`} target="_blank" rel="noopener noreferrer">Report</a></div></div></article>)}</div>}
      {page.next_cursor && <button className="button ghost load-more" disabled={loading} onClick={() => void refresh(page.next_cursor!)}>{loading ? "Loading…" : "More photographs ↓"}</button>}
    </section>
    <details className="remove-contribution"><summary>Remove a photograph you contributed</summary><p>Paste the contents of the private removal-key file you saved when publishing. Removal affects this site’s collection, not copies others already downloaded. To report someone else’s photo, use its Report link, which opens a GitHub issue.</p><form onSubmit={remove}><label className="sr-only" htmlFor="removal-receipt">Your removal-key JSON</label><textarea id="removal-receipt" name="receipt" maxLength={500} rows={4} required placeholder='Paste your removal-key file contents here' /><button className="button ghost" disabled={removing}>{removing ? "Removing…" : "Remove my photograph"}</button></form>{removalStatus && <p role="status">{removalStatus}</p>}</details>
  </section>;
}
