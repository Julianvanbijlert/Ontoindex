import { useState, useRef, useCallback } from 'react';
import { Upload as UploadIcon, FileText, AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDefinitions } from '@/context/DefinitionsContext';
import { Definition, DefinitionStatus } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';

interface ParsedRow {
  term: string;
  definition: string;
  domain?: string;
  source?: string;
  status?: string;
  relatedTerms?: string;
}

const parseCSV = (text: string): ParsedRow[] => {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  return lines.slice(1).map((line) => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += char; }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return {
      term: row['term'] || row['naam'] || row['name'] || '',
      definition: row['definition'] || row['definitie'] || row['description'] || '',
      domain: row['domain'] || row['domein'] || '',
      source: row['source'] || row['bron'] || '',
      status: row['status'] || 'draft',
      relatedTerms: row['relatedterms'] || row['gerelateerd'] || '',
    };
  }).filter((r) => r.term && r.definition);
};

const parseJSON = (text: string): ParsedRow[] => {
  try {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : data.definitions || data.terms || [data];
    return arr.map((item: any) => ({
      term: item.term || item.naam || item.name || '',
      definition: item.definition || item.definitie || item.description || '',
      domain: item.domain || item.domein || '',
      source: item.source || item.bron || '',
      status: item.status || 'draft',
      relatedTerms: Array.isArray(item.relatedTerms) ? item.relatedTerms.join(', ') : (item.relatedTerms || ''),
    })).filter((r: ParsedRow) => r.term && r.definition);
  } catch {
    return [];
  }
};

const UploadPage = () => {
  const { addDefinitions, addSource } = useDefinitions();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const processFile = useCallback((file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum 10MB', variant: 'destructive' });
      return;
    }
    setFileName(file.name);
    setImported(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      let rows: ParsedRow[] = [];
      if (file.name.endsWith('.csv')) rows = parseCSV(text);
      else if (file.name.endsWith('.json')) rows = parseJSON(text);
      else {
        toast({ title: 'Unsupported format', description: 'Use CSV or JSON files', variant: 'destructive' });
        return;
      }
      if (rows.length === 0) {
        toast({ title: 'No definitions found', description: 'Check file format', variant: 'destructive' });
        return;
      }
      setParsed(rows);
      toast({ title: `${rows.length} definitions parsed`, description: `From ${file.name}` });
    };
    reader.readAsText(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleImport = () => {
    setImporting(true);
    const today = new Date().toISOString().slice(0, 10);
    const defs: Omit<Definition, 'id'>[] = parsed.map((r) => ({
      term: r.term,
      definition: r.definition,
      source: r.source || fileName,
      status: (['draft', 'in_review', 'approved'].includes(r.status || '') ? r.status : 'draft') as DefinitionStatus,
      domain: r.domain || 'Uncategorized',
      relatedTerms: r.relatedTerms ? r.relatedTerms.split(',').map((t) => t.trim()).filter(Boolean) : [],
      lastUpdated: today,
      author: 'Upload',
    }));
    setTimeout(() => {
      addDefinitions(defs);
      addSource({
        name: fileName.replace(/\.[^.]+$/, ''),
        url: '',
        termCount: defs.length,
        lastSynced: today,
        type: 'upload',
      });
      setImporting(false);
      setImported(true);
      toast({ title: 'Import complete', description: `${defs.length} definitions added to the index` });
    }, 500);
  };

  const clearParsed = () => {
    setParsed([]);
    setFileName('');
    setImported(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Upload Definitions</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Import definitions from CSV or JSON files into the Axioma index
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
        }}
      />

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer bg-surface-sunken ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
        }`}
      >
        <UploadIcon className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
        <p className="text-sm font-medium text-foreground mb-1">
          Drop files here or click to browse
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Supports CSV and JSON (max 10MB)
        </p>
      </div>

      {/* Parsed Preview */}
      {parsed.length > 0 && (
        <div className="mt-6 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Preview — {parsed.length} definitions from {fileName}
            </h3>
            <button onClick={clearParsed} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-card border border-border rounded-xl max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Term</th>
                  <th className="px-3 py-2 font-medium">Definition</th>
                  <th className="px-3 py-2 font-medium">Domain</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{r.term}</td>
                    <td className="px-3 py-2 text-muted-foreground line-clamp-1 max-w-[200px]">{r.definition}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.domain || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.status || 'draft'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 20 && (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t border-border">
                ...and {parsed.length - 20} more
              </div>
            )}
          </div>

          <Button
            onClick={handleImport}
            disabled={importing || imported}
            className="mt-4 w-full"
          >
            {importing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
            ) : imported ? (
              <><CheckCircle2 className="w-4 h-4" /> Imported {parsed.length} definitions</>
            ) : (
              <>Import {parsed.length} definitions into Axioma</>
            )}
          </Button>
        </div>
      )}

      {/* Supported Formats */}
      <div className="mt-8 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Supported Formats</h3>
        {[
          { format: 'CSV', desc: 'Columns: term, definition, domain, source, status, relatedTerms' },
          { format: 'JSON', desc: 'Array of definition objects or { definitions: [...] }' },
        ].map((f) => (
          <div key={f.format} className="flex items-start gap-3 bg-card rounded-lg border border-border p-3">
            <FileText className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-sm font-medium text-foreground">{f.format}</span>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-info/10 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Tip:</strong> Dutch column names (term, definitie, domein, bron, gerelateerd) are also supported.
        </p>
      </div>
    </div>
  );
};

export default UploadPage;
