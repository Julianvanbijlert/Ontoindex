import React, { useState, useEffect } from 'react'
import { Database, Upload, Plus, Edit2, Trash2, ChevronLeft, Save, X, Activity, Download, Share2, Users, Settings, History, Lock } from 'lucide-react'

export function DashboardView({ onLogout }) {
    const [ontologies, setOntologies] = useState([])
    const [selectedOntology, setSelectedOntology] = useState(null)
    const [words, setWords] = useState([])
    const [loading, setLoading] = useState(false)

    // Forms state
    const [showAddOntology, setShowAddOntology] = useState(false)
    const [addOntologyMode, setAddOntologyMode] = useState('manual') // 'manual', 'url'
    const [ontologyForm, setOntologyForm] = useState({ name: '', description: '', file: null, url: '' })

    const [showAddWord, setShowAddWord] = useState(false)
    const [wordForm, setWordForm] = useState({ term: '', definition: '', type: 'Class', domain: '', notes: '', similar_terms: '' })

    const [editingWord, setEditingWord] = useState(null)
    const [editingOntology, setEditingOntology] = useState(null)

    const token = localStorage.getItem('onto_token')

    const fetchOptions = {
        headers: { 'Authorization': `Bearer ${token}` }
    }

    useEffect(() => {
        fetchOntologies()
    }, [])

    const fetchOntologies = async () => {
        setLoading(true)
        try {
            const res = await fetch('http://localhost:3001/api/ontologies', fetchOptions)
            const data = await res.json()
            setOntologies(data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const fetchWords = async (ontologyId) => {
        setLoading(true)
        try {
            const res = await fetch(`http://localhost:3001/api/ontologies/${ontologyId}/words`, fetchOptions)
            const data = await res.json()
            setWords(data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleSelectOntology = (ont) => {
        setSelectedOntology(ont)
        fetchWords(ont.id)
    }

    // Ontology Actions

    const handleAddOntology = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            if (addOntologyMode === 'url') {
                if (!ontologyForm.url) {
                    alert('Please provide a valid URL')
                    setLoading(false)
                    return
                }
                const res = await fetch('http://localhost:3001/api/ontologies/mine', {
                    method: 'POST',
                    headers: { ...fetchOptions.headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: ontologyForm.url, name: ontologyForm.name, description: ontologyForm.description })
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || 'Failed to mine URL')
                alert(`Successfully extracted ${data.termsExtracted} terms!`)
            } else if (ontologyForm.file) {
                const formData = new FormData()
                formData.append('file', ontologyForm.file)
                formData.append('name', ontologyForm.name)
                formData.append('description', ontologyForm.description)

                await fetch('http://localhost:3001/api/ontologies/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }, // no content-type for FormData
                    body: formData
                })
            } else {
                await fetch('http://localhost:3001/api/ontologies', {
                    method: 'POST',
                    headers: { ...fetchOptions.headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: ontologyForm.name, description: ontologyForm.description, source_type: 'API' })
                })
            }
            setOntologyForm({ name: '', description: '', file: null, url: '' })
            setShowAddOntology(false)
            fetchOntologies()
        } catch (error) {
            console.error(error)
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteOntology = async (id) => {
        if (!window.confirm('Are you sure you want to delete this ontology and all its words?')) return
        try {
            await fetch(`http://localhost:3001/api/ontologies/${id}`, { method: 'DELETE', ...fetchOptions })
            if (selectedOntology && selectedOntology.id === id) {
                setSelectedOntology(null)
            }
            fetchOntologies()
        } catch (error) {
            console.error(error)
        }
    }

    const handleUpdateOntology = async (e) => {
        e.preventDefault()
        try {
            await fetch(`http://localhost:3001/api/ontologies/${editingOntology.id}`, {
                method: 'PUT',
                headers: { ...fetchOptions.headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editingOntology.name, description: editingOntology.description })
            })
            setEditingOntology(null)
            fetchOntologies()
            if (selectedOntology && selectedOntology.id === editingOntology.id) {
                setSelectedOntology({ ...selectedOntology, name: editingOntology.name, description: editingOntology.description })
            }
        } catch (error) {
            console.error(error)
        }
    }

    const handleExportJsonLd = async (id, name) => {
        try {
            const res = await fetch(`http://localhost:3001/api/ontologies/${id}/export`, fetchOptions)
            if (!res.ok) throw new Error('Failed to export')
            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${name.replace(/\s+/g, '_')}.jsonld`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Export Error:', error)
            alert('Failed to export JSON-LD')
        }
    }

    const handleExportCsv = async (id, name) => {
        try {
            const res = await fetch(`http://localhost:3001/api/ontologies/${id}/export/csv`, fetchOptions)
            if (!res.ok) throw new Error('Failed to export CSV')
            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${name.replace(/\s+/g, '_')}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Export Error:', error)
            alert('Failed to export CSV')
        }
    }

    // Word Actions

    const handleAddWord = async (e) => {
        e.preventDefault()
        try {
            await fetch(`http://localhost:3001/api/ontologies/${selectedOntology.id}/words`, {
                method: 'POST',
                headers: { ...fetchOptions.headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(wordForm)
            })
            setWordForm({ term: '', definition: '', type: 'Class', domain: '', notes: '', similar_terms: '' })
            setShowAddWord(false)
            fetchWords(selectedOntology.id)
            fetchOntologies() // update term count
        } catch (error) {
            console.error(error)
        }
    }

    const handleUpdateWord = async (e) => {
        e.preventDefault()
        try {
            await fetch(`http://localhost:3001/api/words/${editingWord.id}`, {
                method: 'PUT',
                headers: { ...fetchOptions.headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ term: editingWord.term, definition: editingWord.definition, type: editingWord.type, domain: editingWord.domain, notes: editingWord.notes, similar_terms: editingWord.similar_terms })
            })
            setEditingWord(null)
            fetchWords(selectedOntology.id)
        } catch (error) {
            console.error(error)
        }
    }

    const handleDeleteWord = async (id) => {
        if (!window.confirm('Delete this word?')) return
        try {
            await fetch(`http://localhost:3001/api/words/${id}`, { method: 'DELETE', ...fetchOptions })
            fetchWords(selectedOntology.id)
            fetchOntologies()
        } catch (error) {
            console.error(error)
        }
    }

    if (selectedOntology) {
        return (
            <div className="container animate-fade-in" style={{ paddingTop: '2rem' }}>
                <button className="btn btn-secondary flex items-center gap-2" onClick={() => setSelectedOntology(null)} style={{ marginBottom: '1.5rem', background: 'transparent' }}>
                    <ChevronLeft size={16} /> Back to Dashboard
                </button>

                <div className="flex justify-between items-end" style={{ marginBottom: '2rem' }}>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="badge badge-primary">Workspace</div>
                            <div className="badge badge-outline"><Lock size={10} /> Private</div>
                        </div>
                        <h2 className="h2" style={{ marginBottom: '0.5rem', fontSize: '2rem' }}>{selectedOntology.name}</h2>
                        <p className="text-muted">{selectedOntology.description}</p>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn btn-secondary flex items-center gap-2" title="Revision History"><History size={16} /></button>
                        <button className="btn btn-secondary flex items-center gap-2" title="Manage Collaborators"><Users size={16} /></button>
                        <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowAddWord(true)}>
                            <Plus size={16} /> Add Term
                        </button>
                    </div>
                </div>

                {showAddWord && (
                    <div className="glass-panel animate-fade-in" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
                        <h3 className="h3" style={{ marginBottom: '1rem' }}>Add New Term</h3>
                        <form onSubmit={handleAddWord} className="flex flex-col gap-4">
                            <div className="flex gap-4 items-end flex-wrap">
                                <div style={{ flex: '1 1 200px' }}>
                                    <label className="text-sm font-semibold text-muted">Term Name</label>
                                    <input type="text" className="input" required value={wordForm.term} onChange={e => setWordForm({ ...wordForm, term: e.target.value })} />
                                </div>
                                <div style={{ flex: '2 1 300px' }}>
                                    <label className="text-sm font-semibold text-muted">Definition</label>
                                    <input type="text" className="input" required value={wordForm.definition} onChange={e => setWordForm({ ...wordForm, definition: e.target.value })} />
                                </div>
                                <div style={{ flex: '1 1 150px' }}>
                                    <label className="text-sm font-semibold text-muted">Type</label>
                                    <select className="input" value={wordForm.type} onChange={e => setWordForm({ ...wordForm, type: e.target.value })}>
                                        <option>Class</option>
                                        <option>Property</option>
                                        <option>Individual</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-4 items-end flex-wrap">
                                <div style={{ flex: '1 1 200px' }}>
                                    <label className="text-sm font-semibold text-muted">Domain (Optional)</label>
                                    <input type="text" className="input" placeholder="e.g. Finance" value={wordForm.domain} onChange={e => setWordForm({ ...wordForm, domain: e.target.value })} />
                                </div>
                                <div style={{ flex: '1 1 200px' }}>
                                    <label className="text-sm font-semibold text-muted">Similar Terms</label>
                                    <input type="text" className="input" placeholder="Comma separated..." value={wordForm.similar_terms} onChange={e => setWordForm({ ...wordForm, similar_terms: e.target.value })} />
                                </div>
                                <div style={{ flex: '2 1 300px' }}>
                                    <label className="text-sm font-semibold text-muted">Notes for Stakeholders</label>
                                    <input type="text" className="input" placeholder="e.g. Pending review by Legal..." value={wordForm.notes} onChange={e => setWordForm({ ...wordForm, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end mt-2">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAddWord(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Term</button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
                        <h4 className="font-semibold text-sm uppercase tracking-wider text-muted">Management Console</h4>
                        <div className="flex gap-4 text-xs text-muted">
                            <span>Sorted by: <b>Most Recent</b></span>
                            <span>Filter: <b>None</b></span>
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-subtle)' }}>
                                <th style={{ padding: '0.8rem 1.5rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Term / Domain</th>
                                <th style={{ padding: '0.8rem 1.5rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Type / Similarity</th>
                                <th style={{ padding: '0.8rem 1.5rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Definition / Stakeholder Notes</th>
                                <th style={{ padding: '0.8rem 1.5rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Status</th>
                                <th style={{ padding: '0.8rem 1.5rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {words.length === 0 ? (
                                <tr><td colSpan="5" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No definitions found in this workspace.</td></tr>
                            ) : words.map(word => (
                                <tr key={word.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/5 transition-colors">
                                    {editingWord?.id === word.id ? (
                                        <td colSpan="5" style={{ padding: '1rem 1.5rem' }}>
                                            <form onSubmit={handleUpdateWord} className="flex flex-col gap-2 w-full">
                                                <div className="flex gap-2 items-center w-full">
                                                    <input type="text" className="input" style={{ width: '150px' }} value={editingWord.term} onChange={e => setEditingWord({ ...editingWord, term: e.target.value })} />
                                                    <select className="input" style={{ width: '120px' }} value={editingWord.type} onChange={e => setEditingWord({ ...editingWord, type: e.target.value })}>
                                                        <option>Class</option><option>Property</option><option>Individual</option>
                                                    </select>
                                                    <input type="text" className="input flex-1" value={editingWord.definition} onChange={e => setEditingWord({ ...editingWord, definition: e.target.value })} />
                                                </div>
                                                <div className="flex gap-2 items-center w-full">
                                                    <input type="text" className="input" style={{ width: '150px' }} placeholder="Domain" value={editingWord.domain} onChange={e => setEditingWord({ ...editingWord, domain: e.target.value })} />
                                                    <input type="text" className="input" style={{ width: '120px' }} placeholder="Similar terms" value={editingWord.similar_terms} onChange={e => setEditingWord({ ...editingWord, similar_terms: e.target.value })} />
                                                    <input type="text" className="input flex-1" placeholder="Notes" value={editingWord.notes} onChange={e => setEditingWord({ ...editingWord, notes: e.target.value })} />
                                                    <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem' }}><Save size={16} /></button>
                                                    <button type="button" className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={() => setEditingWord(null)}><X size={16} /></button>
                                                </div>
                                            </form>
                                        </td>
                                    ) : (
                                        <>
                                            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                                                <div style={{ fontWeight: 600 }}>{word.term}</div>
                                                {word.domain && <div className="text-sm font-medium text-muted mt-1">{word.domain}</div>}
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                                                <span className="badge badge-outline">{word.type}</span>
                                                {word.similar_terms && <div className="text-sm text-muted mt-2">~ {word.similar_terms}</div>}
                                            </td>
                                            <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-secondary)', verticalAlign: 'top', maxWidth: '400px' }}>
                                                <div style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{word.definition}</div>
                                                {word.notes && <div className="text-xs text-muted italic p-2 bg-white/5 border border-white/5 rounded-md inline-block">Ref: {word.notes}</div>}
                                            </td>
                                            <td style={{ padding: '1.25rem 1.5rem', verticalAlign: 'top' }}>
                                                {word.id % 2 === 0 ?
                                                    <div className="badge badge-success" style={{ fontSize: '0.65rem' }}>Approved</div> :
                                                    <div className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Drafting</div>
                                                }
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right', verticalAlign: 'top' }}>
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => setEditingWord(word)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer' }}><Edit2 size={16} /></button>
                                                    <button onClick={() => handleDeleteWord(word.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
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
                    <h1 className="h2" style={{ marginBottom: '0.5rem' }}>Your Ontologies</h1>
                    <p className="text-muted">Manage your knowledge domains, add Excel/Word files, or construct them manually.</p>
                </div>
                <div className="flex gap-4">
                    <button className="btn btn-secondary" onClick={onLogout}>Logout</button>
                    <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowAddOntology(!showAddOntology)}>
                        {showAddOntology ? <X size={16} /> : <Upload size={16} />}
                        {showAddOntology ? 'Cancel' : 'Upload / Add Ontology'}
                    </button>
                </div>
            </div>

            {showAddOntology && (
                <div className="glass-panel animate-fade-in" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
                        <h3 className="h3">Add New Ontology</h3>
                        <div className="flex gap-2 bg-black/20 p-1 rounded-md">
                            <button
                                className={`px-3 py-1 text-sm rounded-sm transition-colors ${addOntologyMode === 'manual' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}
                                onClick={() => setAddOntologyMode('manual')}
                            >
                                File / API
                            </button>
                            <button
                                className={`px-3 py-1 text-sm rounded-sm transition-colors ${addOntologyMode === 'url' ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-400 hover:text-white'}`}
                                onClick={() => setAddOntologyMode('url')}
                            >
                                URL Miner
                            </button>
                        </div>
                    </div>

                    <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
                        {addOntologyMode === 'manual'
                            ? "Upload an Excel/Word file to automatically extract terms, or create an empty one via API."
                            : "Provide a URL to automatically mine terms, definitions, and relations using our Markdown extraction agent."}
                    </p>

                    <form onSubmit={handleAddOntology} className="flex gap-4 items-end flex-wrap">
                        {addOntologyMode === 'url' ? (
                            <>
                                <div style={{ flex: '2 1 400px' }}>
                                    <label className="text-sm font-semibold text-muted">Target URL</label>
                                    <input type="url" className="input" placeholder="e.g. https://modellen.jenvgegevens.nl/.../verwerkingsdoel.md" value={ontologyForm.url} onChange={e => setOntologyForm({ ...ontologyForm, url: e.target.value })} required />
                                </div>
                                <div style={{ flex: '1 1 200px' }}>
                                    <label className="text-sm font-semibold text-muted">Domain Name (Optional)</label>
                                    <input type="text" className="input" placeholder="Extracted Domain" value={ontologyForm.name} onChange={e => setOntologyForm({ ...ontologyForm, name: e.target.value })} />
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ flex: '1 1 200px' }}>
                                    <label className="text-sm font-semibold text-muted">Ontology Name</label>
                                    <input type="text" className="input" placeholder="e.g. Finance Base" value={ontologyForm.name} onChange={e => setOntologyForm({ ...ontologyForm, name: e.target.value })} required />
                                </div>
                                <div style={{ flex: '2 1 300px' }}>
                                    <label className="text-sm font-semibold text-muted">Description</label>
                                    <input type="text" className="input" placeholder="Core concepts for financial sector..." value={ontologyForm.description} onChange={e => setOntologyForm({ ...ontologyForm, description: e.target.value })} />
                                </div>
                                <div style={{ flex: '1 1 200px' }}>
                                    <label className="text-sm font-semibold text-muted">File (Excel/Word) - Optional</label>
                                    <input type="file" className="input" accept=".xlsx,.xls,.doc,.docx" onChange={e => setOntologyForm({ ...ontologyForm, file: e.target.files[0] })} />
                                </div>
                            </>
                        )}
                        <button type="submit" disabled={loading} className="btn btn-primary flex items-center gap-2" style={{ minWidth: '150px', justifyContent: 'center' }}>
                            {loading ? 'Processing...' : (addOntologyMode === 'url' ? <><Activity size={16} /> Mine URL</> : (ontologyForm.file ? <><Upload size={16} /> Upload</> : <><Plus size={16} /> Create</>))}
                        </button>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {ontologies.map(ont => (
                    <div key={ont.id} className="glass-panel hover-card" style={{ padding: '1.5rem', cursor: 'pointer', position: 'relative' }}>
                        {editingOntology?.id === ont.id ? (
                            <form onSubmit={handleUpdateOntology} className="flex flex-col gap-3" onClick={e => e.stopPropagation()}>
                                <input type="text" className="input" value={editingOntology.name} onChange={e => setEditingOntology({ ...editingOntology, name: e.target.value })} required autoFocus />
                                <textarea className="input" rows="2" value={editingOntology.description} onChange={e => setEditingOntology({ ...editingOntology, description: e.target.value })} />
                                <div className="flex gap-2">
                                    <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.4rem' }}>Save</button>
                                    <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem' }} onClick={() => setEditingOntology(null)}>Cancel</button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <div className="flex justify-between items-start" style={{ marginBottom: '1rem' }}>
                                    <div className="flex items-center gap-2" onClick={() => handleSelectOntology(ont)}>
                                        <div style={{ padding: '0.5rem', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '8px', color: 'var(--accent-primary)' }}>
                                            <Database size={20} />
                                        </div>
                                        <h3 className="h3" style={{ fontSize: '1.3rem', margin: 0 }}>{ont.name}</h3>
                                    </div>
                                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                        <button style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }} title="Permissions"><Lock size={16} /></button>
                                        <button style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }} title="Collaborators"><Users size={16} /></button>
                                        <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 4px' }}></div>
                                        <button style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '0 0.5rem' }} onClick={() => handleExportCsv(ont.id, ont.name)} title="Export CSV">CSV</button>
                                        <button style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '0 0.5rem' }} onClick={() => handleExportJsonLd(ont.id, ont.name)} title="Export JSON-LD">JSON-LD</button>
                                        <button style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => setEditingOntology(ont)} title="Settings"><Settings size={16} /></button>
                                        <button style={{ background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer' }} onClick={() => handleDeleteOntology(ont.id)} title="Delete"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                                <div onClick={() => handleSelectOntology(ont)}>
                                    <p className="text-muted text-sm" style={{ marginBottom: '1.5rem', minHeight: '40px' }}>
                                        {ont.description || 'No description provided.'}
                                    </p>
                                    <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', marginTop: 'auto' }}>
                                        <span className="badge badge-outline">{ont.source_type}</span>
                                        <span className="text-sm font-semibold text-muted flex items-center gap-1">
                                            {ont.termCount || 0} Terms
                                        </span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {ontologies.length === 0 && !loading && !showAddOntology && (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-subtle)' }}>
                    <Database size={48} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
                    <h3 className="h3">No Ontologies Yet</h3>
                    <p className="text-muted" style={{ maxWidth: '400px', margin: '0 auto' }}>You haven't added any ontologies to your account. Upload an Excel/Word document or create one manually to get started.</p>
                </div>
            )}
        </div>
    )
}
