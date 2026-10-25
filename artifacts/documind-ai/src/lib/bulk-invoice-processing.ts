import type { InvoiceFields } from './pdf-extraction';

export type InvoiceBatchStatus =
  | 'queued'
  | 'processing'
  | 'success'
  | 'error';

export type InvoiceBatchRecord<
  TFile extends { name: string } = File,
> = {
  id: string;
  file: TFile;
  status: InvoiceBatchStatus;
  fields: InvoiceFields | null;
  error: string | null;
  note: string | null;
};

export type InvoiceBatchUpdate = Partial<
  Pick<InvoiceBatchRecord, 'status' | 'fields' | 'error' | 'note'>
>;

export type InvoiceExtractionResult = {
  fields: InvoiceFields;
  pageCount: number;
  textLength: number;
};

export function partitionInvoiceFiles<
  TFile extends { name: string; type: string; size: number },
>(files: TFile[]): { accepted: TFile[]; rejected: string[] } {
  const accepted: TFile[] = [];
  const rejected: string[] = [];

  files.forEach((file) => {
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      rejected.push(`${file.name}: not a PDF`);
    } else if (file.size === 0) {
      rejected.push(`${file.name}: file is empty`);
    } else {
      accepted.push(file);
    }
  });

  return { accepted, rejected };
}

export async function processInvoiceBatch<
  TFile extends { name: string },
>(
  records: InvoiceBatchRecord<TFile>[],
  extract: (file: TFile) => Promise<InvoiceExtractionResult>,
  onUpdate: (id: string, update: InvoiceBatchUpdate) => void,
): Promise<void> {
  for (const record of records) {
    onUpdate(record.id, {
      status: 'processing',
      error: null,
      note: null,
    });

    try {
      const result = await extract(record.file);
      onUpdate(record.id, {
        status: 'success',
        fields: result.fields,
        error: null,
        note:
          result.textLength === 0
            ? 'No selectable text was found. OCR is not included; review the blank fields and enter confirmed values.'
            : null,
      });
    } catch {
      onUpdate(record.id, {
        status: 'error',
        fields: null,
        error:
          'We could not read this PDF. It may be damaged, encrypted, or use an unsupported format.',
        note: null,
      });
    }
  }
}
