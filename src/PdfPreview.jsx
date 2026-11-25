import { useEffect, useRef, useState } from 'preact/hooks';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Modal, Btn, toast, confirmDialog } from './ui.jsx';
import { sharePdf, savePdf, whatsappChatUrl, shareCapability } from './share.js';
import { isNative, whatsappApps } from './native.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Preview a generated PDF, then save / print / share.
 * props: { build: async () => jsPDF, fileName, phone, message, docType, docId, title, onShared(state) }
 */
export function PdfPreview({ build, fileName, phone, message, docType, docId, title, onClose, onShared }) {
  const [blob, setBlob] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready to share');
  const holder = useRef();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const doc = await build();
        const b = doc.output('blob');
        if (!alive) return;
        setBlob(b);
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await b.arrayBuffer()) }).promise;
        const el = holder.current;
        if (!el) return;
        el.innerHTML = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: Math.min(2, (window.devicePixelRatio || 1) * 1.3) });
          const c = document.createElement('canvas');
          c.width = vp.width; c.height = vp.height;
          el.appendChild(c);
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
        }
      } catch (e) { console.error(e); setErr(String(e.message || e)); }
    })();
    return () => { alive = false; };
  }, []);

  const doShare = async () => {
    if (!blob) return;
    setBusy(true);
    const r = await sharePdf({ blob, fileName, phone, message, docType, docId });
    setBusy(false);
    setStatus(r.state === 'shared' ? 'Opened in share sheet — not confirmed as sent' : r.state === 'manual' ? 'Downloaded — attach in WhatsApp' : r.state === 'cancelled' ? 'Ready to share' : 'Share failed');
    toast(r.message, r.state === 'failed' ? 'error' : '');
    if ((r.state === 'shared' || r.state === 'manual') && onShared) {
      const yes = await confirmDialog('Did the PDF reach the client on WhatsApp?\nOnly choose Yes if you saw it sent.', { title: 'Mark as sent?', ok: 'Yes, it was sent' });
      if (yes) { setStatus('Sent (confirmed by you)'); onShared('sent'); }
    }
  };
  const doSave = async () => { if (blob) { const uri = await savePdf({ blob, fileName, docType, docId }); toast(uri ? 'Choose Files / Drive / Print in the share sheet' : 'Downloaded ' + fileName); } };
  const doPrint = () => {
    if (!blob) return;
    if (isNative()) { doSave(); return; }
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) toast('Allow pop-ups to print, or use Download', 'error');
  };
  const cap = shareCapability();

  return (
    <Modal title={title || 'Preview'} size="wide" onClose={onClose} footer={<>
      <span class="small muted" style="margin-right:auto;align-self:center">Status: <b>{status}</b></span>
      <Btn icon="download" onClick={doSave} disabled={!blob}>Save</Btn>
      <Btn icon="print" class="hide-phone" onClick={doPrint} disabled={!blob}>Print</Btn>
      {phone && <a class="btn" href={whatsappChatUrl(phone, message)} target="_blank" rel="noopener">Open chat</a>}
      <Btn kind="wa" icon="wa" onClick={doShare} disabled={!blob || busy}>{busy ? 'Sharing…' : cap === 'fallback' ? 'Download & WhatsApp' : 'Share to WhatsApp'}</Btn>
    </>}>
      {err && <div class="notice">PDF error: {err}</div>}
      {!blob && !err && <div class="empty">Generating PDF…</div>}
      {cap === 'native' && phone && whatsappApps().length > 0 && <div class="notice info mb"><b>Share to WhatsApp</b> opens the client's chat (+{phone}) with this PDF attached — tap Send in WhatsApp.</div>}
      {cap !== 'fallback' && phone && !(cap === 'native' && whatsappApps().length > 0) && <div class="notice info mb">Pick <b>WhatsApp</b> in the share sheet, then choose the client chat. Client number: <b>+{phone}</b></div>}
      <div class="pdfpages" ref={holder} />
    </Modal>
  );
}
