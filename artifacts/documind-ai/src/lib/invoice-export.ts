import type {
  ExtractedField,
  InvoiceFieldKey,
  InvoiceFields,
} from './pdf-extraction';
import {
  parseMoneyToMinorUnits,
  validateGstInvoice,
  type GstValidationCheck,
} from './gst-validation.ts';

export type ReviewedInvoice = {
  fields: InvoiceFields;
  isDemo?: boolean;
};

export const invoiceExportHeaders = [
  'Invoice Number',
  'Invoice Date',
  'Supplier Name',
  'Supplier GSTIN',
  'Buyer GSTIN',
  'Taxable Amount',
  'CGST',
  'SGST',
  'IGST',
  'Invoice Total',
  'Validation Status',
  'Review Warnings',
] as const;

const amountFieldKeys = [
  'subtotal',
  'cgst',
  'sgst',
  'igst',
  'totalAmount',
] as const;

const reviewFieldLabels: Partial<Record<InvoiceFieldKey, string>> = {
  invoiceNumber: 'Invoice Number',
  invoiceDate: 'Invoice Date',
  supplierName: 'Supplier Name',
  supplierGstin: 'Supplier GSTIN',
  buyerGstin: 'Buyer GSTIN',
  subtotal: 'Taxable Amount',
  cgst: 'CGST',
  sgst: 'SGST',
  igst: 'IGST',
  taxAmount: 'Printed Tax Amount',
  totalAmount: 'Invoice Total',
};

function numericOrTextAmount(value: string): number | string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const minorUnits = parseMoneyToMinorUnits(trimmed);
  return minorUnits === null ? trimmed : minorUnits / 100;
}

export type InvoiceReviewSummary = {
  validationStatus: string;
  reviewWarnings: string[];
  checks: GstValidationCheck[];
};

export function summarizeReviewedInvoice(
  fields: InvoiceFields,
): InvoiceReviewSummary {
  const checks = validateGstInvoice({
    taxableAmount: fields.subtotal.value,
    cgst: fields.cgst.value,
    sgst: fields.sgst.value,
    igst: fields.igst.value,
    printedTaxAmount: fields.taxAmount.value,
    totalAmount: fields.totalAmount.value,
  });

  const warnings: string[] = [];

  (Object.entries(fields) as [InvoiceFieldKey, ExtractedField][]).forEach(
    ([key, field]) => {
      if (key !== 'unassignedGstin' && field.needsReview) {
        const reason = field.value.trim()
          ? 'needs review'
          : 'is missing or was not extracted';
        warnings.push(`${reviewFieldLabels[key] ?? key} ${reason}.`);
      }
    },
  );

  if (fields.unassignedGstin.value.trim()) {
    warnings.push(
      `Unassigned GSTIN(s) need review: ${fields.unassignedGstin.value.trim()}.`,
    );
  }

  checks
    .filter((check) => check.status !== 'pass')
    .forEach((check) => warnings.push(`${check.title}: ${check.message}`));

  const hasFieldReview = Object.entries(fields).some(
    ([key, field]) =>
      key !== 'unassignedGstin' && (field as ExtractedField).needsReview,
  );
  const hasWarning = checks.some((check) => check.status === 'warning');
  const hasInfo = checks.some((check) => check.status === 'info');

  const validationStatus = hasFieldReview || hasWarning
    ? 'Review required'
    : hasInfo
      ? 'Partially checked'
      : 'Arithmetic checks match';

  return {
    validationStatus,
    reviewWarnings: [...new Set(warnings)],
    checks,
  };
}

function buildRow(invoice: ReviewedInvoice): (string | number | null)[] {
  const { fields } = invoice;
  const { reviewWarnings, validationStatus } = summarizeReviewedInvoice(fields);

  return [
    fields.invoiceNumber.value.trim() || null,
    fields.invoiceDate.value.trim() || null,
    fields.supplierName.value.trim() || null,
    fields.supplierGstin.value.trim() || null,
    fields.buyerGstin.value.trim() || null,
    numericOrTextAmount(fields.subtotal.value),
    numericOrTextAmount(fields.cgst.value),
    numericOrTextAmount(fields.sgst.value),
    numericOrTextAmount(fields.igst.value),
    numericOrTextAmount(fields.totalAmount.value),
    invoice.isDemo
      ? `Demonstration data — ${validationStatus}`
      : validationStatus,
    reviewWarnings.length > 0 ? reviewWarnings.join('\n') : null,
  ];
}

export async function buildInvoiceWorkbook(invoices: ReviewedInvoice[]) {
  if (invoices.length === 0) {
    throw new Error('There is no invoice data to export.');
  }

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DocuMind AI';
  const worksheet = workbook.addWorksheet('Invoices');
  worksheet.addRow([...invoiceExportHeaders]);

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF203550' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEAF3FA' },
  };
  worksheet.columns = [
    { width: 20 },
    { width: 18 },
    { width: 28 },
    { width: 22 },
    { width: 22 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 28 },
    { width: 72 },
  ];

  invoices.forEach((invoice) => {
    const row = worksheet.addRow(buildRow(invoice));
    amountFieldKeys.forEach((_, index) => {
      const cell = row.getCell(index + 6);
      if (typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00;[Red]-#,##0.00';
      }
    });
    row.getCell(12).alignment = { vertical: 'top', wrapText: true };
  });

  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: {
      row: invoices.length + 1,
      column: invoiceExportHeaders.length,
    },
  };

  return workbook;
}

export async function downloadInvoiceWorkbook(
  invoices: ReviewedInvoice[],
): Promise<void> {
  const workbook = await buildInvoiceWorkbook(invoices);
  const workbookBytes = await workbook.xlsx.writeBuffer();
  const bytes = Uint8Array.from(
    workbookBytes as unknown as Iterable<number>,
  );
  const blob = new Blob([bytes.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = 'documind-invoice-review.xlsx';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}
