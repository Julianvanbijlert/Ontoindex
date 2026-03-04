import express from 'express'
import cors from 'cors'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { mineUrlRecursively } from './miner.js'
import { query, execute } from './db.js'

const app = express()
const PORT = 3001
const JWT_SECRET = 'super-secret-key-123' // In production, use env variable

app.use(cors())
app.use(express.json())

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' })

// --- Authentication APIs ---

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' })
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10)
        const result = await execute('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword])
        res.status(201).json({ id: result.lastID, username })
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Username already exists' })
        }
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' })
    }

    try {
        const users = await query('SELECT * FROM users WHERE username = ?', [username])
        const user = users[0]

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        const passwordMatch = await bcrypt.compare(password, user.password)
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' })
        res.json({ token, user: { id: user.id, username: user.username } })
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

// Middleware to protect routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (token == null) return res.sendStatus(401)

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403)
        req.user = user
        next()
    })
}

// --- Public Registry APIs ---

app.get('/api/registry', async (req, res) => {
    try {
        const ontologies = await query(`
            SELECT o.*, u.username as owner_name 
            FROM ontologies o
            LEFT JOIN users u ON o.user_id = u.id
            ORDER BY o.id DESC
        `)
        for (let i = 0; i < ontologies.length; i++) {
            const words = await query('SELECT COUNT(*) as count FROM words WHERE ontology_id = ?', [ontologies[i].id])
            ontologies[i].termCount = words[0].count
        }
        res.json(ontologies)
    } catch (error) {
        console.error('Error fetching registry:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.get('/api/registry/:ontologyId/words', async (req, res) => {
    const { ontologyId } = req.params
    try {
        const words = await query('SELECT * FROM words WHERE ontology_id = ?', [ontologyId])
        res.json(words)
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

// --- Private User Ontology APIs ---

app.get('/api/ontologies', authenticateToken, async (req, res) => {
    try {
        const ontologies = await query('SELECT * FROM ontologies WHERE user_id = ?', [req.user.id])
        for (let i = 0; i < ontologies.length; i++) {
            const words = await query('SELECT COUNT(*) as count FROM words WHERE ontology_id = ?', [ontologies[i].id])
            ontologies[i].termCount = words[0].count
        }
        res.json(ontologies)
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.post('/api/ontologies', authenticateToken, async (req, res) => {
    const { name, description, source_type } = req.body
    try {
        const result = await execute('INSERT INTO ontologies (name, description, source_type, user_id) VALUES (?, ?, ?, ?)', [name, description, source_type || 'API', req.user.id])
        res.status(201).json({ id: result.lastID, name, description, source_type, user_id: req.user.id })
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.post('/api/ontologies/upload', authenticateToken, upload.single('file'), async (req, res) => {
    // Mock processing of Excel/Word file
    const file = req.file
    const { name, description } = req.body

    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' })
    }

    const fileType = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls') ? 'Excel' :
        file.originalname.endsWith('.docx') || file.originalname.endsWith('.doc') ? 'Word' : 'File'

    try {
        const result = await execute('INSERT INTO ontologies (name, description, source_type, user_id) VALUES (?, ?, ?, ?)', [name || file.originalname, description || 'Uploaded via file', fileType, req.user.id])
        const newOntologyId = result.lastID

        // Mock extracting words from file
        const mockWords = [
            { term: 'ConceptA', definition: 'Definition A from file', type: 'Class', domain: 'General', notes: 'Imported from legacy doc', similar_terms: 'ConceptAlpha' },
            { term: 'ConceptB', definition: 'Definition B from file', type: 'Property', domain: 'Finance', notes: 'Needs review', similar_terms: 'ConceptBeta' }
        ]

        for (const word of mockWords) {
            await execute('INSERT INTO words (ontology_id, term, definition, type, domain, notes, similar_terms) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [newOntologyId, word.term, word.definition, word.type, word.domain, word.notes, word.similar_terms])
        }

        res.status(201).json({ message: 'File uploaded and processed successfully', ontologyId: newOntologyId })
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.post('/api/ontologies/mine', authenticateToken, async (req, res) => {
    const { url, name, description } = req.body

    if (!url) {
        return res.status(400).json({ error: 'URL is required' })
    }

    try {
        const finalWords = await mineUrlRecursively(url)

        if (finalWords.length === 0) {
            return res.status(400).json({ error: 'Could not extract any concepts from the provided URL. The HTML structure might not look like a glossary or definition list.' })
        }

        // Save new ontology
        const ontName = name || `Mined from ${new URL(url).hostname}`
        const ontDesc = description || `Automatically extracted from ${url}`
        const result = await execute('INSERT INTO ontologies (name, description, source_type, user_id) VALUES (?, ?, ?, ?)', [ontName, ontDesc, 'API Mine', req.user.id])
        const newOntologyId = result.lastID

        for (const word of finalWords) {
            const relatedStr = word.related.join(', ')
            await execute('INSERT INTO words (ontology_id, term, definition, type, related_terms) VALUES (?, ?, ?, ?, ?)', [newOntologyId, word.term, word.definition.trim(), word.type, relatedStr])
        }

        res.status(201).json({ message: 'Successfully mined ontology', ontologyId: newOntologyId, termsExtracted: finalWords.length })

    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to fetch or parse the URL' })
    }
})

// Stage 6: JSON-LD Export
app.get('/api/ontologies/:id/export', authenticateToken, async (req, res) => {
    const { id } = req.params
    try {
        const ontologies = await query('SELECT * FROM ontologies WHERE id = ? AND user_id = ?', [id, req.user.id])
        if (ontologies.length === 0) {
            return res.status(404).json({ error: 'Ontology not found or access denied' })
        }

        const ontology = ontologies[0]
        const words = await query('SELECT * FROM words WHERE ontology_id = ?', [id])

        const jsonLd = {
            "@context": {
                "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
                "owl": "http://www.w3.org/2002/07/owl#",
                "schema": "http://schema.org/",
                "name": "rdfs:label",
                "description": "rdfs:comment",
                "related": "rdfs:seeAlso"
            },
            "@id": `http://ontoindex.local/ontologies/${ontology.id}`,
            "@type": "owl:Ontology",
            "name": ontology.name,
            "description": ontology.description,
            "@graph": words.map(w => ({
                "@id": `http://ontoindex.local/ontologies/${ontology.id}/terms/${encodeURIComponent(w.term.replace(/\s+/g, '_'))}`,
                "@type": w.type === 'Property' ? 'owl:DatatypeProperty' : 'owl:Class',
                "name": w.term,
                "description": w.definition,
                ...(w.related_terms ? { "related": w.related_terms.split(',').map(r => r.trim()) } : {})
            }))
        }

        res.setHeader('Content-Type', 'application/ld+json')
        res.setHeader('Content-Disposition', `attachment; filename="${ontology.name.replace(/\s+/g, '_')}.jsonld"`)
        res.send(JSON.stringify(jsonLd, null, 2))
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// CSV Export
app.get('/api/ontologies/:id/export/csv', authenticateToken, async (req, res) => {
    const { id } = req.params
    try {
        const ontologies = await query('SELECT * FROM ontologies WHERE id = ? AND user_id = ?', [id, req.user.id])
        if (ontologies.length === 0) {
            return res.status(404).json({ error: 'Ontology not found or access denied' })
        }

        const ontology = ontologies[0]
        const words = await query('SELECT * FROM words WHERE ontology_id = ?', [id])

        let csvContent = 'Term,Type,Definition,Domain,Similar Terms,Related Terms,Notes\n'
        words.forEach(w => {
            const escapeCsv = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`
            csvContent += `${escapeCsv(w.term)},${escapeCsv(w.type)},${escapeCsv(w.definition)},${escapeCsv(w.domain)},${escapeCsv(w.similar_terms)},${escapeCsv(w.related_terms)},${escapeCsv(w.notes)}\n`
        })

        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', `attachment; filename="${ontology.name.replace(/\s+/g, '_')}.csv"`)
        res.send(csvContent)
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.put('/api/ontologies/:id', authenticateToken, async (req, res) => {
    const { name, description } = req.body
    const { id } = req.params
    try {
        await execute('UPDATE ontologies SET name = ?, description = ? WHERE id = ?', [name, description, id])
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.delete('/api/ontologies/:id', authenticateToken, async (req, res) => {
    const { id } = req.params
    try {
        await execute('DELETE FROM words WHERE ontology_id = ?', [id])
        await execute('DELETE FROM ontologies WHERE id = ?', [id])
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

// --- Word APIs ---

app.get('/api/ontologies/:ontologyId/words', authenticateToken, async (req, res) => {
    const { ontologyId } = req.params
    try {
        const words = await query('SELECT * FROM words WHERE ontology_id = ?', [ontologyId])
        res.json(words)
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.post('/api/ontologies/:ontologyId/words', authenticateToken, async (req, res) => {
    const { ontologyId } = req.params
    const { term, definition, type, related_terms, domain, notes, similar_terms } = req.body
    try {
        const result = await execute(
            'INSERT INTO words (ontology_id, term, definition, type, related_terms, domain, notes, similar_terms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [ontologyId, term, definition, type || 'Class', related_terms || '', domain || '', notes || '', similar_terms || '']
        )
        res.status(201).json({ id: result.lastID, term, definition, type, related_terms, domain, notes, similar_terms })
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.put('/api/words/:id', authenticateToken, async (req, res) => {
    const { term, definition, type, related_terms, domain, notes, similar_terms } = req.body
    const { id } = req.params
    try {
        await execute(
            'UPDATE words SET term = ?, definition = ?, type = ?, related_terms = ?, domain = ?, notes = ?, similar_terms = ? WHERE id = ?',
            [term, definition, type, related_terms || '', domain || '', notes || '', similar_terms || '', id]
        )
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.delete('/api/words/:id', authenticateToken, async (req, res) => {
    const { id } = req.params
    try {
        await execute('DELETE FROM words WHERE id = ?', [id])
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

// --- Search API ---

app.get('/api/search', authenticateToken, async (req, res) => {
    const { q } = req.query
    if (!q) return res.json([])

    try {
        const sql = `
            SELECT words.*, ontologies.name as ontology_name
            FROM words
            JOIN ontologies ON words.ontology_id = ontologies.id
            WHERE ontologies.user_id = ? AND (words.term LIKE ? OR words.definition LIKE ?)
        `
        const wildcardQuery = `%${q}%`
        const results = await query(sql, [req.user.id, wildcardQuery, wildcardQuery])

        // Group by term to detect conflicts
        const termCounts = {}
        for (const row of results) {
            const t = row.term.toLowerCase()
            termCounts[t] = (termCounts[t] || 0) + 1
        }

        // Format results to match frontend expectations
        const formattedResults = results.map(row => ({
            id: "term:" + row.id,
            label: row.term,
            uri: `http://localhost/onto/${row.ontology_id}#${row.term.replace(/\s+/g, '')}`,
            ontology: row.ontology_name,
            type: row.type || "Class",
            trust: 100, // Own data
            matchType: "Semantic",
            definition: row.definition,
            domain: row.domain,
            notes: row.notes,
            similar_terms: row.similar_terms,
            hasConflict: termCounts[row.term.toLowerCase()] > 1
        }))

        res.json(formattedResults)
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})