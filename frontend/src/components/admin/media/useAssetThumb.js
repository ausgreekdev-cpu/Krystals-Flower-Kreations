import { useEffect, useState } from 'react';
import { adminApi } from '../../../lib/api/customClient';

// Auth'd thumbnail as an object URL. LIBRARY assets use their public variant
// URL directly (no auth needed); STAFF thumbs come through the authed blob
// fetch (img src can't carry a Bearer token).
export default function useAssetThumb(asset, token) {
  const publicThumb = asset?.variants?.webp?.['400'] || (asset?.visibility === 'LIBRARY' ? asset?.publicUrl : null);
  const [url, setUrl] = useState(publicThumb || null);

  useEffect(() => {
    if (publicThumb) { setUrl(publicThumb); return; }
    if (!asset?.id || !token) { setUrl(null); return; }
    let revoked = false;
    let objectUrl = null;
    adminApi.media.blob(asset.id, token, 'thumb')
      .then((b) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => { if (!revoked) setUrl(null); });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset?.id, asset?.thumbRef, publicThumb, token]);

  return url;
}
