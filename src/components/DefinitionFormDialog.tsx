import { useState } from 'react';
import { Definition, DefinitionStatus } from '@/lib/data';
import { useDefinitions } from '@/context/DefinitionsContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DefinitionFormDialogProps {
  open: boolean;
  onClose: () => void;
  existing?: Definition;
}

export const DefinitionFormDialog = ({ open, onClose, existing }: DefinitionFormDialogProps) => {
  const { addDefinition, updateDefinition, domains } = useDefinitions();
  const [term, setTerm] = useState(existing?.term || '');
  const [definition, setDefinition] = useState(existing?.definition || '');
  const [domain, setDomain] = useState(existing?.domain || domains[0]);
  const [source, setSource] = useState(existing?.source || 'Manual');
  const [status, setStatus] = useState<DefinitionStatus>(existing?.status || 'draft');
  const [relatedTerms, setRelatedTerms] = useState(existing?.relatedTerms.join(', ') || '');
  const [notes, setNotes] = useState(existing?.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !definition.trim()) return;
    const data = {
      term: term.trim(),
      definition: definition.trim(),
      source: source.trim() || 'Manual',
      status,
      domain,
      relatedTerms: relatedTerms.split(',').map((t) => t.trim()).filter(Boolean),
      lastUpdated: new Date().toISOString().slice(0, 10),
      notes: notes.trim() || undefined,
    };
    if (existing) {
      updateDefinition(existing.id, data);
    } else {
      addDefinition(data);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Definition' : 'Add Definition'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Term *</label>
            <Input value={term} onChange={(e) => setTerm(e.target.value)} required maxLength={200} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Definition *</label>
            <Textarea value={definition} onChange={(e) => setDefinition(e.target.value)} required rows={3} maxLength={2000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Domain</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
              >
                {domains.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DefinitionStatus)}
                className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
              >
                <option value="draft">Draft</option>
                <option value="in_review">In Review</option>
                <option value="approved">Approved</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Source</label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Related Terms (comma-separated)</label>
            <Input value={relatedTerms} onChange={(e) => setRelatedTerms(e.target.value)} maxLength={500} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{existing ? 'Save Changes' : 'Add Definition'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
