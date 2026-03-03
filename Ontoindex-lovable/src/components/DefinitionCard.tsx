import { Definition } from '@/lib/data';
import { StatusBadge } from './StatusBadge';
import { ArrowRight, ExternalLink } from 'lucide-react';

interface DefinitionCardProps {
  definition: Definition;
  onClick?: () => void;
}

export const DefinitionCard = ({ definition, onClick }: DefinitionCardProps) => {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card rounded-xl border border-border p-5 hover:shadow-lg transition-all duration-200 hover:border-primary/30 group animate-fade-in"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
          {definition.term}
        </h3>
        <StatusBadge status={definition.status} />
      </div>
      <p className="text-sm text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
        {definition.definition}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md font-medium">
            {definition.domain}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {definition.sourceUrl ? <ExternalLink className="w-3 h-3" /> : null}
            {definition.source}
          </span>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
    </button>
  );
};
