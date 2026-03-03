import { useDefinitions } from '@/context/DefinitionsContext';
import { ExternalLink, RefreshCw, Database, Upload, Edit } from 'lucide-react';

const sourceTypeIcon = {
  api: Database,
  upload: Upload,
  manual: Edit,
};

const Sources = () => {
  const { sources } = useDefinitions();

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Connected Sources</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Data sources feeding into the Axioma index
      </p>

      <div className="space-y-3">
        {sources.map((source) => {
          const Icon = sourceTypeIcon[source.type];
          return (
            <div key={source.id} className="bg-card rounded-xl border border-border p-5 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">{source.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{source.termCount} terms</span>
                    <span>Last synced: {source.lastSynced}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {source.url && (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Sources;
