import axios from 'axios'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer'

const normalizeTerm = (term) => term.replace(/[:\-]$/g, '').trim()
const extractSemantics = (def) => {
    if (/property|attribute|relation/i.test(def)) return 'Property'
    if (/individual|instance|example/i.test(def)) return 'Individual'
    return 'Class'
}

export const mineUrlRecursively = async (startUrl) => {
    const extractedWords = []
    const visited = new Set()
    const queue = [startUrl]
    const rootUrlObj = new URL(startUrl)
    const MAX_PAGES = 5 // Prevent infinite scrape loops

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

    let browser;
    try {
        browser = await puppeteer.launch({ headless: 'new' })

        while (queue.length > 0 && visited.size < MAX_PAGES) {
            const currentUrl = queue.shift()
            if (visited.has(currentUrl)) continue
            visited.add(currentUrl)

            console.log(`Mining: ${currentUrl}`)

            try {
                // If the URL ends with .md, use pure axios, no need for puppeteer
                if (currentUrl.endsWith('.md')) {
                    const mdRes = await axios.get(currentUrl, { headers: { 'Accept': 'text/markdown, text/plain, */*' } })
                    if (mdRes.data) extractFromMarkdown(mdRes.data)
                    continue;
                }

                const page = await browser.newPage()
                // intercept requests to speed up load? For now just go to url
                await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

                const content = await page.content()

                // Extract links found in nav, sidebars, or generic links
                const links = await page.evaluate(() => {
                    const anchors = Array.from(document.querySelectorAll('nav a, aside a, .sidebar a, ul a'))
                    return anchors.map(a => a.href)
                })

                // Queue same domain links
                for (const link of links) {
                    try {
                        if (link && !link.startsWith('javascript:') && !link.startsWith('mailto:') && !link.includes('#')) {
                            const linkObj = new URL(link, currentUrl)
                            if (linkObj.hostname === rootUrlObj.hostname && !visited.has(linkObj.href.replace(/\/$/, '')) && !queue.includes(linkObj.href.replace(/\/$/, ''))) {
                                // De-dupe trailing slashes
                                queue.push(linkObj.href.replace(/\/$/, ''))
                            }
                        }
                    } catch (e) { }
                }

                // Extract terms using cheerio on the fully rendered DOM
                const $ = cheerio.load(content)

                // Check for ReSpec includes
                const includeElements = $('[data-include$=".md"]')
                if (includeElements.length > 0) {
                    const baseUrl = new URL(currentUrl)
                    for (let i = 0; i < includeElements.length; i++) {
                        const includePath = $(includeElements[i]).attr('data-include')
                        const fullIncludeUrl = new URL(includePath, baseUrl).href
                        if (!visited.has(fullIncludeUrl) && !queue.includes(fullIncludeUrl)) {
                            queue.push(fullIncludeUrl)
                        }
                    }
                }

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

                // Strategy D: Paragraphs or lists starting with bold terms
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

                await page.close()
            } catch (err) {
                console.error(`Error mining ${currentUrl}`, err.message)
            }
        }
    } finally {
        if (browser) await browser.close()
    }

    // De-duplicate extracted words by term
    const uniqueWordsMap = new Map()
    for (const w of extractedWords) {
        const lowTerm = w.term.toLowerCase()
        if (!uniqueWordsMap.has(lowTerm)) {
            uniqueWordsMap.set(lowTerm, w)
        }
    }
    return Array.from(uniqueWordsMap.values())
}
