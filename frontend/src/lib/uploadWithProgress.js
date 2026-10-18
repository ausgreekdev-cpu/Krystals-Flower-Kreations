// Multipart upload with real progress events (fetch can't report upload
// progress — XHR is still the only standards-based way). Returns the parsed
// JSON body; rejects with the API's error message on failure.
export function uploadWithProgress({ url, file, fields = {}, token, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve(body);
      } else {
        const err = new Error(body?.error || `Upload failed (${xhr.status})`);
        err.code = body?.code;
        err.status = xhr.status;
        err.body = body; // e.g. the duplicate payload on 409
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed — network error'));
    const fd = new FormData();
    fd.append('file', file, file.name);
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null || v === '') continue;
      fd.append(k, String(v));
    }
    xhr.send(fd);
  });
}
