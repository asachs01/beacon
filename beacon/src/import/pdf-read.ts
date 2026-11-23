/**
 * Read a PDF in the browser. pdfjs is loaded only from here, and only
 * through a dynamic import, so the main bundle does not include it.
 */
import { PDF_TEXT_PAGE_CAP, cappedPdfText, choosePdfRoute } from './pdf-text';

export interface PdfRead {
  pageTexts: string[];
  route: 'text' | 'scan';
  text: string;
  renderFirstPage: () => Promise<Blob>;
}

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    getViewport: (params: { scale: number }) => { width: number; height: number };
    render: (params: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  }>;
  destroy: () => Promise<void> | void;
};

async function renderFirstPage(doc: PdfDoc): Promise<Blob> {
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This scanned PDF page could not be drawn.');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.85);
  });
  if (!blob || blob.size < 1) throw new Error('This scanned PDF page could not be drawn.');
  return blob;
}

export async function readPdfDocument(data: ArrayBuffer): Promise<PdfRead> {
  const { loadPdfjs } = await import('./pdf-loader');
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise as unknown as PdfDoc;
  let destroyed = false;
  const close = async () => {
    if (destroyed) return;
    destroyed = true;
    await doc.destroy();
  };
  try {
    const count = Math.min(doc.numPages, PDF_TEXT_PAGE_CAP);
    const pageTexts: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => item.str ?? '').join(' '));
    }
    const text = cappedPdfText(pageTexts);
    const route = choosePdfRoute(pageTexts);
    if (route === 'text') {
      await close();
      return {
        pageTexts,
        route,
        text,
        renderFirstPage: async () => {
          throw new Error('This PDF was read as text.');
        },
      };
    }
    return {
      pageTexts,
      route,
      text,
      renderFirstPage: async () => {
        try {
          return await renderFirstPage(doc);
        } finally {
          await close();
        }
      },
    };
  } catch (err) {
    await close();
    throw err;
  }
}
