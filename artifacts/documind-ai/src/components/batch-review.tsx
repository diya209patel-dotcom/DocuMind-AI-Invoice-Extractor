import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  fieldLabels,
  type InvoiceFieldKey,
} from '@/lib/pdf-extraction';
import {
  summarizeReviewedInvoice,
} from '@/lib/invoice-export';
import type { InvoiceBatchRecord } from '@/lib/bulk-invoice-processing';

type BatchReviewProps = {
  records: InvoiceBatchRecord[];
  isProcessing: boolean;
  isExporting: boolean;
  exportMessage: string;
  onExport: () => void;
  onClear: () => void;
  onRemove: (id: string) => void;
  onUpdateField: (
    id: string,
    key: InvoiceFieldKey,
    value: string,
  ) => void;
};

function formatBatchStatus(record: InvoiceBatchRecord): string {
  if (record.status === 'queued') return 'Queued';
  if (record.status === 'processing') return 'Processing';
  if (record.status === 'error') return 'Processing failed';
  if (!record.fields) return 'Processed';
  return summarizeReviewedInvoice(record.fields).validationStatus;
}

function BatchFieldEditor({
  record,
  onUpdateField,
}: {
  record: InvoiceBatchRecord;
  onUpdateField: BatchReviewProps['onUpdateField'];
}) {
  if (!record.fields) return null;
  const summary = summarizeReviewedInvoice(record.fields);

  return (
    <div className="batch-editor" data-testid={`batch-editor-${record.id}`}>
      <div className="results-table-wrap">
        <table className="results-table">
          <thead>
            <tr>
              <th scope="col">Invoice field</th>
              <th scope="col">Reviewed value</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(fieldLabels) as InvoiceFieldKey[]).map((key) => {
              const field = record.fields![key];
              const inputId = `batch-${record.id}-${key}`;
              return (
                <tr
                  className={field.needsReview ? 'needs-review' : ''}
                  key={key}
                  data-testid={`batch-field-${record.id}-${key}`}
                >
                  <th scope="row">
                    <div className="field-label-row">
                      <label htmlFor={inputId}>{fieldLabels[key]}</label>
                      {field.needsReview && (
                        <span className="field-status">
                          <AlertTriangle size={11} /> Needs review
                        </span>
                      )}
                    </div>
                  </th>
                  <td>
                    <input
                      id={inputId}
                      type="text"
                      value={field.value}
                      placeholder={
                        field.needsReview ? 'Unavailable — enter if known' : ''
                      }
                      onChange={(event) =>
                        onUpdateField(record.id, key, event.target.value)
                      }
                      autoComplete="off"
                      data-testid={`input-batch-${record.id}-${key}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section
        className="validation-panel"
        aria-label={`GST arithmetic review for ${record.file.name}`}
        data-testid={`batch-validation-${record.id}`}
      >
        <div className="validation-heading">
          <div>
            <h3>GST arithmetic review</h3>
            <p>
              Checks use available amounts only. No GST rate is assumed, and
              arithmetic is not a legal compliance determination.
            </p>
          </div>
        </div>
        <ul className="validation-list">
          {summary.checks.map((check) => {
            const StatusIcon =
              check.status === 'pass'
                ? BadgeCheck
                : check.status === 'warning'
                  ? AlertTriangle
                  : CircleHelp;
            const statusLabel =
              check.status === 'pass'
                ? 'Match'
                : check.status === 'warning'
                  ? 'Review'
                  : 'Not checked';
            return (
              <li
                className={`validation-check ${check.status}`}
                key={check.id}
                data-testid={`batch-gst-check-${record.id}-${check.id}`}
              >
                <div className="validation-check-heading">
                  <StatusIcon size={15} aria-hidden="true" />
                  <strong>{check.title}</strong>
                  <span>{statusLabel}</span>
                </div>
                <p>{check.message}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export function BatchReview({
  records,
  isProcessing,
  isExporting,
  exportMessage,
  onExport,
  onClear,
  onRemove,
  onUpdateField,
}: BatchReviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const successfulRecords = records.filter(
    (record) => record.status === 'success' && record.fields,
  );
  const failedCount = records.filter((record) => record.status === 'error').length;
  const processingCount = records.filter(
    (record) => record.status === 'processing',
  ).length;

  return (
    <section
      className="panel batch-review-panel"
      aria-labelledby="batch-review-title"
      data-testid="section-batch-review"
    >
      <div className="batch-review-heading">
        <div>
          <h2 id="batch-review-title">Batch invoice review</h2>
          <p>
            {successfulRecords.length} successful
            {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            {processingCount > 0 ? ` · ${processingCount} processing` : ''}
          </p>
        </div>
        <div className="batch-review-actions">
          <button
            className="primary-button"
            type="button"
            onClick={onExport}
            disabled={isExporting || successfulRecords.length === 0}
            data-testid="button-export-batch"
          >
            <FileSpreadsheet size={15} />
            {isExporting
              ? 'Preparing…'
              : `Export successful (${successfulRecords.length})`}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onClear}
            disabled={isProcessing}
            data-testid="button-clear-batch"
          >
            <RotateCcw size={14} /> Clear batch
          </button>
        </div>
      </div>

      {exportMessage && (
        <div
          className="result-caption batch-export-message"
          role="status"
          data-testid="status-batch-export"
        >
          {exportMessage}
        </div>
      )}

      {records.length === 0 ? (
        <div className="empty-state batch-empty" data-testid="status-batch-empty">
          <div className="empty-art"><FileSpreadsheet size={17} /></div>
          <div>
            <strong>No processed invoices yet</strong>
            <p>Selected files will appear here with an individual status as they are processed.</p>
          </div>
        </div>
      ) : (
        <div className="batch-invoice-list">
          {records.map((record) => {
            const summary = record.fields
              ? summarizeReviewedInvoice(record.fields)
              : null;
            const warnings = summary?.reviewWarnings ?? [];
            const statusLabel = formatBatchStatus(record);
            const expanded = expandedId === record.id;
            const StatusIcon =
              record.status === 'success'
                ? BadgeCheck
                : record.status === 'error'
                  ? AlertCircle
                  : record.status === 'processing'
                    ? LoaderCircle
                    : FileText;

            return (
              <article
                className={`batch-invoice-card batch-${record.status}`}
                key={record.id}
                data-testid={`batch-invoice-${record.id}`}
              >
                <div className="batch-invoice-top">
                  <div className="batch-file-heading">
                    <FileText className="file-icon" size={18} />
                    <div>
                      <h3 title={record.file.name}>{record.file.name}</h3>
                      <span>{(record.file.size / 1024).toFixed(0)} KB</span>
                    </div>
                  </div>
                  <span
                    className={`batch-status ${record.status}`}
                    data-testid={`status-batch-${record.id}`}
                  >
                    <StatusIcon
                      size={13}
                      className={record.status === 'processing' ? 'spin' : ''}
                    />
                    {statusLabel}
                  </span>
                </div>

                <dl className="batch-summary-grid">
                  <div>
                    <dt>Invoice number</dt>
                    <dd>{record.fields?.invoiceNumber.value || 'Not extracted'}</dd>
                  </div>
                  <div>
                    <dt>Supplier</dt>
                    <dd>{record.fields?.supplierName.value || 'Not extracted'}</dd>
                  </div>
                  <div>
                    <dt>Invoice total</dt>
                    <dd>{record.fields?.totalAmount.value || 'Not extracted'}</dd>
                  </div>
                  <div>
                    <dt>Validation status</dt>
                    <dd>{statusLabel}</dd>
                  </div>
                </dl>

                {record.note && (
                  <div className="batch-note" role="status">
                    <CircleHelp size={14} /> {record.note}
                  </div>
                )}
                {record.error && (
                  <div
                    className="batch-processing-error"
                    role="alert"
                    data-testid={`error-batch-${record.id}`}
                  >
                    <AlertCircle size={14} /> {record.error}
                  </div>
                )}
                {warnings.length > 0 && (
                  <div
                    className="batch-warnings"
                    data-testid={`warnings-batch-${record.id}`}
                  >
                    <strong>
                      <AlertTriangle size={13} />
                      Review warnings ({warnings.length})
                    </strong>
                    <ul>
                      {warnings.map((warning, index) => (
                        <li key={`${record.id}-warning-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {record.status === 'success' && warnings.length === 0 && (
                  <div className="batch-no-warnings">
                    <BadgeCheck size={13} /> No review warnings.
                  </div>
                )}

                <div className="batch-invoice-actions">
                  {record.status === 'success' && record.fields && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        setExpandedId(expanded ? null : record.id)
                      }
                      aria-expanded={expanded}
                      data-testid={`button-review-batch-${record.id}`}
                    >
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {expanded ? 'Hide invoice fields' : 'Review and edit'}
                    </button>
                  )}
                  <button
                    className="secondary-button batch-remove-button"
                    type="button"
                    onClick={() => {
                      if (expanded) setExpandedId(null);
                      onRemove(record.id);
                    }}
                    disabled={isProcessing}
                    aria-label={`Remove ${record.file.name} from batch`}
                    data-testid={`button-remove-batch-${record.id}`}
                  >
                    <X size={14} /> Remove
                  </button>
                </div>

                {expanded && record.status === 'success' && (
                  <BatchFieldEditor
                    record={record}
                    onUpdateField={onUpdateField}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
