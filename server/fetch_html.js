import fs from 'fs';
import https from 'https';

https.get('https://modellen.jenvgegevens.nl/gegevenskwaliteitsbeleid/', (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        fs.writeFileSync('C:/Users/julia/.gemini/antigravity/scratch/ontoindex/server/target_page.html', rawData);
        console.log('Saved to target_page.html');
    });
}).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
});
