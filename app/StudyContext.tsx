"use client";
/* eslint-disable @next/next/no-img-element -- These are local credited previews. */
import sources from '../public/sources.json';
import groups from '../public/object-groups.json';
import notesData from '../public/study-notes.json';
import referencesData from '../public/context-references.json';
import {studyHref} from './catalog-location.mjs';
import ReportPhoto from './ReportPhoto';
type Box = [number, number, number, number];
type Note = {title: string; text: string; box: Box};
type Reference = {id: string; study_ids: string[]; title: string; description: string; image?: string; image_source?: string; author?: string; license?: string; license_url?: string; source: string; kind: string};
// JSON imports infer number[]; the catalog validation verifies all four coordinates.
const notes = notesData as unknown as Record<string, Note[]>;
const references = referencesData as Reference[];

export default function StudyContext({id, onInspect}: {id: string; onInspect: (box: Box) => void}) {
  const group = groups.find(item => item.photo_ids.includes(id));
  return <div className="study-context">
    {!!notes[id]?.length && <section aria-label="Details to inspect"><h3>Look closer</h3><div className="study-note-grid">{notes[id].map((note, index) => <article key={note.title}><span className="detail-number">{index + 1}</span><h4>{note.title}</h4><p>{note.text}</p><button className="text-button" onClick={() => onInspect(note.box)}>Inspect this detail →</button></article>)}</div><p className="viewer-help">These are observation prompts. Color separation can also amplify stains, repairs and photographic noise.</p></section>}
    {references.filter(item => item.study_ids.includes(id)).map(reference => <section className="context-reference" key={reference.id}><p className="eyebrow">{reference.kind}</p><h3>{reference.title}</h3>{reference.image && <img src={'/' + reference.image} alt={reference.title} loading="lazy" />}<p>{reference.description}</p><a href={reference.source} target="_blank" rel="noopener noreferrer">Read the research and context ↗</a>{reference.author && <p className="context-credit">Image: <a href={reference.image_source} target="_blank" rel="noopener noreferrer">{reference.author}</a> · <a href={reference.license_url} target="_blank" rel="noopener noreferrer">{reference.license}</a></p>}</section>)}
    {group && <section className="related-studies"><p className="eyebrow">RELATED VIEWS / {group.scope}</p><h3>{group.title}</h3><p>{group.photo_ids.length} photographs or pages belong to this group. These are related views, not a count of distinct objects.</p><div>{group.photo_ids.filter(other => other !== id).map(other => {const photo = sources.find(item => item.id === other); return photo ? <a key={other} href={studyHref(other)}><img src={'/' + photo.thumbnail_file} alt="" loading="lazy" /><span>{photo.short_title}</span></a> : null;})}</div></section>}
    <ReportPhoto id={id} />
  </div>;
}
