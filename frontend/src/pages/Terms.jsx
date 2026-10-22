import { useEffect, useState } from 'react';
import { usePublicSettings } from '../lib/publicSettings';
import { Page, PageHeader, Breadcrumbs } from '../components/ui/Page';
import { Skeleton } from '../components/ui/State';
import { renderMarkdown } from '../lib/markdown';

export default function Terms(){
  const s = usePublicSettings();
  const contactEmail = s.contact_email || 'krystal@krystalsflowerkreations.com.au';
  const [html,setHtml]=useState(null);
  useEffect(()=>{
    fetch('/TERMS_OF_SERVICE.md').then(r=> r.ok? r.text() : null).then(t=>{
      if(t) setHtml(t);
      else setHtml(`Terms of Service not yet hosted at /terms. Contact ${contactEmail}.`);
    }).catch(()=> setHtml(`Terms of Service — contact ${contactEmail}`));
  }, []);
  return (
    <Page>
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Terms'}]} />} title="Terms of Service" lede={`Perth WA • Handmade made-to-order paper florals • Hosted at ${window.location.origin}/terms`} />
      {html === null
        ? <Skeleton className="mt-6 h-64" />
        : <div className="mt-6 bg-surface2 border rounded-2xl p-6 markdown-body" dangerouslySetInnerHTML={{__html: renderMarkdown(html)}} />}
      <p className="mt-6 text-sm text-muted">Last updated 22 October 2026 — Australian Consumer Law guarantees always apply. Questions or returns: {contactEmail}</p>
    </Page>
  );
}
