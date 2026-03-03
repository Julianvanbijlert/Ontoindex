import { useState } from 'react';
import { useDefinitions } from '@/context/DefinitionsContext';
import { ArrowLeftRight } from 'lucide-react';

const Compare = () => {
  const { definitions, sources } = useDefinitions();
  const [sourceA, setSourceA] = useState(sources[0]?.name || '');
  const [sourceB, setSourceB] = useState(sources[1]?.name || '');

  const defsA = definitions.filter((d) => d.source === sourceA);
  const defsB = definitions.filter((d) => d.source === sourceB);

  const sharedTerms = defsA.filter((a) => defsB.some((b) => b.term.toLowerCase() === a.term.toLowerCase()));
  const onlyA = defsA.filter((a) => !defsB.some((b) => b.term.toLowerCase() === a.term.toLowerCase()));
  const onlyB = defsB.filter((b) => !defsA.some((a) => a.term.toLowerCase() === b.term.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Compare Sources</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Find overlaps and gaps between knowledge sources
      </p>

      {/* Source Selectors */}
      <div className="flex items-center gap-4 mb-8">
        <select
          value={sourceA}
          onChange={(e) => setSourceA(e.target.value)}
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
        <ArrowLeftRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        <select
          value={sourceB}
          onChange={(e) => setSourceB(e.target.value)}
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Results */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-foreground">{sharedTerms.length}</div>
          <div className="text-xs text-muted-foreground">Shared</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-primary">{onlyA.length}</div>
          <div className="text-xs text-muted-foreground">Only in {sourceA.split(' ')[0]}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-accent">{onlyB.length}</div>
          <div className="text-xs text-muted-foreground">Only in {sourceB.split(' ')[0]}</div>
        </div>
      </div>

      {/* Shared definitions with side-by-side comparison */}
      {sharedTerms.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Shared Terms — Side-by-Side</h3>
          <div className="space-y-3">
            {sharedTerms.map((a) => {
              const b = defsB.find((d) => d.term.toLowerCase() === a.term.toLowerCase())!;
              const same = a.definition === b.definition;
              return (
                <div key={a.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground text-sm">{a.term}</span>
                    {same ? (
                      <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded">Identical</span>
                    ) : (
                      <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded">Differs</span>
                    )}
                  </div>
                  {!same && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-surface-sunken rounded p-2">
                        <span className="font-medium text-primary block mb-1">{sourceA}</span>
                        <span className="text-muted-foreground">{a.definition}</span>
                      </div>
                      <div className="bg-surface-sunken rounded p-2">
                        <span className="font-medium text-accent block mb-1">{sourceB}</span>
                        <span className="text-muted-foreground">{b.definition}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {onlyA.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Unique to {sourceA}</h3>
          <div className="space-y-2">
            {onlyA.map((d) => (
              <div key={d.id} className="bg-card border border-border rounded-lg p-3 text-sm">
                <span className="font-medium text-foreground">{d.term}</span>
                <span className="text-muted-foreground ml-2">— {d.definition.slice(0, 100)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {onlyB.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Unique to {sourceB}</h3>
          <div className="space-y-2">
            {onlyB.map((d) => (
              <div key={d.id} className="bg-card border border-border rounded-lg p-3 text-sm">
                <span className="font-medium text-foreground">{d.term}</span>
                <span className="text-muted-foreground ml-2">— {d.definition.slice(0, 100)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Compare;
