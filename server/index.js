import express from 'express'
import cors from 'cors'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import axios from 'axios'
import * as cheerio from 'cheerio'
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

// --- Ontology APIs ---

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
            { term: 'ConceptA', definition: 'Definition A from file', type: 'Class' },
            { term: 'ConceptB', definition: 'Definition B from file', type: 'Property' }
        ]

        for (const word of mockWords) {
            await execute('INSERT INTO words (ontology_id, term, definition, type) VALUES (?, ?, ?, ?)', [newOntologyId, word.term, word.definition, word.type])
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
        const response = await axios.get(url, { headers: { 'Accept': 'text/html, text/markdown, text/plain, */*' } })
        const contentType = response.headers['content-type'] || ''
        const content = response.data

        const extractedWords = []

        // Stage 3: NLP Normalization Helpers
        const normalizeTerm = (term) => term.replace(/[:\-]$/g, '').trim()
        const extractSemantics = (def) => {
            if (/property|attribute|relation/i.test(def)) return 'Property'
            if (/individual|instance|example/i.test(def)) return 'Individual'
            return 'Class'
        }

        const extractFromMarkdown = (mdContent) => {
            const lines = mdContent.split('\n')
            let currentWord = null

            for (let line of lines) {
                line = line.trim()
                const termMatch = line.match(/^(?:#{2,6}|\*+|- \*\*)\s*([^:\*]+)/)
                if (termMatch && line.length < 150) {
                    if (currentWord && currentWord.term) {
                        extractedWords.push(currentWord)
                    }
                    currentWord = { term: normalizeTerm(termMatch[1]), definition: '', related: [], type: 'Class' }
                    const colIdx = line.indexOf(':')
                    if (colIdx !== -1 && colIdx > 2) {
                        currentWord.definition = line.substring(colIdx + 1).replace(/\*+/g, '').trim() + ' '
                    }
                } else if (currentWord && line.startsWith('> ')) {
                    currentWord.definition += line.replace('> ', '').trim() + ' '
                } else if (currentWord && line.match(/^(relaties|gerelateerd|see also|related|related terms):/i)) {
                    const relatedText = line.replace(/^(relaties|gerelateerd|see also|related|related terms):/i, '').trim()
                    const links = Array.from(relatedText.matchAll(/\[([^\]]+)\]/g))
                    if (links.length > 0) {
                        links.forEach(m => currentWord.related.push(m[1].trim()))
                    } else {
                        currentWord.related.push(...relatedText.split(',').map(s => s.trim()))
                    }
                } else if (currentWord && line.length > 0 && !line.match(/^(Toelichting|Bron|Alternatieve aanduiding|Voorbeeld|Extensie|Concept):/i)) {
                    if (!line.startsWith('[')) {
                        currentWord.definition += line + ' '
                    }
                }
            }
            if (currentWord && currentWord.term) {
                extractedWords.push(currentWord)
            }
        }

        if (contentType.includes('text/html')) {
            // Stage 1 & 2: HTML DOM Extraction
            const $ = cheerio.load(content)

            // Strategy: ReSpec W3C data-include markdown files (Common in Dutch Govt Standards)
            const includeElements = $('[data-include$=".md"]')
            if (includeElements.length > 0) {
                const baseUrl = new URL(url)
                for (let i = 0; i < includeElements.length; i++) {
                    const includePath = $(includeElements[i]).attr('data-include')
                    const fullIncludeUrl = new URL(includePath, baseUrl).href
                    try {
                        const mdRes = await axios.get(fullIncludeUrl, { headers: { 'Accept': 'text/markdown, text/plain, */*' } })
                        if (mdRes.data) {
                            extractFromMarkdown(mdRes.data)
                        }
                    } catch (e) { console.error('Failed fetching include', fullIncludeUrl) }
                }
            }

            // Clean DOM
            $('script, style, nav, footer, header').remove()

            // Strategy A: <dl> <dt> <dd>
            let currentTerm = null
            $('dl').children().each((_, el) => {
                if (el.tagName === 'dt') {
                    currentTerm = normalizeTerm($(el).text())
                } else if (el.tagName === 'dd' && currentTerm) {
                    const definition = $(el).text().trim()
                    if (definition) {
                        extractedWords.push({ term: currentTerm, definition, related: [], type: extractSemantics(definition) })
                    }
                    currentTerm = null
                }
            })

            // Strategy B: Tables with headers or generic 2-col tables
            $('table').each((_, table) => {
                const headers = []
                $(table).find('th, thead td').each((i, th) => headers.push($(th).text().trim().toLowerCase()))

                let termIdx = headers.findIndex(h => h.includes('term') || h.includes('concept') || h.includes('name') || h.includes('begrip'))
                let defIdx = headers.findIndex(h => h.includes('definition') || h.includes('description') || h.includes('meaning') || h.includes('definitie') || h.includes('omschrijving') || h.includes('uitleg'))

                if (termIdx === -1 || defIdx === -1) {
                    const firstRow = $(table).find('tr').first()
                    const cells = firstRow.find('td, th')
                    if (cells.length >= 2) {
                        termIdx = 0
                        defIdx = 1
                    }
                }

                if (termIdx !== -1 && defIdx !== -1) {
                    $(table).find('tbody tr, tr').each((_, tr) => {
                        const cells = $(tr).find('td')
                        if (cells.length > Math.max(termIdx, defIdx)) {
                            const term = normalizeTerm($(cells[termIdx]).text())
                            const definition = $(cells[defIdx]).text().trim()
                            if (term && definition && term.length < 100) {
                                let type = extractSemantics(definition)
                                if (cells.length > 2) type = extractSemantics($(cells[2]).text()) || type
                                extractedWords.push({ term, definition, related: [], type })
                            }
                        }
                    })
                }
            })

            // Strategy C: Any headers followed by text
            $('h1, h2, h3, h4, h5, h6').each((_, heading) => {
                const termText = $(heading).text().trim()
                if (termText && termText.length < 80 && termText.split(' ').length < 8) {
                    let nextEl = $(heading).next()
                    let definition = ''
                    while (nextEl.length && !nextEl.is('h1, h2, h3, h4, h5, h6')) {
                        if (nextEl.is('p') || nextEl.is('div') || nextEl.is('span')) {
                            definition += nextEl.text().trim() + ' '
                        }
                        nextEl = nextEl.next()
                    }
                    if (definition.trim()) {
                        extractedWords.push({ term: normalizeTerm(termText), definition: definition.trim(), related: [], type: extractSemantics(definition) })
                    }
                }
            })

            // Strategy D: Paragraphs or lists starting with bold terms (e.g. <strong>Term:</strong> definition)
            $('p, li, div').each((_, el) => {
                const strongEl = $(el).find('strong, b').first()
                if (strongEl.length > 0) {
                    const strongText = strongEl.text().trim()
                    const fullText = $(el).text().trim()
                    if (strongText && fullText.startsWith(strongText) && strongText.length < 60 && strongText.split(' ').length < 6) {
                        let definition = fullText.substring(strongText.length).replace(/^[:\-]/, '').trim()
                        if (definition && definition.length > 10) {
                            extractedWords.push({ term: normalizeTerm(strongText), definition: definition, related: [], type: extractSemantics(definition) })
                        }
                    }
                }
            })

        } else {
            // Plaintext / Markdown heuristic
            extractFromMarkdown(content)
        }

        // De-duplicate extracted words by term (simple normalization)
        const uniqueWordsMap = new Map()
        for (const w of extractedWords) {
            const lowTerm = w.term.toLowerCase()
            if (!uniqueWordsMap.has(lowTerm)) {
                uniqueWordsMap.set(lowTerm, w)
            }
        }
        const finalWords = Array.from(uniqueWordsMap.values())

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
    const { term, definition, type, related_terms } = req.body
    try {
        const result = await execute('INSERT INTO words (ontology_id, term, definition, type, related_terms) VALUES (?, ?, ?, ?, ?)', [ontologyId, term, definition, type || 'Class', related_terms || ''])
        res.status(201).json({ id: result.lastID, term, definition, type, related_terms })
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.put('/api/words/:id', authenticateToken, async (req, res) => {
    const { term, definition, type, related_terms } = req.body
    const { id } = req.params
    try {
        await execute('UPDATE words SET term = ?, definition = ?, type = ?, related_terms = ? WHERE id = ?', [term, definition, type, related_terms || '', id])
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

        // Format results to match frontend expectations
        const formattedResults = results.map(row => ({
            id: "term:" + row.id,
            label: row.term,
            uri: `http://localhost/onto/${row.ontology_id}#${row.term.replace(/\s+/g, '')}`,
            ontology: row.ontology_name,
            type: row.type || "Class",
            trust: 100, // Own data
            matchType: "Semantic",
            definition: row.definition
        }))

        res.json(formattedResults)
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})