import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractGstinAssignments } from './gst-validation';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type InvoiceFieldKey =
  | 'invoiceNumber'
  | 'invoiceDate'
  | 'supplierName'
  | 'supplierGstin'
  | 'buyerGstin'
  | 'unassignedGstin'
  | 'subtotal'
  | 'cgst'
  | 'sgst'
  | 'igst'
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
  supplierGstin: 'Supplier GSTIN',
  buyerGstin: 'Buyer GSTIN',
  unassignedGstin: 'Unassigned GSTINs',
  subtotal: 'Taxable amount / subtotal',
  cgst: 'CGST',
  sgst: 'SGST',
  igst: 'IGST',
  taxAmount: 'Tax amount (as printed)',
  totalAmount: 'Total invoice amount',
};

const empty = (): ExtractedField => ({ value: '', needsReview: true });

export const blankInvoiceFields = (): InvoiceFields => ({
  invoiceNumber: empty(),
  invoiceDate: empty(),
  supplierName: empty(),
  supplierGstin: empty(),
  buyerGstin: empty(),
  unassignedGstin: { value: '', needsReview: false },
  subtotal: empty(),
  cgst: empty(),
  sgst: empty(),
  igst: empty(),
  taxAmount: empty(),
  totalAmount: empty(),
});

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isFieldLabelOnly(value: string) {
  return /^(?:invoice\s*(?:number|no\.?|#)|inv\s*(?:number|no\.?)|invoice\s*date|date\s*of\s*invoice|issued\s*on|supplier\s*name|supplier|vendor|seller|billed\s*by|buyer|customer|billed\s*to|bill\s*to|gstin|supplier\s*gstin|buyer\s*gstin|taxable\s*(?:amount|value)|sub\s*total|subtotal|cgst|sgst|igst|total\s*(?:tax|gst)(?:\s*amount)?|tax\s*amount|gst\s*amount|sales\s*tax|vat|total\s*amount|invoice\s*total|amount\s*due|grand\s*total|balance\s*due)\s*[:#\-–—@]?$/i.test(value.trim());
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
      if (!candidate || isFieldLabelOnly(candidate)) continue;
      const cleaned = valuePattern ? extractMoneyValue(candidate) : candidate;
      if (!cleaned) continue;
      values.push(cleaned);
      break;
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

const moneyValuePattern =
  /(?:₹\s*|Rs\.?\s*|INR\s*|[$€£]\s*)?-?\d[\d,]*(?:\.\d{1,3})?/gi;

function extractMoneyValue(candidate: string): string {
  const matches = [...candidate.matchAll(moneyValuePattern)].filter((match) => {
    const end = (match.index ?? 0) + match[0].length;
    return candidate.slice(end).trimStart()[0] !== '%';
  });
  return matches.at(-1)?.[0].trim() ?? '';
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
  const gstins = extractGstinAssignments(text);

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
    collectLabelValues(lines, /(?:supplier\s*name|supplier(?!\s*gstin)|vendor|seller|billed\s*by)\s*[:#\-–—]?\s*(.*)$/i),
  );
  setCandidate(fields.supplierGstin, gstins.supplier);
  setCandidate(fields.buyerGstin, gstins.buyer);
  const ambiguousGstins = [
    ...gstins.unassigned,
    ...(gstins.supplier.length > 1 ? gstins.supplier : []),
    ...(gstins.buyer.length > 1 ? gstins.buyer : []),
  ];
  setCandidate(fields.unassignedGstin, uniqueValues(ambiguousGstins));
  setCandidate(
    fields.subtotal,
    collectLabelValues(lines, /(?:taxable\s*(?:amount|value)|sub\s*total|subtotal)\s*[:#\-–—]?\s*(.*)$/i, moneyValuePattern),
  );
  setCandidate(
    fields.cgst,
    collectLabelValues(lines, /\bcgst\b(?:\s*(?:tax|amount))?\s*[:#\-–—@]?\s*(.*)$/i, moneyValuePattern),
  );
  setCandidate(
    fields.sgst,
    collectLabelValues(lines, /\bsgst\b(?:\s*(?:tax|amount))?\s*[:#\-–—@]?\s*(.*)$/i, moneyValuePattern),
  );
  setCandidate(
    fields.igst,
    collectLabelValues(lines, /\bigst\b(?:\s*(?:tax|amount))?\s*[:#\-–—@]?\s*(.*)$/i, moneyValuePattern),
  );
  setCandidate(
    fields.taxAmount,
    collectLabelValues(lines, /(?:\btotal\s+(?:tax|gst)(?:\s+amount)?\b|\btax\s+amount\b|\bgst\s+amount\b|\bsales\s+tax\b|\bvat\s+amount\b)\s*[:#\-–—]?\s*(.*)$/i, moneyValuePattern),
  );
  setCandidate(
    fields.totalAmount,
    collectLabelValues(lines, /(?:total\s*amount|total\s*invoice\s*amount|invoice\s*total|amount\s*due|net\s*payable|amount\s*payable|grand\s*total|balance\s*due)\s*[:#\-–—]?\s*(.*)$/i, moneyValuePattern),
  );

  return { fields, pageCount: document.numPages, textLength: text.replace(/\s/g, '').length };
}
