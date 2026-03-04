import fs from 'fs';
import https from 'https';

https.get('https://modellen.jenvgegevens.nl/gegevenskwaliteitsbeleid/begrippenkader-gegevenskwaliteitsbeleid.md', (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        console.log(rawData.substring(0, 1000));
    });
}).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
});
