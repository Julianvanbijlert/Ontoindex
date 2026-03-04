const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

const newMineEndpoint = `app.post('/api/ontologies/mine', authenticateToken, async (req, res) => {
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

        if (contentType.includes('text/html')) {
            // Stage 1 & 2: HTML DOM Extraction
            const cheerio = require('cheerio')
            const $ = cheerio.load(content)
            
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

            // Strategy B: Tables with "Term" and "Definition" headers
            $('table').each((_, table) => {
                const headers = []
                $(table).find('th, thead td').each((i, th) => headers.push($(th).text().trim().toLowerCase()))
                
                const termIdx = headers.findIndex(h => h.includes('term') || h.includes('concept') || h.includes('name'))
                const defIdx = headers.findIndex(h => h.includes('definition') || h.includes('description') || h.includes('meaning'))
                
                if (termIdx !== -1 && defIdx !== -1) {
                    $(table).find('tbody tr, tr').each((_, tr) => {
                        const cells = $(tr).find('td')
                        if (cells.length > Math.max(termIdx, defIdx)) {
                            const term = normalizeTerm($(cells[termIdx]).text())
                            const definition = $(cells[defIdx]).text().trim()
                            if (term && definition) {
                                extractedWords.push({ term, definition, related: [], type: extractSemantics(definition) })
                            }
                        }
                    })
                }
            })

            // Strategy C: <h2>/<h3> headers followed by <p>
            $('h2, h3').each((_, heading) => {
                const termText = $(heading).text().trim()
                // heuristic for terms: usually short
                if (termText && termText.length < 50 && termText.split(' ').length < 5) {
                    let nextEl = $(heading).next()
                    let definition = ''
                    // Collect up to next header
                    while (nextEl.length && !nextEl.is('h1, h2, h3, h4, h5, h6')) {
                        if (nextEl.is('p')) {
                            definition += nextEl.text().trim() + ' '
                        }
                        // Also look for lists that might be related terms
                    }
                    if (definition.trim()) {
                        extractedWords.push({ term: normalizeTerm(termText), definition: definition.trim(), related: [], type: extractSemantics(definition) })
                    }
                }
            })

        } else {
            // Plaintext / Markdown heuristic
            const lines = content.split('\n')
            let currentWord = null

            for (let line of lines) {
                line = line.trim()
                if (line.startsWith('### ')) {
                    if (currentWord && currentWord.term) {
                        extractedWords.push(currentWord)
                    }
                    currentWord = { term: normalizeTerm(line.replace('### ', '')), definition: '', related: [], type: 'Class' }
                } else if (currentWord && line.startsWith('> ')) {
                    currentWord.definition += line.replace('> ', '').trim() + ' '
                } else if (currentWord && line.startsWith('Gerelateerd:')) {
                    const relatedText = line.replace('Gerelateerd:', '').trim()
                    const links = Array.from(relatedText.matchAll(/\\[([^\\]]+)\\]/g))
                    if (links.length > 0) {
                        links.forEach(m => currentWord.related.push(m[1].trim()))
                    } else {
                        currentWord.related.push(relatedText)
                    }
                } else if (currentWord && line.length > 0 && !line.startsWith('Toelichting:') && !line.startsWith('Bron:') && !line.startsWith('Alternatieve aanduiding:') && !line.startsWith('Voorbeeld')) {
                     if (!currentWord.definition) {
                         // assume it's part of the definition
                     }
                }
            }
            if (currentWord && currentWord.term) {
                extractedWords.push(currentWord)
            }
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
        const ontName = name || \`Mined from \${new URL(url).hostname}\`
        const ontDesc = description || \`Automatically extracted from \${url}\`
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
            "@id": \`http://ontoindex.local/ontologies/\${ontology.id}\`,
            "@type": "owl:Ontology",
            "name": ontology.name,
            "description": ontology.description,
            "@graph": words.map(w => ({
                "@id": \`http://ontoindex.local/ontologies/\${ontology.id}/terms/\${encodeURIComponent(w.term.replace(/\\s+/g, '_'))}\`,
                "@type": w.type === 'Property' ? 'owl:DatatypeProperty' : 'owl:Class',
                "name": w.term,
                "description": w.definition,
                ...(w.related_terms ? { "related": w.related_terms.split(',').map(r => r.trim()) } : {})
            }))
        }

        res.setHeader('Content-Type', 'application/ld+json')
        res.setHeader('Content-Disposition', \`attachment; filename="\${ontology.name.replace(/\\s+/g, '_')}.jsonld"\`)
        res.send(JSON.stringify(jsonLd, null, 2))
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

`;

const startStr = "app.post('/api/ontologies/mine'";
const endStr = "app.put('/api/ontologies/:id'";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    const newCode = code.substring(0, startIndex) + newMineEndpoint + code.substring(endIndex);
    fs.writeFileSync('index.js', newCode);
    console.log('Replaced successfully');
} else {
    console.log('Indices not found: start', startIndex, 'end', endIndex);
}
