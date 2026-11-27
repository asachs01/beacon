/**
 * Decide whether a PDF's extracted text is enough to use the text pipeline.
 * Scans (almost no text) take the image path instead. Only the first pages
 * count; later pages are not sent.
 */
export const PDF_TEXT_PAGE_CAP = 5;

/** Fewer letters or digits than this is treated as a scan. */
export const PDF_SCAN_MIN_LETTERS = 20;

export function cappedPdfText(pageTexts: readonly string[], cap = PDF_TEXT_PAGE_CAP): string {
  return pageTexts
    .slice(0, cap)
    .join('\n')
    .replace(/\u0000/g, ' ')
    .trim();
}

export function pdfRouteForText(text: string): 'text' | 'scan' {
  const letters = text.replace(/[^\p{L}\p{N}]/gu, '');
  return letters.length >= PDF_SCAN_MIN_LETTERS ? 'text' : 'scan';
}

export function choosePdfRoute(pageTexts: readonly string[]): 'text' | 'scan' {
  return pdfRouteForText(cappedPdfText(pageTexts));
}
