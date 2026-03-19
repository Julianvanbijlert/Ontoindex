import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Network, Search as SearchIcon, X } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSearchHistory,
  fetchSearchOptions,
  filterSearchHistory,
  saveSearchHistory,
  searchEntities,
  type SearchHistoryEntry,
  type SearchResultItem,
  type SearchSort,
} from "@/lib/search-service";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { PriorityBadge, StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export default function SearchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [ontologyFilter, setOntologyFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "definition" | "ontology">("all");
  const [sortBy, setSortBy] = useState<SearchSort>("relevance");
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [highlightedHistoryIndex, setHighlightedHistoryIndex] = useState(-1);
  const [ontologies, setOntologies] = useState<Array<{ id: string; title: string }>>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [hasSubmittedSearch, setHasSubmittedSearch] = useState(false);

  const hasActiveSearch = Boolean(
    query.trim() ||
      statusFilter !== "all" ||
      ontologyFilter !== "all" ||
      tagFilter !== "all" ||
      typeFilter !== "all",
  );
  const historySuggestions = filterSearchHistory(searchHistory, query).slice(0, 6);

  const refreshHistory = async () => {
    if (!user) {
      return;
    }

    const history = await fetchSearchHistory(supabase, user.id);
    setSearchHistory(history);
  };

  const performSearch = async (overrideQuery?: string) => {
    const nextQuery = overrideQuery ?? query;

    if (!nextQuery.trim() && !hasActiveSearch) {
      setResults([]);
      return;
    }

    setLoading(true);

    try {
      const data = await searchEntities(
        supabase,
        nextQuery,
        {
          ontologyId: ontologyFilter,
          tag: tagFilter,
          status: statusFilter,
          type: typeFilter,
        },
        sortBy,
      );

      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSearchOptions(supabase).then((options) => {
      setOntologies(options.ontologies);
      setAvailableTags(options.tags);
    });
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [user]);

  useEffect(() => {
    if (!hasActiveSearch) {
      setResults([]);
      return;
    }

    performSearch();
  }, [query, statusFilter, ontologyFilter, tagFilter, typeFilter, sortBy]);

  const handleSubmitSearch = async (explicitQuery?: string) => {
    const nextQuery = explicitQuery ?? query;

    if (!nextQuery.trim()) {
      return;
    }

    setHasSubmittedSearch(true);
    setShowHistory(false);
    setHighlightedHistoryIndex(-1);
    await performSearch(nextQuery);

    if (user) {
      await saveSearchHistory(supabase, nextQuery, {
        status: statusFilter,
        ontologyId: ontologyFilter,
        tag: tagFilter,
        type: typeFilter,
        sortBy,
      });
      await refreshHistory();
    }
  };

  const clearHistory = async (historyId: string) => {
    await supabase.from("search_history").delete().eq("id", historyId);
    setSearchHistory((previous) => previous.filter((item) => item.id !== historyId));
  };

  const handleHistoryKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (showHistory && historySuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedHistoryIndex((current) => (current + 1) % historySuggestions.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedHistoryIndex((current) => (current <= 0 ? historySuggestions.length - 1 : current - 1));
        return;
      }

      if (event.key === "Enter" && highlightedHistoryIndex >= 0) {
        event.preventDefault();
        const selectedHistory = historySuggestions[highlightedHistoryIndex];
        setQuery(selectedHistory.query);
        await handleSubmitSearch(selectedHistory.query);
        return;
      }

      if (event.key === "Escape") {
        setShowHistory(false);
        setHighlightedHistoryIndex(-1);
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      await handleSubmitSearch();
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Search</h1>
        <p className="text-muted-foreground mt-1">Find definitions and whole ontologies from one place</p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search definitions and ontologies..."
              className="pl-9"
              value={query}
              onFocus={() => setShowHistory(searchHistory.length > 0)}
              onBlur={() => {
                window.setTimeout(() => {
                  setShowHistory(false);
                  setHighlightedHistoryIndex(-1);
                }, 100);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowHistory(true);
                setHighlightedHistoryIndex(-1);
              }}
              onKeyDown={handleHistoryKeyDown}
            />

            {showHistory && historySuggestions.length > 0 && (
              <Card className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 border-border/50 shadow-lg">
                <CardContent className="p-2">
                  <div className="space-y-1">
                    {historySuggestions.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                          index === highlightedHistoryIndex ? "bg-muted text-foreground" : "hover:bg-muted/60 text-muted-foreground",
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={async () => {
                          setQuery(item.query);
                          await handleSubmitSearch(item.query);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          {item.query}
                        </span>
                        <X
                          className="h-3.5 w-3.5"
                          onClick={async (event) => {
                            event.stopPropagation();
                            await clearHistory(item.id);
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <Button onClick={() => handleSubmitSearch()}>Search</Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Select value={ontologyFilter} onValueChange={setOntologyFilter}>
            <SelectTrigger><SelectValue placeholder="Ontology" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ontologies</SelectItem>
              {ontologies.map((ontology) => (
                <SelectItem key={ontology.id} value={ontology.id}>{ontology.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {availableTags.map((tag) => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="definition">Definitions</SelectItem>
              <SelectItem value="ontology">Ontologies</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SearchSort)}>
            <SelectTrigger><SelectValue placeholder="Sort by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="views">Most Viewed</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full rounded-lg" />)}</div>
      ) : hasSubmittedSearch && results.length === 0 ? (
        <EmptyState
          icon={<SearchIcon className="w-6 h-6" />}
          title="No results"
          description={`No definitions or ontologies matched "${query}".`}
        />
      ) : (
        <div className="space-y-2">
          {results.map((result) => (
            <Card
              key={`${result.type}-${result.id}`}
              className="border-border/50 hover:border-border transition-colors cursor-pointer"
              onClick={() => navigate(result.type === "ontology" ? `/ontologies/${result.id}` : `/definitions/${result.id}`)}
            >
              <CardContent className="p-4">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="font-medium text-foreground">{result.title}</h3>
                  <Badge variant="outline" className="text-[10px]">
                    {result.type === "ontology" ? "Ontology" : "Definition"}
                  </Badge>
                  <StatusBadge status={result.status} />
                  {result.type === "definition" && <PriorityBadge priority={result.priority} />}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{result.description || "No description"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {result.type === "definition" && result.ontologyTitle && (
                    <span className="inline-flex items-center gap-1">
                      <Network className="h-3 w-3" />
                      {result.ontologyTitle}
                    </span>
                  )}
                  {result.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                  <span>{result.viewCount} views</span>
                  <span>{new Date(result.updatedAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
