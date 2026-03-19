import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Network, Search as SearchIcon, X, LayoutGrid, List, SlidersHorizontal, Eye } from "lucide-react";

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
import { subscribeToAppDataChanges } from "@/lib/entity-events";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SearchPage() {
  const { user, profile } = useAuth();
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

  // Viewer Settings
  const [viewSize, setViewSize] = useState<"small" | "medium" | "large">(profile?.view_preference as any || "medium");
  const [viewFormat, setViewFormat] = useState<"grid" | "table">(profile?.format_preference as any || "grid");

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
      let data = await searchEntities(
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

      // Merge localStorage definitions for the demo
      try {
        const localGlobal = JSON.parse(localStorage.getItem("mock_db_definitions_global") || "[]");
        if (localGlobal.length > 0) {
          const normalizedQuery = nextQuery.toLowerCase().trim();
          const localResults = localGlobal
            .filter((d: any) => {
              if (normalizedQuery && 
                  !d.title.toLowerCase().includes(normalizedQuery) && 
                  !d.description.toLowerCase().includes(normalizedQuery)) return false;
              if (statusFilter !== "all" && d.status !== statusFilter) return false;
              if (ontologyFilter !== "all" && ontologyFilter !== "global") return false;
              return true;
            })
            .map((d: any) => ({
              id: d.id,
              type: "definition" as const,
              title: d.title,
              description: d.description,
              status: d.status,
              updatedAt: d.updated_at,
              viewCount: d.view_count || 0,
              tags: d.tags || [],
              ontologyId: "global",
              ontologyTitle: "Imported",
              relevance: 1 // Default high relevance for local matches
            }));
          data = [...data, ...localResults];
          
          // Sort by relevance after merge
          data.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
        }
      } catch (e) {
        console.warn("Local search merge failed", e);
      }

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

  useEffect(() => {
    return subscribeToAppDataChanges(() => {
      fetchSearchOptions(supabase).then((options) => {
        setOntologies(options.ontologies);
        setAvailableTags(options.tags);
      });

      if (hasActiveSearch) {
        performSearch();
      }
    });
  }, [query, statusFilter, ontologyFilter, tagFilter, typeFilter, sortBy, hasActiveSearch]);

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
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Search</h1>
          <p className="text-muted-foreground mt-1 text-sm">Find definitions and whole ontologies from one place</p>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/50">
            <Button variant={viewFormat === "grid" ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setViewFormat("grid")}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button variant={viewFormat === "table" ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setViewFormat("table")}>
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Tabs value={viewSize} onValueChange={v => setViewSize(v as any)}>
            <TabsList className="h-7 bg-muted/40 border border-border/50">
              <TabsTrigger value="small" className="text-[9px] px-2 h-5">S</TabsTrigger>
              <TabsTrigger value="medium" className="text-[9px] px-2 h-5">M</TabsTrigger>
              <TabsTrigger value="large" className="text-[9px] px-2 h-5">L</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="space-y-4 bg-card p-5 rounded-xl border border-border/50 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search definitions and ontologies..."
              className="pl-9 h-11"
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

          <Button onClick={() => handleSubmitSearch()} className="h-11 px-8">Search</Button>
        </div>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5 pt-2">
          <Select value={ontologyFilter} onValueChange={setOntologyFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ontology" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ontologies</SelectItem>
              {ontologies.map((ontology) => (
                <SelectItem key={ontology.id} value={ontology.id}>{ontology.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {availableTags.map((tag) => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
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
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="definition">Definitions</SelectItem>
              <SelectItem value="ontology">Ontologies</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SearchSort)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Sort by" /></SelectTrigger>
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
        <div className="grid gap-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full rounded-lg" />)}</div>
      ) : hasSubmittedSearch && results.length === 0 ? (
        <EmptyState
          icon={<SearchIcon className="w-6 h-6" />}
          title="No results found"
          description={`We couldn't find anything matching "${query}" with current filters.`}
        />
      ) : (
        <div className={cn(
          "gap-4",
          viewFormat === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "flex flex-col"
        )}>
          {results.map((result) => (
            <Card
              key={`${result.type}-${result.id}`}
              className={cn(
                "group border-border/50 hover:border-primary/50 transition-all cursor-pointer overflow-hidden",
                viewSize === "small" ? "p-0" : ""
              )}
              onClick={() => navigate(result.type === "ontology" ? `/ontologies/${result.id}` : `/definitions/${result.id}`)}
            >
              <CardContent className={cn(
                "flex flex-col gap-3",
                viewSize === "small" ? "p-3" : viewSize === "large" ? "p-6" : "p-4"
              )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className={cn("font-semibold text-foreground group-hover:text-primary transition-colors", viewSize === "large" ? "text-lg" : "text-sm")}>
                      {result.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <Badge variant="outline" className="text-[9px] px-1 h-3.5 bg-muted/30">
                        {result.type === "ontology" ? "Ontology" : "Definition"}
                      </Badge>
                      <StatusBadge status={result.status} />
                      {result.type === "definition" && result.priority && <PriorityBadge priority={result.priority as any} />}
                    </div>
                  </div>
                </div>

                <p className={cn(
                  "text-muted-foreground line-clamp-2",
                  viewSize === "small" ? "text-xs" : "text-sm"
                )}>
                  {result.description || "No description provided"}
                </p>

                <div className="flex items-center justify-between mt-1 pt-2 border-t border-border/50">
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                    {result.type === "definition" && result.ontologyTitle && (
                      <span className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded">
                        <Network className="h-3 w-3" />
                        {result.ontologyTitle}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{result.viewCount}</span>
                    <span>{new Date(result.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-1">
                    {result.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[9px] px-1 h-3.5">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
