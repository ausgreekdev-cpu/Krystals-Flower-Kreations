// Loads the PayPal JS SDK on demand (one script tag, cached per client id).
// The client id comes from the public `paypal_client_id` setting; the secret
// never reaches the browser.
let loading = null;

export function loadPayPalScript(clientId, currency = 'AUD') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('PayPal SDK can only load in a browser'));
  }
  if (window.paypal?.Buttons) return Promise.resolve(window.paypal);
  const url = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}`;
  if (loading && loading.url === url) return loading.promise;
  // Different client id (e.g. settings saved between attempts) — drop old tag.
  const stale = [...document.querySelectorAll('script[src*="paypal.com/sdk/js"]')];
  for (const el of stale) el.remove();
  delete window.paypal;
  loading = null;

  const script = document.createElement('script');
  script.src = url;
  script.async = true;
  const promise = new Promise((resolve, reject) => {
    script.onload = () => {
      if (window.paypal?.Buttons) resolve(window.paypal);
      else reject(new Error('PayPal SDK loaded without Buttons'));
    };
    script.onerror = () => { loading = null; reject(new Error('Could not load the PayPal SDK — check your network')); };
    document.head.appendChild(script);
  });
  loading = { url, promise };
  return promise;
}
