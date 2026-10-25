export type GstInvoiceAmounts = {
  taxableAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  printedTaxAmount: string;
  totalAmount: string;
};

export type GstCheckStatus = 'pass' | 'warning' | 'info';

export type GstValidationCheck = {
  id: string;
  title: string;
  status: GstCheckStatus;
  message: string;
};

export type GstinAssignments = {
  supplier: string[];
  buyer: string[];
  unassigned: string[];
};

const gstinPattern = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/gi;
const supplierLabelPattern =
  /\b(?:supplier|vendor|seller|billed\s+by|issued\s+by|from)\b/gi;
const buyerLabelPattern =
  /\b(?:buyer|customer|billed\s+to|bill\s+to|consignee|ship\s+to|recipient|receiver|sold\s+to)\b/gi;

function lastMatchIndex(text: string, pattern: RegExp): number {
  let lastIndex = -1;
  for (const match of text.matchAll(pattern)) {
    lastIndex = match.index ?? lastIndex;
  }
  return lastIndex;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function extractGstinAssignments(text: string): GstinAssignments {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const supplier: string[] = [];
  const buyer: string[] = [];
  const unassigned: string[] = [];

  lines.forEach((line, lineIndex) => {
    for (const match of line.matchAll(gstinPattern)) {
      const gstin = match[0].toUpperCase();
      const precedingContext = [
        ...lines.slice(Math.max(0, lineIndex - 2), lineIndex),
        line.slice(0, match.index),
      ].join(' ');
      const previousGstin = [...precedingContext.matchAll(gstinPattern)].at(-1);
      const precedingText = previousGstin
        ? precedingContext.slice(
            (previousGstin.index ?? 0) + previousGstin[0].length,
          )
        : precedingContext;
      const supplierIndex = lastMatchIndex(precedingText, supplierLabelPattern);
      const buyerIndex = lastMatchIndex(precedingText, buyerLabelPattern);

      if (supplierIndex > buyerIndex) {
        supplier.push(gstin);
      } else if (buyerIndex > supplierIndex) {
        buyer.push(gstin);
      } else {
        const followingText = line.slice((match.index ?? 0) + match[0].length);
        const followingSupplierIndex = lastMatchIndex(
          followingText,
          supplierLabelPattern,
        );
        const followingBuyerIndex = lastMatchIndex(
          followingText,
          buyerLabelPattern,
        );
        if (followingSupplierIndex > followingBuyerIndex) {
          supplier.push(gstin);
        } else if (followingBuyerIndex > followingSupplierIndex) {
          buyer.push(gstin);
        } else {
          unassigned.push(gstin);
        }
      }
    }
  });

  return {
    supplier: unique(supplier),
    buyer: unique(buyer),
    unassigned: unique(unassigned),
  };
}

export function parseMoneyToMinorUnits(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('%')) return null;

  const parenthesizedNegative = /^\(.*\)$/.test(trimmed);
  const negative = parenthesizedNegative || /[-−]/.test(trimmed);
  const numeric = trimmed.replace(/[^\d.,]/g, '');
  if (!/\d/.test(numeric)) return null;

  const lastDot = numeric.lastIndexOf('.');
  const lastComma = numeric.lastIndexOf(',');
  let decimalIndex = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalIndex = Math.max(lastDot, lastComma);
  } else {
    const separatorIndex = Math.max(lastDot, lastComma);
    if (separatorIndex >= 0) {
      const decimalDigits = numeric.length - separatorIndex - 1;
      if (decimalDigits === 1 || decimalDigits === 2) {
        decimalIndex = separatorIndex;
      }
    }
  }

  const wholeText =
    decimalIndex >= 0
      ? numeric.slice(0, decimalIndex).replace(/[.,]/g, '')
      : numeric.replace(/[.,]/g, '');
  const fractionText =
    decimalIndex >= 0 ? numeric.slice(decimalIndex + 1).replace(/[.,]/g, '') : '';

  if (fractionText.length > 2) return null;
  const whole = Number(wholeText || '0');
  const fraction = Number((fractionText + '00').slice(0, 2));
  const minorUnits = whole * 100 + fraction;
  if (!Number.isSafeInteger(minorUnits)) return null;
  return negative ? -minorUnits : minorUnits;
}

function amountDifference(expected: number, actual: number): number {
  return Math.abs(expected - actual);
}

function describeComparison(
  title: string,
  calculated: number,
  printed: number,
): GstValidationCheck {
  const difference = amountDifference(calculated, printed);
  if (difference <= 1) {
    return {
      id: title === 'CGST + SGST' ? 'split-tax' : 'igst-tax',
      title,
      status: 'pass',
      message: `${title} matches the printed tax amount within rounding tolerance.`,
    };
  }

  return {
    id: title === 'CGST + SGST' ? 'split-tax' : 'igst-tax',
    title,
    status: 'warning',
    message: `${title} differs from the printed tax amount by ${(difference / 100).toFixed(2)}. Review the invoice.`,
  };
}

export function validateGstInvoice(
  amounts: GstInvoiceAmounts,
): GstValidationCheck[] {
  const taxable = parseMoneyToMinorUnits(amounts.taxableAmount);
  const cgst = parseMoneyToMinorUnits(amounts.cgst);
  const sgst = parseMoneyToMinorUnits(amounts.sgst);
  const igst = parseMoneyToMinorUnits(amounts.igst);
  const printedTax = parseMoneyToMinorUnits(amounts.printedTaxAmount);
  const total = parseMoneyToMinorUnits(amounts.totalAmount);
  const hasSplitTax = cgst !== null || sgst !== null;
  const hasIgst = igst !== null;
  const splitTaxComplete = cgst !== null && sgst !== null;
  const checks: GstValidationCheck[] = [];

  if (hasSplitTax && hasIgst) {
    checks.push({
      id: 'tax-structure',
      title: 'GST tax structure',
      status: 'warning',
      message:
        'CGST/SGST and IGST were both found. Review the invoice; the app will not assume which components apply.',
    });
  } else if (hasSplitTax && !splitTaxComplete) {
    checks.push({
      id: 'split-tax',
      title: 'CGST + SGST',
      status: 'warning',
      message:
        'Only one split-tax amount was extracted. The combined tax cannot be checked until both values are reviewed.',
    });
  } else if (splitTaxComplete) {
    if (printedTax === null) {
      checks.push({
        id: 'split-tax',
        title: 'CGST + SGST',
        status: 'info',
        message:
          'Both amounts were extracted, but no printed total tax amount was found for comparison.',
      });
    } else {
      checks.push(describeComparison('CGST + SGST', cgst + sgst, printedTax));
    }
  } else if (hasIgst) {
    if (printedTax === null) {
      checks.push({
        id: 'igst-tax',
        title: 'IGST',
        status: 'info',
        message:
          'IGST was extracted, but no printed total tax amount was found for comparison.',
      });
    } else {
      checks.push(describeComparison('IGST', igst, printedTax));
    }
  } else {
    checks.push({
      id: 'tax-breakdown',
      title: 'GST breakdown',
      status: 'warning',
      message:
        'No CGST, SGST, or IGST amount was extracted. Review the tax lines before relying on a total check.',
    });
  }

  if (taxable === null || total === null) {
    const missing = [
      taxable === null ? 'taxable amount' : '',
      total === null ? 'invoice total' : '',
    ].filter(Boolean);
    checks.push({
      id: 'invoice-total',
      title: 'Invoice total',
      status: 'warning',
      message: `Cannot reconcile the invoice total because the ${missing.join(' and ')} is missing.`,
    });
    return checks;
  }

  let applicableTax: number | null = null;
  let taxBasis = '';
  let structureConflict = hasSplitTax && hasIgst;

  if (splitTaxComplete && !hasIgst) {
    applicableTax = cgst + sgst;
    taxBasis = 'CGST + SGST';
  } else if (hasIgst && !hasSplitTax) {
    applicableTax = igst;
    taxBasis = 'IGST';
  } else if (printedTax !== null) {
    applicableTax = printedTax;
    taxBasis = 'the printed tax amount';
  } else if (hasSplitTax && !splitTaxComplete) {
    structureConflict = true;
  }

  if (applicableTax === null) {
    checks.push({
      id: 'invoice-total',
      title: 'Invoice total',
      status: 'warning',
      message:
        'Cannot reconcile the invoice total because the applicable tax amounts are incomplete or ambiguous.',
    });
    return checks;
  }

  const calculatedTotal = taxable + applicableTax;
  const difference = amountDifference(calculatedTotal, total);
  const matches = difference <= 1;
  const status: GstCheckStatus = structureConflict
    ? 'warning'
    : matches
      ? 'pass'
      : 'warning';
  const reconciliationMessage = matches
    ? `Taxable amount + ${taxBasis} matches the invoice total within rounding tolerance.`
    : `Taxable amount + ${taxBasis} differs from the invoice total by ${(difference / 100).toFixed(2)}. Review the invoice.`;

  checks.push({
    id: 'invoice-total',
    title: 'Taxable amount + taxes = invoice total',
    status,
    message: structureConflict
      ? `${reconciliationMessage} The tax structure is ambiguous, so review which amounts apply.`
      : reconciliationMessage,
  });

  return checks;
}
