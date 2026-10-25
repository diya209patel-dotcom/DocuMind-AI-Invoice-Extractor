import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractGstinAssignments,
  parseMoneyToMinorUnits,
  validateGstInvoice,
  type GstInvoiceAmounts,
} from './gst-validation.ts';

function amounts(
  overrides: Partial<GstInvoiceAmounts> = {},
): GstInvoiceAmounts {
  return {
    taxableAmount: '₹1,000.00',
    cgst: '₹90.00',
    sgst: '₹90.00',
    igst: '',
    printedTaxAmount: '₹180.00',
    totalAmount: '₹1,180.00',
    ...overrides,
  };
}

test('GSTINs are assigned only when supplier or buyer context is present', () => {
  const result = extractGstinAssignments(
    [
      'Supplier GSTIN: 27ABCDE1234F1Z5',
      'Buyer GSTIN: 29PQRSX5678L1Z4',
      'GSTIN: 07LMNOP1234Q1Z2',
    ].join('\n'),
  );

  assert.deepEqual(result.supplier, ['27ABCDE1234F1Z5']);
  assert.deepEqual(result.buyer, ['29PQRSX5678L1Z4']);
  assert.deepEqual(result.unassigned, ['07LMNOP1234Q1Z2']);
});

test('money parsing handles Indian grouping and does not treat a GST rate as an amount', () => {
  assert.equal(parseMoneyToMinorUnits('₹1,18,000.50'), 11_800_050);
  assert.equal(parseMoneyToMinorUnits('1.180,50'), 118_050);
  assert.equal(parseMoneyToMinorUnits('9%'), null);
});

test('CGST plus SGST matches an explicitly printed tax amount and total', () => {
  const checks = validateGstInvoice(amounts());
  assert.equal(checks.find((check) => check.id === 'split-tax')?.status, 'pass');
  assert.equal(checks.find((check) => check.id === 'invoice-total')?.status, 'pass');
});

test('IGST is checked against printed tax without assuming a fixed GST rate', () => {
  const checks = validateGstInvoice(
    amounts({
      cgst: '',
      sgst: '',
      igst: '₹180.00',
      printedTaxAmount: '₹180.00',
    }),
  );

  assert.equal(checks.find((check) => check.id === 'igst-tax')?.status, 'pass');
  assert.equal(checks.find((check) => check.id === 'invoice-total')?.status, 'pass');
});

test('missing GST components remain incomplete rather than being treated as zero', () => {
  const checks = validateGstInvoice(
    amounts({
      cgst: '',
      sgst: '',
      igst: '',
      printedTaxAmount: '',
    }),
  );

  assert.equal(
    checks.find((check) => check.id === 'tax-breakdown')?.status,
    'warning',
  );
  assert.equal(
    checks.find((check) => check.id === 'invoice-total')?.status,
    'warning',
  );
  assert.match(
    checks.find((check) => check.id === 'invoice-total')?.message ?? '',
    /incomplete or ambiguous/,
  );
});

test('a printed tax amount inconsistent with CGST plus SGST is flagged', () => {
  const checks = validateGstInvoice(
    amounts({ printedTaxAmount: '₹200.00' }),
  );

  assert.equal(checks.find((check) => check.id === 'split-tax')?.status, 'warning');
});

test('an invoice total inconsistent with taxable amount and taxes is flagged', () => {
  const checks = validateGstInvoice(amounts({ totalAmount: '₹1,200.00' }));

  assert.equal(
    checks.find((check) => check.id === 'invoice-total')?.status,
    'warning',
  );
  assert.match(
    checks.find((check) => check.id === 'invoice-total')?.message ?? '',
    /differs from the invoice total/,
  );
});

test('mixed split and integrated tax values require human review', () => {
  const checks = validateGstInvoice(amounts({ igst: '₹180.00' }));

  assert.equal(
    checks.find((check) => check.id === 'tax-structure')?.status,
    'warning',
  );
  assert.equal(
    checks.find((check) => check.id === 'invoice-total')?.status,
    'warning',
  );
});
