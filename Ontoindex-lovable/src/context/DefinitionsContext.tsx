import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Definition, DefinitionStatus, Source, MOCK_DEFINITIONS, MOCK_SOURCES, DOMAINS } from '@/lib/data';

interface DefinitionsContextType {
  definitions: Definition[];
  sources: Source[];
  domains: string[];
  addDefinition: (def: Omit<Definition, 'id'>) => void;
  updateDefinition: (id: string, updates: Partial<Definition>) => void;
  deleteDefinition: (id: string) => void;
  changeStatus: (id: string, status: DefinitionStatus) => void;
  addDefinitions: (defs: Omit<Definition, 'id'>[]) => void;
  addSource: (source: Omit<Source, 'id'>) => void;
}

const DefinitionsContext = createContext<DefinitionsContextType | null>(null);

let nextId = 1000;
const generateId = () => `def-${nextId++}`;

export const DefinitionsProvider = ({ children }: { children: ReactNode }) => {
  const [definitions, setDefinitions] = useState<Definition[]>(MOCK_DEFINITIONS);
  const [sources, setSources] = useState<Source[]>(MOCK_SOURCES);
  const [domains] = useState<string[]>(DOMAINS);

  const addDefinition = useCallback((def: Omit<Definition, 'id'>) => {
    setDefinitions((prev) => [...prev, { ...def, id: generateId() }]);
  }, []);

  const updateDefinition = useCallback((id: string, updates: Partial<Definition>) => {
    setDefinitions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates, lastUpdated: new Date().toISOString().slice(0, 10) } : d))
    );
  }, []);

  const deleteDefinition = useCallback((id: string) => {
    setDefinitions((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const changeStatus = useCallback((id: string, status: DefinitionStatus) => {
    setDefinitions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status, lastUpdated: new Date().toISOString().slice(0, 10) } : d))
    );
  }, []);

  const addDefinitions = useCallback((defs: Omit<Definition, 'id'>[]) => {
    const withIds = defs.map((d) => ({ ...d, id: generateId() }));
    setDefinitions((prev) => [...prev, ...withIds]);
  }, []);

  const addSource = useCallback((source: Omit<Source, 'id'>) => {
    setSources((prev) => [...prev, { ...source, id: `src-${prev.length + 1}` }]);
  }, []);

  return (
    <DefinitionsContext.Provider
      value={{ definitions, sources, domains, addDefinition, updateDefinition, deleteDefinition, changeStatus, addDefinitions, addSource }}
    >
      {children}
    </DefinitionsContext.Provider>
  );
};

export const useDefinitions = () => {
  const ctx = useContext(DefinitionsContext);
  if (!ctx) throw new Error('useDefinitions must be used within DefinitionsProvider');
  return ctx;
};
