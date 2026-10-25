import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';

import type { InvoiceFields } from './pdf-extraction.ts';
import {
  buildInvoiceWorkbook,
  invoiceExportHeaders,
  type ReviewedInvoice,
} from './invoice-export.ts';

function reviewedInvoice(
  overrides: Partial<InvoiceFields> = {},
  isDemo = false,
): ReviewedInvoice {
  return {
    isDemo,
    fields: {
      ...blankInvoiceFields(),
      invoiceNumber: { value: 'INV-1001', needsReview: false },
      invoiceDate: { value: '25 Oct 2026', needsReview: false },
      supplierName: { value: 'Northstar Office Supply', needsReview: false },
      supplierGstin: { value: '27ABCDE1234F1Z5', needsReview: false },
      buyerGstin: { value: '', needsReview: true },
      subtotal: { value: '₹1,000.50', needsReview: false },
      cgst: { value: '₹90.00', needsReview: false },
      sgst: { value: '₹90.00', needsReview: false },
      igst: { value: '', needsReview: true },
      taxAmount: { value: '₹180.00', needsReview: false },
      totalAmount: { value: '₹1,180.50', needsReview: false },
      ...overrides,
    },
  };
}

function blankInvoiceFields(): InvoiceFields {
  const blank = () => ({ value: '', needsReview: true });
  return {
    invoiceNumber: blank(),
    invoiceDate: blank(),
    supplierName: blank(),
    supplierGstin: blank(),
    buyerGstin: blank(),
    unassignedGstin: { value: '', needsReview: false },
    subtotal: blank(),
    cgst: blank(),
    sgst: blank(),
    igst: blank(),
    taxAmount: blank(),
    totalAmount: blank(),
  };
}

async function roundTrip(invoiceData: ReviewedInvoice[]) {
  const workbook = await buildInvoiceWorkbook(invoiceData);
  const buffer = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);
  return reopened.getWorksheet('Invoices');
}

test('creates a valid xlsx workbook with the required column headers', async () => {
  const worksheet = await roundTrip([reviewedInvoice()]);

  assert.ok(worksheet);
  assert.deepEqual(
    worksheet.getRow(1).values.slice(1),
    [...invoiceExportHeaders],
  );
  assert.equal(worksheet.rowCount, 2);
});

test('exports current reviewed values and numeric amount cells', async () => {
  const edited = reviewedInvoice({
    invoiceNumber: { value: 'INV-EDITED-7', needsReview: false },
    supplierName: { value: 'Edited Supplier Ltd.', needsReview: false },
    subtotal: { value: '₹1,200.50', needsReview: false },
    totalAmount: { value: '₹1,416.59', needsReview: false },
  });
  const worksheet = await roundTrip([edited]);

  assert.ok(worksheet);
  const row = worksheet.getRow(2);
  assert.equal(row.getCell(1).value, 'INV-EDITED-7');
  assert.equal(row.getCell(3).value, 'Edited Supplier Ltd.');
  assert.equal(row.getCell(6).value, 1200.5);
  assert.equal(row.getCell(6).type, ExcelJS.ValueType.Number);
  assert.equal(row.getCell(7).value, 90);
  assert.equal(row.getCell(10).value, 1416.59);
  assert.equal(row.getCell(10).type, ExcelJS.ValueType.Number);
});

test('keeps missing invoice fields as blank cells, not numeric zeroes', async () => {
  const worksheet = await roundTrip([reviewedInvoice()]);

  assert.ok(worksheet);
  const row = worksheet.getRow(2);
  assert.equal(row.getCell(5).value, null);
  assert.equal(row.getCell(9).value, null);
  assert.equal(row.getCell(5).type, ExcelJS.ValueType.Null);
  assert.equal(row.getCell(9).type, ExcelJS.ValueType.Null);
});

test('exports validation status and review warnings for missing or inconsistent values', async () => {
  const invoice = reviewedInvoice({
    totalAmount: { value: '₹1,250.00', needsReview: false },
  });
  const worksheet = await roundTrip([invoice]);

  assert.ok(worksheet);
  const row = worksheet.getRow(2);
  assert.equal(row.getCell(11).value, 'Review required');
  assert.match(String(row.getCell(12).value), /differs from the invoice total/);
  assert.match(String(row.getCell(12).value), /Buyer GSTIN is missing/);
  assert.match(String(row.getCell(12).value), /IGST is missing/);
});

test('supports one worksheet row per invoice and labels demonstration data', async () => {
  const worksheet = await roundTrip([
    reviewedInvoice(),
    reviewedInvoice({
      invoiceNumber: { value: 'DEMO-2002', needsReview: false },
    }, true),
  ]);

  assert.ok(worksheet);
  assert.equal(worksheet.rowCount, 3);
  assert.equal(worksheet.getRow(2).getCell(1).value, 'INV-1001');
  assert.equal(worksheet.getRow(3).getCell(1).value, 'DEMO-2002');
  assert.equal(worksheet.autoFilter, `A1:L3`);
  assert.match(
    String(worksheet.getRow(3).getCell(11).value),
    /^Demonstration data —/,
  );
});

test('rejects an empty invoice list instead of generating an empty export', async () => {
  await assert.rejects(
    () => buildInvoiceWorkbook([]),
    /There is no invoice data to export/,
  );
});
