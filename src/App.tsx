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

function App() {
  const identity = useMemo(() => getIdentity(), [])
  const [stats, setStats] = useState(() => getCurrentUserStats())
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('codetogether:sound')
    return stored !== 'false'
  })
  
  // Refresh stats periodically
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

  // Calculate daily XP (simplified: 10 XP per correct answer, 100 daily goal)
  const dailyXP = Math.min(stats.correctAnswers * 10, 100)
  const dailyXPProgress = (dailyXP / 100) * 100

  return (
		<div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-blue-50 dark:from-neutral-950 dark:to-slate-900">
			<header className="border-b bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm sticky top-0 z-40">
				<div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Link to="/" className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
							CodeTogether
						</Link>
						{/* Identity Badge */}
						<span className="hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full font-medium">
							<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
							Playing as {identity.name}
						</span>
					</div>
					
					<nav className="flex items-center gap-2 sm:gap-4 text-sm">
						{/* Streak Counter - Always visible */}
						<div className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-100 dark:bg-orange-900/40 rounded-full">
							<span className="text-lg">🔥</span>
							<span className="font-bold text-orange-700 dark:text-orange-300">{stats.streak}</span>
						</div>
						
						{/* Daily XP Progress */}
						<div className="hidden md:flex items-center gap-2 px-2.5 py-1.5 bg-purple-100 dark:bg-purple-900/40 rounded-full">
							<span className="text-sm">📊</span>
							<div className="w-16 h-1.5 bg-purple-200 dark:bg-purple-800 rounded-full overflow-hidden">
								<div 
									className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
									style={{ width: `${dailyXPProgress}%` }}
								/>
							</div>
							<span className="text-xs font-medium text-purple-700 dark:text-purple-300">{dailyXP}/100</span>
						</div>
						
						{/* Sound Toggle */}
						<button
							type="button"
							onClick={toggleSound}
							className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
							title={soundEnabled ? 'Sound On' : 'Sound Off'}
						>
							{soundEnabled ? '🔊' : '🔇'}
						</button>
						
						<div className="hidden sm:flex items-center gap-3">
							<NavLink to="/" end className={({ isActive }) => `px-3 py-1.5 rounded-full transition-all ${isActive ? 'bg-blue-600 text-white font-semibold shadow-md' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>Lobby</NavLink>
							<NavLink to="/arena" className={({ isActive }) => `px-3 py-1.5 rounded-full transition-all ${isActive ? 'bg-blue-600 text-white font-semibold shadow-md' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>Arena</NavLink>
							<NavLink to="/flashcards" className={({ isActive }) => `px-3 py-1.5 rounded-full transition-all ${isActive ? 'bg-purple-600 text-white font-semibold shadow-md' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>📚 Flashcards</NavLink>
							<NavLink to="/speedrun" className={({ isActive }) => `px-3 py-1.5 rounded-full transition-all ${isActive ? 'bg-blue-600 text-white font-semibold shadow-md' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>Speedrun</NavLink>
							<NavLink to="/leaderboard" className={({ isActive }) => `px-3 py-1.5 rounded-full transition-all ${isActive ? 'bg-blue-600 text-white font-semibold shadow-md' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>Leaderboard</NavLink>
						</div>
						
						{/* Mobile nav */}
						<div className="sm:hidden flex items-center gap-2">
							<NavLink to="/" end className={({ isActive }) => isActive ? 'font-bold text-blue-600' : ''}>🏠</NavLink>
							<NavLink to="/arena" className={({ isActive }) => isActive ? 'font-bold text-blue-600' : ''}>⚔️</NavLink>
							<NavLink to="/flashcards" className={({ isActive }) => isActive ? 'font-bold text-purple-600' : ''}>📚</NavLink>
							<NavLink to="/speedrun" className={({ isActive }) => isActive ? 'font-bold text-blue-600' : ''}>⚡</NavLink>
							<NavLink to="/leaderboard" className={({ isActive }) => isActive ? 'font-bold text-blue-600' : ''}>🏆</NavLink>
						</div>
					</nav>
				</div>
			</header>
			<main className="flex-1">
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
