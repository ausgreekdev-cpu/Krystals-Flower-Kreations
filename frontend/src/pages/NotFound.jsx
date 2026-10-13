import { usePublicSettings } from '../lib/publicSettings';
import { Page } from '../components/ui/Page';
import Btn from '../components/ui/Btn';
import BloomMark from '../components/ui/BloomMark';

export default function NotFound(){
  const s = usePublicSettings();
  const email = s.contact_email || 'krystal@krystalsflowerkreations.com.au';
  return (
    <Page>
      <div className="p-12 text-center">
        <div className="text-bloom-500 flex justify-center"><BloomMark className="w-16 h-16" /></div>
        <h1 className="text-2xl md:text-3xl font-black text-ink mt-4">404 — Bloom not found</h1>
        <p className="text-muted mt-2">The page you wilted to doesn't exist. Try our everlasting bouquets instead.</p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Btn to="/" variant="primary" size="md">Home</Btn>
          <Btn to="/shop" variant="outline" size="md">Shop</Btn>
          <Btn to="/configurator" variant="outline" size="md">Configurator</Btn>
        </div>
        <p className="text-xs text-muted mt-6">If you followed a QR ticket, check the code or contact <a href={`mailto:${email}`} className="underline hover:text-highlight">{email}</a></p>
      </div>
    </Page>
  );
}
