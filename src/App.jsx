import { useState } from 'react'
import { Search, Database, Layers, ShieldCheck, Activity, Share2, AlertCircle, LogOut, User, ClipboardCheck, BarChart3, Book, Settings, Users, Sparkles } from 'lucide-react'
import { AuthViews } from './components/AuthViews'
import { DashboardView } from './components/DashboardView'
import './App.css'

function App() {
  const [view, setView] = useState('landing') // 'landing', 'results', 'registry', 'login', 'dashboard'
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('onto_user')
    return savedUser ? JSON.parse(savedUser) : null
  })

  const handleLoginSuccess = () => {
    const savedUser = localStorage.getItem('onto_user')
    setUser(savedUser ? JSON.parse(savedUser) : null)
    setView('dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('onto_token')
    localStorage.removeItem('onto_user')
    setUser(null)
    setView('landing')
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    if (!user) {
      alert("Please sign in to search through your ontologies.")
      setView('login')
      return
    }

    setView('results')
    setSearchLoading(true)
    try {
      const token = localStorage.getItem('onto_token')
      const res = await fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setSearchResults(data)
    } catch (err) {
      console.error(err)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  return (
    <div className="app-container">
      {/* Navigation */}
      <header className="main-header">
        <div className="container flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setView('landing')}
          >
            <div style={{ background: 'var(--accent-gradient)', padding: '0.4rem', borderRadius: '8px' }}>
              <Database size={24} color="white" />
            </div>
            <span className="h3" style={{ margin: 0 }}>OntoIndex</span>
          </div>

          <nav className="nav-links">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted">Welcome, {user.username}</span>
                <button
                  className="btn btn-primary flex items-center gap-2"
                  onClick={() => setView('profile')}
                >
                  <User size={16} /> Profile
                </button>
                <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }}></div>
                <button
                  className="btn btn-secondary"
                  title="System Settings"
                  onClick={() => setView('settings')}
                >
                  <Settings size={16} />
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setView('login')}
              >
                Sign In
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        <div className="sidebar-layout">
          <aside className="sidebar">
            <nav className="sidebar-nav" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="text-xs font-bold text-muted uppercase tracking-widest mb-2 px-4">Discovery</div>
              <a href="#" className={`sidebar-link ${view === 'landing' || view === 'results' ? 'active' : ''}`} onClick={() => setView('landing')}><Search size={18} /> Semantic Search</a>
              <a href="#" className={`sidebar-link ${view === 'glossary' ? 'active' : ''}`} onClick={() => setView('glossary')}><Book size={18} /> Global Glossary</a>

              <div className="text-xs font-bold text-muted uppercase tracking-widest mt-6 mb-2 px-4">Management</div>
              <a href="#" className={`sidebar-link ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}><Layers size={18} /> Workspaces</a>
              <a href="#" className={`sidebar-link ${view === 'registry' ? 'active' : ''}`} onClick={() => setView('registry')}><ShieldCheck size={18} /> Ingestion Nodes</a>
              <a href="#" className={`sidebar-link ${view === 'review' ? 'active' : ''}`} onClick={() => setView('review')}><ClipboardCheck size={18} /> Review Queue</a>

              <div className="text-xs font-bold text-muted uppercase tracking-widest mt-6 mb-2 px-4">Engineering</div>
              <a href="#" className={`sidebar-link ${view === 'analytics' ? 'active' : ''}`} onClick={() => setView('analytics')}><BarChart3 size={18} /> Analytics</a>
              <a href="#" className={`sidebar-link ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}><Settings size={18} /> API Configuration</a>

              <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', marginLeft: '0.5rem', marginRight: '0.5rem' }}>
                <a href="#" className={`sidebar-link ${view === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}><User size={18} /> Profile Settings</a>
                <button onClick={handleLogout} className="sidebar-link w-full text-left" style={{ color: 'var(--accent-danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}><LogOut size={18} /> Sign Out</button>
              </div>
            </nav>
          </aside>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {view === 'landing' && (
              <LandingView
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                handleSearch={handleSearch}
              />
            )}

            {view === 'results' && (
              <ResultsView
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                handleSearch={handleSearch}
                results={searchResults}
                loading={searchLoading}
              />
            )}

            {view === 'registry' && <RegistryView />}

            {view === 'glossary' && <GlossaryView />}

            {view === 'analytics' && <AnalyticsView />}

            {view === 'review' && user && <ReviewQueueView />}

            {view === 'login' && <AuthViews onLoginSuccess={handleLoginSuccess} />}

            {view === 'dashboard' && user && (
              <DashboardView onLogout={handleLogout} />
            )}

            {view === 'profile' && user && <ProfileView user={user} onLogout={handleLogout} />}

            {view === 'settings' && user && <SettingsView />}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', padding: '2rem 0', marginTop: '4rem' }}>
        <div className="container flex items-center justify-between text-muted text-mono">
          <span>&copy; 2026 OntoIndex. Federated Discovery Layer.</span>
          <div className="flex gap-4">
            <span>Status: All Systems Operational</span>
            <span>Index Size: 42.8M Triples</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function LandingView({ searchQuery, setSearchQuery, handleSearch }) {
  return (
    <div className="container animate-fade-in">
      <section className="hero-section">
        <div className="badge badge-primary" style={{ marginBottom: '1.5rem' }}>
          Federated Search Engine
        </div>
        <h1 className="h1" style={{ marginBottom: '1rem' }}>
          Find anything across <br /> every ontology.
        </h1>
        <p className="text-muted" style={{ fontSize: '1.25rem', maxWidth: '600px', marginBottom: '1rem' }}>
          The canonical discovery and semantic search layer for distributed ontologies.
          Stop recreating definitions. Start reusing knowledge.
        </p>

        <form className="search-container animate-delay-1" onSubmit={handleSearch}>
          <div className="search-input-wrapper">
            <Search className="search-icon" size={24} />
            <input
              type="text"
              className="input search-input"
              placeholder="Search concepts, properties, or terms (e.g., 'Carbon Emission', 'Person')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="filter-pills">
            <span className="filter-pill active">All Domains</span>
            <span className="filter-pill">BioScience</span>
            <span className="filter-pill">Finance</span>
            <span className="filter-pill">ESG</span>
            <span className="filter-pill">Schema.org</span>
          </div>
        </form>

        <div className="dashboard-grid animate-delay-2" style={{ marginTop: '4rem', textAlign: 'left', width: '100%' }}>
          <div className="glass-panel hover-card" style={{ padding: '2rem' }}>
            <Layers color="var(--accent-secondary)" size={32} style={{ marginBottom: '1rem' }} />
            <h3 className="h3" style={{ marginBottom: '0.5rem' }}>Federated Index</h3>
            <p className="text-muted text-sm">
              Crawling GitHub repos, SPARQL endpoints, and static RDF files to create a unified search layer.
            </p>
          </div>
          <div className="glass-panel hover-card" style={{ padding: '2rem' }}>
            <Share2 color="var(--accent-primary)" size={32} style={{ marginBottom: '1rem' }} />
            <h3 className="h3" style={{ marginBottom: '0.5rem' }}>Cross-Ontology Mappings</h3>
            <p className="text-muted text-sm">
              Vector similarity detects overlap and suggests alignments intelligently using sentence-transformers.
            </p>
          </div>
          <div className="glass-panel hover-card" style={{ padding: '2rem' }}>
            <ShieldCheck color="var(--accent-success)" size={32} style={{ marginBottom: '1rem' }} />
            <h3 className="h3" style={{ marginBottom: '0.5rem' }}>Trust Signals</h3>
            <p className="text-muted text-sm">
              Rank concepts based on broad ecosystem adoption, publisher authority, and SHACL validation status.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function ResultsView({ searchQuery, setSearchQuery, handleSearch, results, loading }) {
  const [showGraph, setShowGraph] = useState(false)
  const [selectedGraphNode, setSelectedGraphNode] = useState(null)

  const handleViewGraph = (res) => {
    setSelectedGraphNode(res)
    setShowGraph(true)
  }

  return (
    <div className="container animate-fade-in search-results-layout">
      {/* Search Bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: '2rem' }}>
        <div className="search-input-wrapper" style={{ maxWidth: '800px' }}>
          <Search className="search-icon" size={20} />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: '3rem', fontSize: '1.05rem' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </form>

      <div className="content-grid">
        {/* Sidebar Filters */}
        <aside>
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 className="h3" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Filters</h3>

            <div style={{ marginBottom: '1.5rem' }}>
              <div className="text-muted text-sm" style={{ marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Type</div>
              <label className="flex items-center gap-2" style={{ marginBottom: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked /> Classes
              </label>
              <label className="flex items-center gap-2" style={{ marginBottom: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked /> Properties
              </label>
              <label className="flex items-center gap-2" style={{ marginBottom: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" /> Individuals
              </label>
            </div>

            <div>
              <div className="text-muted text-sm" style={{ marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Match Strategy</div>
              <label className="flex items-center gap-2" style={{ marginBottom: '0.5rem', cursor: 'pointer' }}>
                <input type="radio" name="strategy" defaultChecked /> Hybrid (Vector + Keyword)
              </label>
              <label className="flex items-center gap-2" style={{ marginBottom: '0.5rem', cursor: 'pointer' }}>
                <input type="radio" name="strategy" /> Exact URI Match
              </label>
            </div>
          </div>
        </aside>

        {/* Results Stream */}
        <div>
          <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
            <span className="text-muted">
              {loading ? (
                `Searching your ontologies for "${searchQuery}"...`
              ) : (
                `Found ${results?.length || 0} user concepts for "${searchQuery}"`
              )}
            </span>
          </div>

          <div className="flex-col gap-4">
            {!loading && (!results || results.length === 0) && (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-subtle)' }}>
                <p>No results found in your uploaded ontologies.</p>
              </div>
            )}
            {!loading && results && results.map((res, i) => (
              <div key={res.id} className={`result-card animate-fade-in animate-delay-${Math.min(i + 1, 5)}`} style={{ position: 'relative' }}>
                {res.hasConflict && (
                  <div style={{ position: 'absolute', top: '-10px', right: '10px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.2rem 0.8rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} /> Conflict Detected
                  </div>
                )}
                <div className="flex justify-between items-start" style={{ marginBottom: '0.5rem' }}>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${res.type === 'Class' ? 'badge-primary' : 'badge-outline'}`}>{res.type}</span>
                    <h2 className="h2" style={{ fontSize: '1.4rem' }}>{res.label}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge badge-outline" style={{ border: '1px solid rgba(16, 185, 129, 0.5)', color: 'var(--accent-success)' }}>
                      Trust: {res.trust} (Own Data)
                    </span>
                  </div>
                </div>

                <div className="text-mono text-muted" style={{ marginBottom: '1rem', fontSize: '0.8rem', display: 'flex', gap: '1rem' }}>
                  <span>{res.uri}</span>
                  {res.domain && <span style={{ color: 'var(--accent-secondary)' }}>Domain: {res.domain}</span>}
                </div>

                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
                  {res.definition}
                </p>

                {res.notes && (
                  <div style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.02)', borderLeft: '3px solid var(--accent-primary)', marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <strong>Notes:</strong> {res.notes}
                  </div>
                )}

                {res.similar_terms && (
                  <div style={{ marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                    <span className="text-muted">Similar to: </span>
                    {res.similar_terms.split(',').map((t, idx) => (
                      <span key={idx} className="badge badge-secondary" style={{ marginRight: '4px', fontSize: '0.75rem' }}>{t.trim()}</span>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                  <span className="text-sm font-semibold opacity-80 flex items-center gap-2">
                    <Database size={14} /> {res.ontology}
                  </span>

                  <div className="flex gap-2">
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleViewGraph(res)}>View Graph</button>
                    {(res.hasConflict || res.similarityIndex) && (
                      <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--accent-danger)' }}>
                        <AlertCircle size={14} /> Resolve Conflict
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showGraph && selectedGraphNode && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }} onClick={() => setShowGraph(false)}>
          <div className="glass-panel w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-layer-2)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-4 mb-4">
              <h3 className="h3 flex items-center gap-2"><Share2 size={20} color="var(--accent-primary)" /> Ontology Graph Explorer</h3>
              <button className="text-zinc-400 hover:text-white" onClick={() => setShowGraph(false)}>✕</button>
            </div>

            <div className="flex-1 flex" style={{ minHeight: '500px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <div className="badge badge-primary hover-card" style={{ padding: '1rem 2rem', fontSize: '1.2rem', marginBottom: '2rem', display: 'inline-block' }}>
                  {selectedGraphNode.label}
                </div>

                <svg width="400" height="200" style={{ position: 'absolute', top: '-50px', left: '-50px', zIndex: -1 }}>
                  <path d="M 200,100 L 50,50" stroke="rgba(255,255,255,0.2)" strokeWidth="2" fill="none" strokeDasharray="5,5" />
                  <path d="M 200,100 L 350,50" stroke="rgba(255,255,255,0.2)" strokeWidth="2" fill="none" />
                  <path d="M 200,100 L 200,250" stroke="rgba(255,255,255,0.2)" strokeWidth="2" fill="none" />
                </svg>

                {selectedGraphNode.similar_terms && (
                  <div className="badge badge-secondary hover-card" style={{ position: 'absolute', top: '-80px', left: '-120px', padding: '0.8rem' }}>
                    {selectedGraphNode.similar_terms.split(',')[0] || 'Similar Concept'}
                  </div>
                )}
                <div className="badge badge-outline hover-card" style={{ position: 'absolute', top: '-80px', right: '-120px', padding: '0.8rem' }}>
                  Superclass Concept
                </div>
                <div className="badge badge-outline hover-card" style={{ position: 'absolute', bottom: '-80px', left: '50%', transform: 'translateX(-50%)', padding: '0.8rem' }}>
                  {selectedGraphNode.domain || 'Domain Concept'}
                </div>
              </div>
              <div className="absolute top-4 left-4 flex gap-2">
                <div className="badge badge-outline" style={{ fontSize: '0.7rem' }}>Mock Interactive Graph</div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] text-sm text-muted">
              Visualizing relations for <strong className="text-white">{selectedGraphNode.label}</strong> within {selectedGraphNode.ontology}.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useEffect, Fragment } from 'react'

function RegistryView() {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOntology, setSelectedOntology] = useState(null)
  const [previewWords, setPreviewWords] = useState([])
  const [selectedWord, setSelectedWord] = useState(null)

  useEffect(() => {
    fetch('http://localhost:3001/api/registry')
      .then(res => res.json())
      .then(data => {
        setSources(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch registry', err)
        setLoading(false)
      })
  }, [])

  const handleSelect = async (ontology) => {
    setSelectedOntology(ontology)
    setSelectedWord(null) // Reset on new view
    try {
      const res = await fetch(`http://localhost:3001/api/registry/${ontology.id}/words`)
      const data = await res.json()
      setPreviewWords(data)
    } catch (err) {
      console.error(err)
    }
  }

  if (selectedOntology) {
    return (
      <div className="container animate-fade-in" style={{ paddingTop: '2rem' }}>
        <button className="btn btn-secondary" style={{ marginBottom: '2rem' }} onClick={() => setSelectedOntology(null)}>
          &larr; Back to Registry
        </button>
        <div className="glass-panel" style={{ marginBottom: '2rem' }}>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="h2">{selectedOntology.name}</h2>
              <p className="text-muted" style={{ marginTop: '0.5rem' }}>{selectedOntology.description}</p>
            </div>
            <div className="text-right">
              <span className="badge badge-primary">{selectedOntology.source_type}</span>
              <p className="text-sm text-muted" style={{ marginTop: '0.5rem' }}>Owned by: <User size={12} style={{ display: 'inline' }} /> {selectedOntology.owner_name}</p>
            </div>
          </div>
        </div>

        <h3 className="h3" style={{ marginBottom: '1rem' }}>Extracted Definitions ({previewWords.length})</h3>
        <div className="glass-panel" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}>Term</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {previewWords.map((word) => (
                <Fragment key={word.id}>
                  <tr
                    style={{
                      borderBottom: selectedWord?.id === word.id ? 'none' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      background: selectedWord?.id === word.id ? 'rgba(255,255,255,0.04)' : 'transparent'
                    }}
                    className="hover:bg-opacity-50"
                    onClick={() => setSelectedWord(selectedWord?.id === word.id ? null : word)}
                  >
                    <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>
                      <span style={{ display: 'inline-block', width: '20px', transition: 'transform 0.2s', transform: selectedWord?.id === word.id ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
                      {word.term}
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span className="badge badge-outline">{word.type}</span>
                    </td>
                  </tr>
                  {selectedWord?.id === word.id && (
                    <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <td colSpan="2" style={{ padding: '0 1.5rem 2rem 3.5rem' }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 className="text-sm font-semibold text-muted uppercase tracking-wider" style={{ marginBottom: '0.5rem' }}>Definition</h4>
                          <p style={{ lineHeight: 1.6, color: 'var(--text-primary)' }}>{word.definition || 'No definition provided.'}</p>
                        </div>
                        {word.related_terms && (
                          <div>
                            <h4 className="text-sm font-semibold text-muted uppercase tracking-wider" style={{ marginBottom: '0.5rem' }}>Tags / Related</h4>
                            <div className="flex gap-2 flex-wrap">
                              {word.related_terms.split(',').map((tag, idx) => (
                                <span key={idx} className="badge badge-secondary" style={{ fontSize: '0.8rem' }}>{tag.trim()}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {previewWords.length === 0 && (
                <tr><td colSpan="2" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No terms extracted yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="container animate-fade-in" style={{ paddingTop: '2rem' }}>
      <div className="flex justify-between items-end" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="h2" style={{ marginBottom: '0.5rem' }}>Federated Registry</h1>
          <p className="text-muted">Monitor and manage ingested ontology sources across the ecosystem.</p>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Database size={16} /> Register New Source
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '3rem' }}>
        <div className="glass-panel stat-card">
          <div className="stat-value">{sources.length}</div>
          <div className="stat-label">Registered Ontologies</div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-value text-gradient">{sources.reduce((acc, curr) => acc + (curr.termCount || 0), 0)}</div>
          <div className="stat-label">Indexed Terms</div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-success)' }}>100%</div>
          <div className="stat-label">Crawl Success Rate</div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '0' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 className="h3">Public Ingestion Nodes</h3>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Source Name</th>
              <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Type</th>
              <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Owner</th>
              <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Terms Extracted</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center' }}>Loading ecosystem registry...</td></tr>}
            {!loading && sources.map((src) => (
              <tr
                key={src.id}
                style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s', cursor: 'pointer' }}
                className="hover:bg-opacity-50"
                onClick={() => handleSelect(src)}
              >
                <td style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--accent-primary)' }}>{src.name}</td>
                <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}>
                  <span className="badge badge-outline">{src.source_type}</span>
                </td>
                <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}><User size={14} style={{ display: 'inline-block', marginRight: '4px' }} />{src.owner_name}</td>
                <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)' }}>{(src.termCount || 0).toLocaleString()}</td>
              </tr>
            ))}
            {!loading && sources.length === 0 && (
              <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No ontologies registered yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GlossaryView() {
  return (
    <div className="container animate-fade-in" style={{ paddingTop: '2rem' }}>
      <div className="flex justify-between items-end" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="h2" style={{ marginBottom: '0.5rem' }}>Enterprise Glossary</h1>
          <p className="text-muted">The unified source of truth for all business terminology.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary flex items-center gap-2"><Book size={16} /> Export PDF</button>
          <button className="btn btn-primary flex items-center gap-2"><Sparkles size={16} /> AI Suggest</button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', textAlign: 'center', borderStyle: 'dashed' }}>
        <div style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }}><Book size={48} /></div>
        <h4 className="h3" style={{ marginBottom: '0.5rem' }}>Global Terminology Map</h4>
        <p className="text-muted" style={{ maxWidth: '500px', margin: '0 auto' }}>
          This view aggregates all approved concepts into a searchable dictionary.
          Implementation in progress to connect Vector Search with actual glossary results.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {['Total Revenue', 'Employee ID', 'Asset Value', 'Supplier Risk', 'Carbon Footprint'].map(term => (
          <div key={term} className="glass-panel hover-card" style={{ padding: '1.5rem' }}>
            <div className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>Verified</div>
            <h4 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>{term}</h4>
            <p className="text-muted text-sm">Standard definition used across ERP and Reporting modules.</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AnalyticsView() {
  return (
    <div className="container animate-fade-in" style={{ paddingTop: '2rem' }}>
      <div className="flex justify-between items-end" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="h2" style={{ marginBottom: '0.5rem' }}>Ontology Analytics</h1>
          <p className="text-muted">Usage metrics, mapping density, and ecosystem health.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-panel stat-card">
          <div className="stat-value text-gradient">842</div>
          <div className="stat-label">Mappings Created</div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>12.5k</div>
          <div className="stat-label">Daily API Calls</div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-success)' }}>98%</div>
          <div className="stat-label">Coverage Harmony</div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="flex flex-col items-center">
          <BarChart3 size={48} color="var(--accent-primary)" style={{ marginBottom: '1rem' }} />
          <p className="text-muted">Advanced Data Visualization Placeholder (D3.js integration pending)</p>
        </div>
      </div>
    </div>
  )
}

function ReviewQueueView() {
  return (
    <div className="container animate-fade-in" style={{ paddingTop: '2rem' }}>
      <div className="flex justify-between items-end" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="h2" style={{ marginBottom: '0.5rem' }}>Review Queue</h1>
          <p className="text-muted">Approve or reject proposed additions from the community.</p>
        </div>
        <div className="badge badge-success">3 Pending Proposals</div>
      </div>

      <div className="flex flex-col gap-4">
        {[
          { term: 'Circularity Index', user: 'Sustainability Team', date: '2 hours ago' },
          { term: 'Net Sales (Adjusted)', user: 'Legal Compliance', date: '1 day ago' },
          { term: 'Patient Protocol B-12', user: 'Healthcare Dept', date: '3 days ago' }
        ].map(item => (
          <div key={item.term} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: '0.5rem' }}>
                <h4 style={{ fontWeight: 600 }}>{item.term}</h4>
                <span className="badge badge-outline" style={{ fontSize: '0.65rem' }}>Draft</span>
              </div>
              <div className="text-sm text-muted">Proposed by <span style={{ color: 'var(--accent-primary)' }}>{item.user}</span> &bull; {item.date}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>View Detail</button>
              <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'var(--accent-success)' }}>Approve</button>
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--accent-danger)' }}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProfileView({ user, onLogout }) {
  return (
    <div className="container animate-fade-in" style={{ paddingTop: '2rem' }}>
      <div className="flex justify-between items-start" style={{ marginBottom: '2rem' }}>
        <div className="flex items-center gap-4">
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={40} color="white" />
          </div>
          <div>
            <h1 className="h2" style={{ marginBottom: '0.25rem' }}>{user.username}</h1>
            <p className="text-muted">Enterprise Data Architect</p>
          </div>
        </div>
        <button className="btn btn-secondary flex items-center gap-2" onClick={onLogout}><LogOut size={16} /> Logout</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 className="h3" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Account Summary</h4>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-muted uppercase font-bold">Email</label>
              <div>{user.username.toLowerCase()}@enterprise-onto.internal</div>
            </div>
            <div>
              <label className="text-xs text-muted uppercase font-bold">Organization Units</label>
              <div>BioScience, ESG Frameworks</div>
            </div>
            <div>
              <label className="text-xs text-muted uppercase font-bold">Access Level</label>
              <div className="text-accent-primary">Administrator</div>
            </div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 className="h3" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Recent Activities</h4>
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-4 items-center py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ padding: '0.5rem', background: 'var(--bg-elevated)', borderRadius: '8px' }}><Activity size={16} /></div>
              <div>
                <div className="text-sm">Updated definition for <b>"Asset Value"</b> in Finance Workspace</div>
                <div className="text-xs text-muted">{i * 2} hours ago</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SettingsView() {
  return (
    <div className="container animate-fade-in" style={{ paddingTop: '2rem' }}>
      <h1 className="h2" style={{ marginBottom: '2rem' }}>System Settings</h1>

      <div className="flex flex-col gap-6">
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 className="h3" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Preferences</h4>
          <div className="flex flex-col gap-4">
            <label className="flex items-center justify-between">
              <span>Dark Mode (Always On)</span>
              <div style={{ width: '40px', height: '20px', background: 'var(--accent-primary)', borderRadius: '10px' }}></div>
            </label>
            <label className="flex items-center justify-between">
              <span>AI Relationship Suggestions</span>
              <div style={{ width: '40px', height: '20px', background: 'var(--accent-primary)', borderRadius: '10px' }}></div>
            </label>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 className="h3" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Integration Keys</h4>
          <p className="text-muted text-sm mb-4">Use these keys to access the Federated Semantic API from external systems.</p>
          <div className="flex gap-2">
            <input type="password" readonly className="input flex-1" value="sk_onto_live_4920kfj0293js02j" />
            <button className="btn btn-secondary">Regenerate</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
