import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { useMemo, useState, useEffect } from 'react'
import './App.css'
import Lobby from './pages/Lobby.tsx'
import Arena from './pages/Arena.tsx'
import Speedrun from './pages/Speedrun.tsx'
import Leaderboard from './pages/Leaderboard.tsx'
import Flashcards from './pages/Flashcards.tsx'
import { getIdentity } from './lib/identity.ts'
import { getCurrentUserStats } from './lib/stats.ts'

const styles = {
  app: {
    minHeight: '100vh',
    backgroundColor: '#111113',
    color: '#e4e4e7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    height: '56px',
    borderBottom: '1px solid #27272a',
    backgroundColor: '#18181b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
  },
  logo: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
    textDecoration: 'none',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  navLink: {
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#a1a1aa',
    textDecoration: 'none',
    transition: 'all 0.15s',
  },
  navLinkActive: {
    backgroundColor: '#3b82f6',
    color: '#fff',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  streak: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#fb923c',
    fontWeight: 600,
  },
  user: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingLeft: '16px',
    borderLeft: '1px solid #27272a',
    color: '#71717a',
    fontSize: '14px',
  },
  onlineDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#22c55e',
  },
} as const

function App() {
  const identity = useMemo(() => getIdentity(), [])
  const [stats, setStats] = useState(() => getCurrentUserStats())
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('codetogether:sound')
    return stored !== 'false'
  })
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getCurrentUserStats())
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const toggleSound = () => {
    const newValue = !soundEnabled
    setSoundEnabled(newValue)
    localStorage.setItem('codetogether:sound', String(newValue))
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <Link to="/" style={styles.logo}>CodeTogether</Link>
        
        <nav style={styles.nav}>
          <NavLink 
            to="/" 
            end 
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? styles.navLinkActive : {}),
            })}
          >
            Lobby
          </NavLink>
          <NavLink 
            to="/arena" 
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? styles.navLinkActive : {}),
            })}
          >
            Arena
          </NavLink>
          <NavLink 
            to="/flashcards" 
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? { ...styles.navLinkActive, backgroundColor: '#9333ea' } : {}),
            })}
          >
            Flashcards
          </NavLink>
          <NavLink 
            to="/speedrun" 
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? { ...styles.navLinkActive, backgroundColor: '#ea580c' } : {}),
            })}
          >
            Speedrun
          </NavLink>
          <NavLink 
            to="/leaderboard" 
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? styles.navLinkActive : {}),
            })}
          >
            Leaderboard
          </NavLink>
        </nav>

        <div style={styles.rightSection}>
          <div style={styles.streak}>
            <span>🔥</span>
            <span>{stats.streak}</span>
          </div>
          
          <button
            type="button"
            onClick={toggleSound}
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer',
              fontSize: '18px',
              padding: '8px',
            }}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>

          <div style={styles.user}>
            <div style={styles.onlineDot}></div>
            <span>{identity.name}</span>
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/arena" element={<Arena />} />
          <Route path="/arena/:roomId" element={<Arena />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/speedrun" element={<Speedrun />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </main>
    </div>
  )
}

export default App