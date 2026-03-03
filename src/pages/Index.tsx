import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DefinitionCard } from '@/components/DefinitionCard';
import { DefinitionDetail } from '@/components/DefinitionDetail';
import { DefinitionFormDialog } from '@/components/DefinitionFormDialog';
import { useDefinitions } from '@/context/DefinitionsContext';
import { Definition } from '@/lib/data';

const Index = () => {
  const { definitions, sources, domains } = useDefinitions();
  const [query, setQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedDefinition, setSelectedDefinition] = useState<Definition | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    return definitions.filter((d) => {
      const q = query.toLowerCase();
      const matchesQuery =
        !query ||
        d.term.toLowerCase().includes(q) ||
        d.definition.toLowerCase().includes(q) ||
        d.domain.toLowerCase().includes(q) ||
        (d.alternativeTerms || []).some((at) => at.toLowerCase().includes(q));
      const matchesDomain = !selectedDomain || d.domain === selectedDomain;
      return matchesQuery && matchesDomain;
    });
  }, [query, selectedDomain, definitions]);

  const stats = {
    total: definitions.length,
    approved: definitions.filter((d) => d.status === 'approved').length,
    sources: sources.length,
  };

  if (selectedDefinition) {
    return (
      <DefinitionDetail
        definition={selectedDefinition}
        onBack={() => setSelectedDefinition(null)}
      />
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="gradient-hero px-6 py-16 lg:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl lg:text-4xl font-bold text-primary-foreground mb-3 tracking-tight">
            Axioma
          </h1>
          <p className="text-primary-foreground/80 text-base mb-8">
            Ontology-grounded semantic search for organizational knowledge
          </p>

          {/* Search Bar */}
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search definitions, terms, concepts..."
              className="pl-12 pr-4 py-6 text-base rounded-xl bg-card border-0 search-glow placeholder:text-muted-foreground"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-4xl mx-auto px-6 -mt-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Definitions', value: stats.total },
            { label: 'Approved', value: stats.approved },
            { label: 'Sources', value: stats.sources },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-xl border border-border p-4 text-center card-elevated">
              <div className="text-2xl font-bold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters & Results */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Domain Filters */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <button
            onClick={() => setSelectedDomain(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              !selectedDomain ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-muted'
            }`}
          >
            All
          </button>
          {domains.map((domain) => (
            <button
              key={domain}
              onClick={() => setSelectedDomain(selectedDomain === domain ? null : domain)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedDomain === domain
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-muted'
              }`}
            >
              {domain}
            </button>
          ))}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
            {query && <span> for "{query}"</span>}
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>

        <div className="space-y-3">
          {filtered.map((def) => (
            <DefinitionCard
              key={def.id}
              definition={def}
              onClick={() => setSelectedDefinition(def)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No definitions found. Try a different search term.</p>
            </div>
          )}
        </div>
      </div>

      {showAdd && <DefinitionFormDialog open={showAdd} onClose={() => setShowAdd(false)} />}
    </div>
  );
};

export default Index;
