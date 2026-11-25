import { db, audit } from './db.js';
import { normalizePhone } from './format.js';
import { downloadBlob, choiceDialog } from './ui.jsx';
import { isNative, nativeShareBlob, whatsappApps, openExternal } from './native.js';

export function whatsappChatUrl(phone, text) {
  const n = normalizePhone(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text || '')}`;
}

export function shareCapability() {
  if (isNative()) return 'native';
  try {
    const f = new File([new Blob(['x'], { type: 'application/pdf' })], 'x.pdf', { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) return 'webshare';
  } catch (e) { /* ignore */ }
  return 'fallback';
}

async function record(docType, docId, method, result, phone) {
  await db.shares.add({ docType, docId, ts: Date.now(), method, result, phone: phone || '' });
  await audit('share', docType, docId, `${method}: ${result}`);
}

/**
 * Share a PDF. Returns { state, message } where state is one of:
 *  'shared'    – handed to the share sheet / WhatsApp (delivery cannot be confirmed by the platform)
 *  'cancelled' – user closed the share sheet
 *  'manual'    – file downloaded and WhatsApp chat opened; user must attach it
 *  'failed'
 */
export async function sharePdf({ blob, fileName, phone, message, docType, docId }) {
  const mode = shareCapability();
  try {
    if (mode === 'native') {
      let target = 'chooser';
      const apps = whatsappApps();
      if (phone && apps.length === 1) target = apps[0];
      else if (phone && apps.length > 1) {
        target = await choiceDialog('Which app should send this PDF?', [
          { value: 'whatsapp-business', label: 'WhatsApp Business', kind: 'wa' },
          { value: 'whatsapp', label: 'WhatsApp', kind: 'wa' },
          { value: 'chooser', label: 'Other apps…' }
        ], { title: 'Send PDF' });
        if (!target) return { state: 'cancelled', message: 'Sharing cancelled.' };
      }
      await nativeShareBlob(blob, fileName, message, { phone, target });
      await record(docType, docId, target === 'chooser' ? 'android-share' : target, target === 'chooser' ? 'share sheet opened' : 'WhatsApp opened to client chat', phone);
      return { state: 'shared', message: target === 'chooser' ? 'Share sheet opened. Confirm in WhatsApp that the PDF was sent.' : 'WhatsApp opened with the PDF — tap Send there.' };
    }
    if (mode === 'webshare') {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      await navigator.share({ files: [file], title: fileName, text: message });
      await record(docType, docId, 'web-share', 'handed to app', phone);
      return { state: 'shared', message: 'Handed to the app you picked. Confirm in WhatsApp that it was sent.' };
    }
    downloadBlob(blob, fileName);
    if (phone) openExternal(whatsappChatUrl(phone, message + '\n(PDF attached separately)'));
    await record(docType, docId, 'download+wa.me', phone ? 'downloaded, chat opened' : 'downloaded', phone);
    return { state: 'manual', message: phone ? 'PDF downloaded and WhatsApp chat opened — attach the PDF from Downloads.' : 'PDF downloaded.' };
  } catch (e) {
    if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || ''))) {
      await record(docType, docId, mode, 'cancelled', phone);
      return { state: 'cancelled', message: 'Sharing cancelled.' };
    }
    console.error(e);
    await record(docType, docId, mode, 'failed: ' + (e.message || e), phone);
    return { state: 'failed', message: 'Could not share: ' + (e.message || e) + '. Use Download instead.' };
  }
}

export async function savePdf({ blob, fileName, docType, docId }) {
  if (isNative()) {
    // Android: open the share sheet so the user can pick Files / Drive / Print.
    try { await nativeShareBlob(blob, fileName); } catch (e) { return null; }
    await record(docType, docId, 'save', 'share sheet (save/print)', '');
    return 'shared';
  }
  downloadBlob(blob, fileName);
  await record(docType, docId, 'download', 'downloaded', '');
  return null;
}
