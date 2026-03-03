import { Definition } from '@/lib/data';
import { useDefinitions } from '@/context/DefinitionsContext';
import { StatusBadge } from './StatusBadge';
import { ArrowLeft, ExternalLink, Link2, Clock, User, Edit, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DefinitionFormDialog } from './DefinitionFormDialog';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { DefinitionStatus } from '@/lib/data';

interface DefinitionDetailProps {
  definition: Definition;
  onBack: () => void;
}

const STATUS_FLOW: Record<DefinitionStatus, DefinitionStatus | null> = {
  draft: 'in_review',
  in_review: 'approved',
  approved: null,
};

const STATUS_ACTION_LABEL: Record<DefinitionStatus, string> = {
  draft: 'Submit for Review',
  in_review: 'Approve',
  approved: '',
};

export const DefinitionDetail = ({ definition, onBack }: DefinitionDetailProps) => {
  const { definitions, changeStatus, deleteDefinition } = useDefinitions();
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();

  const relatedDefs = definitions.filter((d) =>
    definition.relatedTerms.some((rt) => d.term.toLowerCase() === rt.toLowerCase())
  );

  const nextStatus = STATUS_FLOW[definition.status];

  const handleDelete = () => {
    deleteDefinition(definition.id);
    toast({ title: 'Definition deleted' });
    onBack();
  };

  const handleStatusChange = () => {
    if (nextStatus) {
      changeStatus(definition.id, nextStatus);
      toast({ title: `Status changed to ${nextStatus.replace('_', ' ')}` });
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to search
      </button>

      <div className="bg-card rounded-xl border border-border p-8 card-elevated">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-2xl font-bold text-foreground">{definition.term}</h1>
          <div className="flex items-center gap-2">
            <StatusBadge status={definition.status} />
            <Button size="icon" variant="ghost" onClick={() => setEditing(true)}>
              <Edit className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {definition.alternativeTerms && definition.alternativeTerms.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {definition.alternativeTerms.map((at) => (
              <span key={at} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                aka: {at}
              </span>
            ))}
          </div>
        )}

        <p className="text-base text-foreground/80 leading-relaxed mb-6">
          {definition.definition}
        </p>

        {definition.notes && (
          <div className="bg-surface-sunken rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground italic">{definition.notes}</p>
          </div>
        )}

        {/* Status workflow */}
        {nextStatus && (
          <div className="mb-6">
            <Button size="sm" variant="outline" onClick={handleStatusChange}>
              <ChevronRight className="w-4 h-4" />
              {STATUS_ACTION_LABEL[definition.status]}
            </Button>
          </div>
        )}

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link2 className="w-4 h-4" />
            <span>Source: </span>
            {definition.sourceUrl ? (
              <a href={definition.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                {definition.source} <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-foreground">{definition.source}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md text-xs font-medium">
              {definition.domain}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>Updated: {definition.lastUpdated}</span>
          </div>
          {definition.author && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span>{definition.author}</span>
            </div>
          )}
        </div>

        {/* Related Terms */}
        {definition.relatedTerms.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Related Terms</h3>
            <div className="flex flex-wrap gap-2">
              {definition.relatedTerms.map((rt) => {
                const linked = relatedDefs.find((d) => d.term.toLowerCase() === rt.toLowerCase());
                return (
                  <span
                    key={rt}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      linked
                        ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20 transition-colors'
                        : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {rt}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <DefinitionFormDialog
          open={editing}
          onClose={() => setEditing(false)}
          existing={definition}
        />
      )}
    </div>
  );
};
