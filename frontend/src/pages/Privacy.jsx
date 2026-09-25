import { useEffect, useState } from 'react';
import { usePublicSettings } from '../lib/publicSettings';

export default function Privacy(){
  const s = usePublicSettings();
  const contactEmail = s.contact_email || 'krystal@krystalsflowerkreations.com.au';
  const [html,setHtml]=useState('Loading privacy policy…');
  useEffect(()=>{
    fetch('/PRIVACY_POLICY.md').then(r=> r.ok? r.text() : fetch('/privacy-policy.md').then(r2=> r2.ok? r2.text() : null)).then(t=>{
      if(t) setHtml(t);
      else fetch('/docs/PRIVACY_POLICY.md').then(r=> r.ok? r.text(): 'Privacy policy not yet hosted at /privacy. See docs/PRIVACY_POLICY.md in repo.').then(setHtml).catch(()=> setHtml(`Privacy policy — contact ${contactEmail}`));
    }).catch(()=> setHtml(`Privacy policy — contact ${contactEmail}`));
  }, []);
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-black text-ink">Privacy Policy</h1>
      <p className="text-xs text-muted mt-1">Perth WA • ABN on invoice • Hosted at https://krystalsflowerkreations.netlify.app/privacy and https://krystalsflowerkreations.com.au/privacy</p>
      <div className="mt-6 bg-surface2 border rounded-2xl p-6 prose prose-sm max-w-none whitespace-pre-wrap text-sm text-ink">{html}</div>
      <div className="mt-6 text-xs text-muted">Last updated 29 August 2026 — For Play Store Data Safety: collected email/name/address/purchase history, encrypted in transit, not shared, deletion via {contactEmail} or app Settings → Delete account.</div>
    </div>
  );
}
