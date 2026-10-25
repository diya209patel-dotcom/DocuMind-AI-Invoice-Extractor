import assert from 'node:assert/strict';
import test from 'node:test';

import {
  partitionInvoiceFiles,
  processInvoiceBatch,
  type InvoiceBatchRecord,
} from './bulk-invoice-processing.ts';
import type { InvoiceFields } from './pdf-extraction.ts';

function createFields(invoiceNumber: string): InvoiceFields {
  const blank = () => ({ value: '', needsReview: true });
  return {
    invoiceNumber: { value: invoiceNumber, needsReview: false },
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

test('multiple PDF files are accepted and unsupported or empty files are rejected', () => {
  const files = [
    { name: 'one.pdf', type: 'application/pdf', size: 120 },
    { name: 'two.PDF', type: 'application/octet-stream', size: 240 },
    { name: 'notes.txt', type: 'text/plain', size: 50 },
    { name: 'empty.pdf', type: 'application/pdf', size: 0 },
  ];

  const result = partitionInvoiceFiles(files);

  assert.deepEqual(
    result.accepted.map((file) => file.name),
    ['one.pdf', 'two.PDF'],
  );
  assert.deepEqual(result.rejected, [
    'notes.txt: not a PDF',
    'empty.pdf: file is empty',
  ]);
});

test('a failure for one invoice does not stop later PDFs from processing', async () => {
  const records: InvoiceBatchRecord<{ name: string }>[] = [
    {
      id: 'one',
      file: { name: 'one.pdf' },
      status: 'queued',
      fields: null,
      error: null,
      note: null,
    },
    {
      id: 'bad',
      file: { name: 'damaged.pdf' },
      status: 'queued',
      fields: null,
      error: null,
      note: null,
    },
    {
      id: 'three',
      file: { name: 'three.pdf' },
      status: 'queued',
      fields: null,
      error: null,
      note: null,
    },
  ];
  const statuses = new Map<string, string[]>();
  const finalRecords = new Map<string, Record<string, unknown>>();

  await processInvoiceBatch(
    records,
    async (file) => {
      if (file.name === 'damaged.pdf') throw new Error('broken PDF');
      return {
        fields: createFields(file.name),
        pageCount: 1,
        textLength: 25,
      };
    },
    (id, update) => {
      statuses.set(id, [...(statuses.get(id) ?? []), update.status ?? '']);
      finalRecords.set(id, {
        ...(finalRecords.get(id) ?? {}),
        ...update,
      });
    },
  );

  assert.deepEqual(statuses.get('one'), ['processing', 'success']);
  assert.deepEqual(statuses.get('bad'), ['processing', 'error']);
  assert.deepEqual(statuses.get('three'), ['processing', 'success']);
  assert.equal(finalRecords.get('one')?.fields && (finalRecords.get('one')?.fields as InvoiceFields).invoiceNumber.value, 'one.pdf');
  assert.match(String(finalRecords.get('bad')?.error), /could not read this PDF/i);
  assert.equal(finalRecords.get('three')?.status, 'success');
});

test('an invoice without selectable text remains reviewable with an explanatory note', async () => {
  let finalUpdate: Record<string, unknown> = {};
  const records: InvoiceBatchRecord<{ name: string }>[] = [{
    id: 'scan',
    file: { name: 'scan.pdf' },
    status: 'queued',
    fields: null,
    error: null,
    note: null,
  }];

  await processInvoiceBatch(
    records,
    async () => ({
      fields: createFields(''),
      pageCount: 1,
      textLength: 0,
    }),
    (_id, update) => {
      finalUpdate = { ...finalUpdate, ...update };
    },
  );

  assert.equal(finalUpdate.status, 'success');
  assert.ok(finalUpdate.fields);
  assert.match(String(finalUpdate.note), /OCR is not included/);
});
