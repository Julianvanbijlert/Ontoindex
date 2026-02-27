import { useState } from 'react'
import { Search, Database, Layers, ShieldCheck, Activity, Share2, AlertCircle, LogOut, User } from 'lucide-react'
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
            <a
              href="#"
              className={`nav-link ${view === 'landing' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setView('landing') }}
            >
              Search
            </a>
            <a
              href="#"
              className={`nav-link ${view === 'registry' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setView('registry') }}
            >
              Registry
            </a>
            <a href="#" className="nav-link">API</a>
            {user ? (
              <button
                className="btn btn-primary flex items-center gap-2"
                onClick={() => setView('dashboard')}
              >
                <User size={16} /> Dashboard
              </button>
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

        {view === 'login' && <AuthViews onLoginSuccess={handleLoginSuccess} />}

        {view === 'dashboard' && user && (
          <DashboardView onLogout={handleLogout} />
        )}
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
  return (
    <div className="container animate-fade-in search-results-layout">
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
              <div key={res.id} className={`result-card animate-fade-in animate-delay-${Math.min(i + 1, 5)}`}>
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

                <div className="text-mono text-muted" style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
                  {res.uri}
                </div>

                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                  {res.definition}
                </p>

                <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                  <span className="text-sm font-semibold opacity-80 flex items-center gap-2">
                    <Database size={14} /> {res.ontology}
                  </span>

                  <div className="flex gap-2">
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>View Graph</button>
                    {res.similarityIndex && (
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

export default App
