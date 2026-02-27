import axios from 'axios'

async function testMine() {
    try {
        console.log('Logging in as testuser...');
        let loginRes;
        try {
            // First try registering
            loginRes = await axios.post('http://localhost:3001/api/auth/register', { username: 'testuser', password: 'password123' })
        } catch (e) {
            // If already exists, login
            loginRes = await axios.post('http://localhost:3001/api/auth/login', { username: 'testuser', password: 'password123' })
        }

        let token = loginRes.data.token || '';
        if (!token) {
            loginRes = await axios.post('http://localhost:3001/api/auth/login', { username: 'testuser', password: 'password123' })
            token = loginRes.data.token;
        }

        console.log('Got token, mining URL...')
        const res = await axios.post('http://localhost:3001/api/ontologies/mine', {
            url: 'https://modellen.jenvgegevens.nl/gegevenskwaliteitsbeleid/'
        }, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        console.log('Done:', res.data)
    } catch (error) {
        console.error('Error during mine test', error.response?.data || error.message)
    }
}
testMine()
