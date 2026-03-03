import { useDefinitions } from '@/context/DefinitionsContext';
import { DefinitionCard } from '@/components/DefinitionCard';
import { DefinitionDetail } from '@/components/DefinitionDetail';
import { useState } from 'react';
import { Definition } from '@/lib/data';

const Browse = () => {
  const { definitions, domains } = useDefinitions();
  const [selectedDefinition, setSelectedDefinition] = useState<Definition | null>(null);

  if (selectedDefinition) {
    return (
      <DefinitionDetail
        definition={selectedDefinition}
        onBack={() => setSelectedDefinition(null)}
      />
    );
  }

  const grouped = domains.map((domain) => ({
    domain,
    definitions: definitions.filter((d) => d.domain === domain),
  })).filter((g) => g.definitions.length > 0);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Browse by Domain</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Explore definitions organized by knowledge domain
      </p>

      {grouped.map((group) => (
        <div key={group.domain} className="mb-8">
          <h2 className="text-sm font-semibold text-primary mb-3 uppercase tracking-wider">
            {group.domain}
            <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
              ({group.definitions.length})
            </span>
          </h2>
          <div className="space-y-2">
            {group.definitions.map((def) => (
              <DefinitionCard key={def.id} definition={def} onClick={() => setSelectedDefinition(def)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Browse;
