import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import sources from '../../../public/sources.json';
import ColorStudy from '../../ColorStudy';

type Props = {params: Promise<{id: string}>};
export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {id} = await params, photo = sources.find(item => item.id === id);
  if (!photo) return {title: 'Study not found | Color Study', robots: {index: false}};
  const h = await headers(), host = h.get('host') || 'localhost:3000';
  const origin = `${/^(localhost|127\.0\.0\.1)/.test(host) ? 'http' : 'https'}://${host}`;
  const title = `${photo.short_title} | Color Study`, description = `${photo.object_date || 'Surviving color'}. ${photo.notes}`.slice(0, 280);
  const image = `${origin}/social/${photo.id}.jpg`;
  return {title, description, alternates: {canonical: `${origin}/study/${photo.id}`},
    openGraph: {title, description, type: 'website', url: `${origin}/study/${photo.id}`, images: [{url: image, width: 1200, height: 630, alt: `Photographic study of ${photo.title}. Any enhanced panel is labeled false color.`}]},
    twitter: {card: 'summary_large_image', title, description, images: [image]},
  };
}
export default async function Study({params}: Props) {
  const {id} = await params, photo = sources.find(item => item.id === id);
  if (!photo) notFound();
  const data = {'@context': 'https://schema.org', '@type': 'ImageObject', name: photo.title, description: photo.notes, creator: {'@type': 'Person', name: photo.author}, license: photo.license_url, creditText: photo.author, acquireLicensePage: photo.source_page};
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(data).replace(/</g, '\\u003c')}} /><ColorStudy initialStudyId={photo.id} /></>;
}
