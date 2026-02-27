import React, { useState } from 'react'
import { ShieldCheck, Activity } from 'lucide-react'

export function AuthViews({ onLoginSuccess }) {
    const [isLogin, setIsLogin] = useState(true)
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        try {
            const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
            const response = await fetch(`http://localhost:3001${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.error || 'Authentication failed')
            }

            if (isLogin) {
                // Save token and invoke callback
                localStorage.setItem('onto_token', data.token)
                localStorage.setItem('onto_user', JSON.stringify(data.user))
                onLoginSuccess()
            } else {
                // On register success, switch to login
                setIsLogin(true)
                setError('Registration successful! Please sign in.')
            }
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <div className="container animate-fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '400px' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <ShieldCheck size={48} color="var(--accent-primary)" style={{ margin: '0 auto 1rem' }} />
                    <h2 className="h2">{isLogin ? 'Sign In' : 'Create Account'}</h2>
                    <p className="text-muted text-sm">Access the Ontology Management Dashboard</p>
                </div>

                {error && (
                    <div style={{ padding: '0.75rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label className="text-sm font-semibold text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Username</label>
                        <input
                            type="text"
                            className="input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Password</label>
                        <input
                            type="password"
                            className="input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', padding: '0.8rem' }}>
                        {isLogin ? 'Sign In' : 'Register'}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                    >
                        {isLogin ? "Don't have an account? Create one" : "Already have an account? Sign in"}
                    </button>
                </div>
            </div>
        </div>
    )
}
