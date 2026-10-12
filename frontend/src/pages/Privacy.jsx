import { useEffect, useState } from 'react';
import { usePublicSettings } from '../lib/publicSettings';
import { Page, PageHeader, Breadcrumbs } from '../components/ui/Page';
import { Skeleton } from '../components/ui/State';
import { renderMarkdown } from '../lib/markdown';

export default function Privacy(){
  const s = usePublicSettings();
  const contactEmail = s.contact_email || 'krystal@krystalsflowerkreations.com.au';
  const [html,setHtml]=useState(null);
  useEffect(()=>{
    fetch('/PRIVACY_POLICY.md').then(r=> r.ok? r.text() : fetch('/privacy-policy.md').then(r2=> r2.ok? r2.text() : null)).then(t=>{
      if(t) setHtml(t);
      else fetch('/docs/PRIVACY_POLICY.md').then(r=> r.ok? r.text(): `Privacy policy not yet hosted at /privacy. Contact ${contactEmail}.`).then(setHtml).catch(()=> setHtml(`Privacy policy — contact ${contactEmail}`));
    }).catch(()=> setHtml(`Privacy policy — contact ${contactEmail}`));
  }, []);
  return (
    <Page>
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Privacy'}]} />} title="Privacy Policy" lede={`Perth WA • ABN on invoice • Hosted at ${window.location.origin}/privacy`} />
      {html === null
        ? <Skeleton className="mt-6 h-64" />
        : <div className="mt-6 bg-surface2 border rounded-2xl p-6 markdown-body" dangerouslySetInnerHTML={{__html: renderMarkdown(html)}} />}
      <p className="mt-6 text-sm text-muted">Last updated 29 August 2026 — For Play Store Data Safety: collected email/name/address/purchase history, encrypted in transit, not shared, deletion via {contactEmail} or app Settings → Delete account.</p>
    </Page>
  );
}
