import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type InvoiceFieldKey =
  | 'invoiceNumber'
  | 'invoiceDate'
  | 'supplierName'
  | 'subtotal'
  | 'taxAmount'
  | 'totalAmount';

export type ExtractedField = {
  value: string;
  needsReview: boolean;
};

export type InvoiceFields = Record<InvoiceFieldKey, ExtractedField>;

export const fieldLabels: Record<InvoiceFieldKey, string> = {
  invoiceNumber: 'Invoice Number',
  invoiceDate: 'Invoice Date',
  supplierName: 'Supplier Name',
  subtotal: 'Subtotal',
  taxAmount: 'Tax Amount',
  totalAmount: 'Total Amount',
};

const empty = (): ExtractedField => ({ value: '', needsReview: true });

export const blankInvoiceFields = (): InvoiceFields => ({
  invoiceNumber: empty(),
  invoiceDate: empty(),
  supplierName: empty(),
  subtotal: empty(),
  taxAmount: empty(),
  totalAmount: empty(),
});

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isFieldLabelOnly(value: string) {
  return /^(?:invoice\s*(?:number|no\.?|#)|inv\s*(?:number|no\.?)|invoice\s*date|date\s*of\s*invoice|issued\s*on|supplier\s*name|supplier|vendor|seller|billed\s*by|sub\s*total|subtotal|tax\s*amount|sales\s*tax|vat|gst|total\s*amount|invoice\s*total|amount\s*due|grand\s*total|balance\s*due)\s*[:#\-–—]?$/i.test(value.trim());
}

function collectLabelValues(
  lines: string[],
  labelPattern: RegExp,
  valuePattern?: RegExp,
) {
  const values: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(labelPattern);
    if (!match) continue;
    const inline = match[1]?.trim().replace(/^[:#\-–—\s]+/, '').trim() ?? '';
    const next = lines[index + 1]?.trim() ?? '';
    const candidates = [inline, next];
    for (const candidate of candidates) {
      if (!candidate || isFieldLabelOnly(candidate) || (valuePattern && !valuePattern.test(candidate))) continue;
      const cleaned = valuePattern ? candidate.match(valuePattern)?.[0] ?? '' : candidate;
      if (cleaned) values.push(cleaned);
      if (inline) break;
      if (cleaned) break;
    }
  }
  return uniqueValues(values);
}

function setCandidate(field: ExtractedField, values: string[]) {
  if (values.length === 1) {
    field.value = values[0];
    field.needsReview = false;
  } else if (values.length > 1) {
    field.value = '';
    field.needsReview = true;
  }
}

function moneyPattern() {
  return /(?:[$€£]\s*)?-?\d[\d,]*(?:\.\d{2})?/;
}

export async function extractInvoiceFromPdf(file: File): Promise<{
  fields: InvoiceFields;
  pageCount: number;
  textLength: number;
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines = (content.items as Array<{ str?: string }>)
      .map((item) => item.str?.trim() ?? '')
      .filter(Boolean);
    pages.push(pageLines.join('\n'));
  }

  const text = pages.join('\n');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fields = blankInvoiceFields();

  setCandidate(
    fields.invoiceNumber,
    collectLabelValues(lines, /(?:invoice\s*(?:number|no\.?|#)|inv\s*(?:number|no\.?))\s*[:#\-–—]?\s*(.*)$/i),
  );
  setCandidate(
    fields.invoiceDate,
    collectLabelValues(lines, /(?:invoice\s*date|date\s*of\s*invoice|issued\s*on)\s*[:#\-–—]?\s*(.*)$/i),
  );
  setCandidate(
    fields.supplierName,
    collectLabelValues(lines, /(?:supplier\s*name|supplier|vendor|seller|billed\s*by)\s*[:#\-–—]?\s*(.*)$/i),
  );
  setCandidate(
    fields.subtotal,
    collectLabelValues(lines, /(?:sub\s*total|subtotal)\s*[:#\-–—]?\s*(.*)$/i, moneyPattern()),
  );
  setCandidate(
    fields.taxAmount,
    collectLabelValues(lines, /(?:tax\s*amount|sales\s*tax|vat|gst)\s*[:#\-–—]?\s*(.*)$/i, moneyPattern()),
  );
  setCandidate(
    fields.totalAmount,
    collectLabelValues(lines, /(?:total\s*amount|invoice\s*total|amount\s*due|grand\s*total|balance\s*due)\s*[:#\-–—]?\s*(.*)$/i, moneyPattern()),
  );

  return { fields, pageCount: document.numPages, textLength: text.replace(/\s/g, '').length };
}
