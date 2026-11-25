// Android bridges. Two native shells are supported:
//  1. The standalone APK (WebView + window.AndroidBridge, see android-shell/)
//  2. A Capacitor build (see .github/workflows/android-apk.yml)
// In a normal browser none of this is used.
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

const bridge = () => (typeof window !== 'undefined' ? window.AndroidBridge : undefined);
export const isNative = () => !!bridge() || Capacitor.isNativePlatform();

async function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

const mimeOf = (name, blob) => blob.type || (name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.csv') ? 'text/csv' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream');

/** Installed WhatsApp apps on the device: ['whatsapp', 'whatsapp-business'] (APK only). */
export function whatsappApps() {
  try { return JSON.parse(bridge()?.whatsappApps() || '[]'); } catch (e) { return []; }
}

/**
 * Write a file and open sharing. target: 'chooser' | 'whatsapp' | 'whatsapp-business'.
 * With a WhatsApp target and a phone number, the APK opens that client's chat directly.
 * Resolves when the share screen opened (delivery can't be confirmed by Android).
 */
export async function nativeShareBlob(blob, fileName, text = '', { phone = '', target = 'chooser' } = {}) {
  const b = bridge();
  if (b) {
    const r = b.shareFile(await blobToBase64(blob), fileName, mimeOf(fileName, blob), text || '', phone || '', target);
    if (r !== 'ok') throw new Error(String(r).replace(/^error:/, ''));
    return 'ok';
  }
  const data = await blobToBase64(blob);
  const w = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  await Share.share({ title: fileName, text, files: [w.uri], dialogTitle: 'Share ' + fileName });
  return w.uri;
}

export function openExternal(url) {
  const b = bridge();
  if (b) b.openUrl(url);
  else window.open(url, '_blank');
}
