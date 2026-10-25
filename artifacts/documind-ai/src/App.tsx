import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Check,
  CircleHelp,
  FileText,
  FileUp,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  blankInvoiceFields,
  extractInvoiceFromPdf,
  fieldLabels,
  type InvoiceFieldKey,
  type InvoiceFields,
} from '@/lib/pdf-extraction';

const queryClient = new QueryClient();

function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<InvoiceFields | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; message: string } | null>(null);
  const [copyMessage, setCopyMessage] = useState('');

  const selectFile = (candidate?: File) => {
    if (isProcessing) return;
    setNotice(null);
    setCopyMessage('');
    setFields(null);
    setIsDemo(false);
    if (!candidate) return;
    const isPdf = candidate.type === 'application/pdf' || candidate.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setFile(null);
      setNotice({ kind: 'error', message: 'That file is not a PDF. Choose a PDF invoice to continue.' });
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (candidate.size === 0) {
      setFile(null);
      setNotice({ kind: 'error', message: 'This file is empty. Choose a PDF with invoice content.' });
      return;
    }
    setFile(candidate);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0]);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const analyzeFile = async () => {
    if (!file || isProcessing) return;
    setNotice(null);
    setFields(null);
    setIsDemo(false);
    setIsProcessing(true);
    try {
      const result = await extractInvoiceFromPdf(file);
      if (result.textLength === 0) {
        setNotice({
          kind: 'info',
          message: 'This PDF does not contain selectable text. It may be scanned or image-only. OCR is not included, so no invoice values were extracted.',
        });
        setFields(blankInvoiceFields());
      } else {
        setFields(result.fields);
        const foundCount = Object.values(result.fields).filter((field) => field.value).length;
        if (foundCount === 0) {
          setNotice({
            kind: 'info',
            message: 'Selectable text was found, but none of the requested fields could be identified confidently. You can enter the values below.',
          });
        } else if (Object.values(result.fields).some((field) => field.needsReview)) {
          setNotice({
            kind: 'info',
            message: `Text read from ${result.pageCount} page${result.pageCount === 1 ? '' : 's'}. Check fields marked “Needs review” before using the values.`,
          });
        }
      }
    } catch {
      setFields(null);
      setNotice({
        kind: 'error',
        message: 'We could not read this PDF. It may be damaged, encrypted, or use an unsupported format. Try another PDF.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const showDemo = () => {
    if (inputRef.current) inputRef.current.value = '';
    setFile(null);
    setNotice(null);
    setCopyMessage('');
    setIsDemo(true);
    setFields({
      invoiceNumber: { value: 'INV-2024-0831', needsReview: false },
      invoiceDate: { value: '18 Sep 2024', needsReview: false },
      supplierName: { value: 'Northstar Office Supply', needsReview: false },
      subtotal: { value: '$486.00', needsReview: false },
      taxAmount: { value: '$43.74', needsReview: false },
      totalAmount: { value: '$529.74', needsReview: false },
    });
  };

  const clearAll = () => {
    setFile(null);
    setFields(null);
    setNotice(null);
    setCopyMessage('');
    setIsDemo(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const updateField = (key: InvoiceFieldKey, value: string) => {
    setFields((current) => current ? {
      ...current,
      [key]: { value, needsReview: value.trim().length === 0 },
    } : current);
  };

  const copyFields = async () => {
    if (!fields) return;
    const content = (Object.keys(fieldLabels) as InvoiceFieldKey[])
      .map((key) => `${fieldLabels[key]}: ${fields[key].value || 'Unavailable'}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(content);
      setCopyMessage('Fields copied to clipboard.');
    } catch {
      setCopyMessage('Clipboard access is unavailable in this browser.');
    }
  };

  const hasReview = fields ? Object.values(fields).some((field) => field.needsReview) : false;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" aria-label="DocuMind AI home">
            <div className="brand-mark"><FileText size={19} strokeWidth={2.2} /></div>
            <span className="brand-name">DocuMind AI</span>
          </div>
          <div className="local-pill" data-testid="status-local-processing">
            <span className="local-dot" />
            Files stay on this device
          </div>
        </div>
      </header>

      <main className="main">
        <div className="intro">
          <div className="eyebrow">Invoice workspace</div>
          <h1>DocuMind AI</h1>
          <p>Turn invoices into organised business data.</p>
        </div>

        <div className="workflow">
          <section className="panel upload-panel" aria-labelledby="upload-title">
            <div className="section-heading">
              <div>
                <h2 id="upload-title">Add an invoice</h2>
                <p>Choose a PDF to read its selectable text and identify key fields.</p>
              </div>
              <span className="step-tag">STEP 01</span>
            </div>

            <input
              ref={inputRef}
              className="file-input"
              type="file"
              accept="application/pdf,.pdf"
              onChange={onFileChange}
              data-testid="input-invoice-pdf"
              aria-label="Choose invoice PDF"
            />
            <div
              className={`dropzone${dragging ? ' dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              data-testid="dropzone-invoice-pdf"
            >
              <div className="upload-icon"><Upload size={20} /></div>
              <div className="drop-title">Drop your invoice PDF here</div>
              <div className="drop-copy">PDF files only · Your document is processed locally</div>
              <button
                className="choose-button"
                type="button"
                onClick={() => inputRef.current?.click()}
                data-testid="button-choose-pdf"
              >
                <FileUp size={15} /> Choose PDF
              </button>
            </div>

            {file && (
              <div className="file-row" data-testid="file-selected">
                <FileText className="file-icon" size={20} />
                <div className="file-info">
                  <div className="file-name" title={file.name} data-testid="text-selected-filename">{file.name}</div>
                  <div className="file-meta">{(file.size / 1024).toFixed(0)} KB · Ready to analyse</div>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setFields(null);
                    setNotice(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                  disabled={isProcessing}
                  aria-label="Remove selected PDF"
                  data-testid="button-remove-pdf"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                disabled={!file || isProcessing}
                onClick={analyzeFile}
                data-testid="button-analyze-invoice"
              >
                {isProcessing ? <><Sparkles size={15} /> Reading invoice…</> : <><Sparkles size={15} /> Analyse invoice</>}
              </button>
              <button
                className="secondary-button demo-button"
                type="button"
                disabled={isProcessing}
                onClick={showDemo}
                data-testid="button-show-demo"
              >
                View demonstration data
              </button>
            </div>

            {isProcessing && (
              <div className="loading-card" role="status" data-testid="status-processing">
                <div className="skeleton-icon" />
                <div className="loading-lines">
                  <div className="loading-line" />
                  <div className="loading-line" />
                </div>
                <span style={{ color: '#60768c', fontSize: 11 }}>Reading PDF on this device</span>
              </div>
            )}

            {notice && (
              <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} data-testid={`status-${notice.kind}`}>
                {notice.kind === 'error' ? <AlertCircle size={16} /> : <CircleHelp size={16} />}
                <span>{notice.message}</span>
              </div>
            )}

            <div className="privacy-note" data-testid="text-privacy-note">
              <LockKeyhole size={13} />
              <span>Your PDF is read in this browser only. It is never uploaded or saved by DocuMind AI.</span>
            </div>
          </section>

          {(fields || isProcessing) && (
            <section className="panel results-panel" aria-labelledby="results-title" data-testid="section-invoice-results">
              <div className="results-top">
                <div>
                  <h2 id="results-title">Extracted invoice details</h2>
                  <p>{isDemo ? 'Example values for demonstration only' : `Source: ${file?.name ?? 'selected PDF'}`}</p>
                </div>
                {fields && (
                  <span className={`result-badge ${isDemo ? 'demo' : 'real'}`} data-testid="status-result-origin">
                    {isDemo ? <><AlertTriangle size={13} /> DEMONSTRATION DATA</> : <><BadgeCheck size={13} /> LOCAL EXTRACTION</>}
                  </span>
                )}
              </div>

              {fields && (
                <>
                  {hasReview && !isDemo && (
                    <div className="empty-state" style={{ marginBottom: 12 }} data-testid="status-needs-review">
                      <div className="empty-art"><AlertTriangle size={17} /></div>
                      <div>
                        <strong>Some values need your attention</strong>
                        <p>Unavailable or ambiguous fields are left blank. Review them and enter a value if you can confirm it from the invoice.</p>
                      </div>
                    </div>
                  )}
                  <div className="results-table-wrap">
                    <table className="results-table" data-testid="table-invoice-results">
                      <thead>
                        <tr>
                          <th scope="col">Invoice field</th>
                          <th scope="col">Extracted value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Object.keys(fieldLabels) as InvoiceFieldKey[]).map((key) => {
                          const field = fields[key];
                          return (
                            <tr className={field.needsReview ? 'needs-review' : ''} key={key} data-testid={`field-${key}`}>
                              <th scope="row">
                                <div className="field-label-row">
                                  <label htmlFor={`invoice-${key}`}>{fieldLabels[key]}</label>
                                  {field.needsReview && !isDemo && <span className="field-status"><AlertTriangle size={11} /> Needs review</span>}
                                </div>
                              </th>
                              <td>
                                <input
                                  id={`invoice-${key}`}
                                  type="text"
                                  value={field.value}
                                  placeholder={field.needsReview && !isDemo ? 'Unavailable — enter if known' : ''}
                                  onChange={(event) => updateField(key, event.target.value)}
                                  autoComplete="off"
                                  data-testid={`input-field-${key}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="result-footer">
                    <div className="result-caption" data-testid="text-result-editable">
                      <Check size={13} /> {isDemo ? 'Demonstration values · editable' : 'Review and edit values before use'}
                    </div>
                    <div className="result-actions">
                      <button className="secondary-button" type="button" onClick={copyFields} data-testid="button-copy-fields">
                        {copyMessage.startsWith('Fields copied') ? <Check size={14} /> : <FileText size={14} />}
                        {copyMessage.startsWith('Fields copied') ? 'Copied' : 'Copy fields'}
                      </button>
                      <button className="secondary-button" type="button" onClick={clearAll} data-testid="button-clear-results">
                        <RotateCcw size={14} /> Clear
                      </button>
                    </div>
                  </div>
                  {copyMessage && <div className="result-caption" role="status" data-testid="status-copy-fields" style={{ marginTop: 8 }}>{copyMessage}</div>}
                </>
              )}
            </section>
          )}
        </div>

        {!fields && !isProcessing && (
          <div className="empty-state" style={{ marginTop: 17 }} data-testid="status-awaiting-invoice">
            <div className="empty-art"><ShieldCheck size={17} /></div>
            <div>
              <strong>Ready when you are</strong>
              <p>Choose a PDF to begin. Invoice values appear here only after they are read from your file, or when you intentionally open the demonstration data.</p>
            </div>
          </div>
        )}
        <footer className="footer">
          <ShieldCheck size={13} /> Private by design <span>·</span> No upload, no account, no saved invoices
        </footer>
      </main>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
