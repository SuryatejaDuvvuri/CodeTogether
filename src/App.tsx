import { Link, NavLink, Route, Routes } from 'react-router-dom'
import './App.css'
import Lobby from './pages/Lobby.tsx'
import Arena from './pages/Arena.tsx'
import Speedrun from './pages/Speedrun.tsx'
import Leaderboard from './pages/Leaderboard.tsx'
import Flashcards from './pages/Flashcards.tsx'

function App() {
	return (
		<div className="min-h-screen flex flex-col">
			<header className="border-b">
				<div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
					<Link to="/" className="text-xl font-semibold">
						CodeTogether
					</Link>
					<nav className="flex items-center gap-4 text-sm">
						<NavLink to="/" end className={({ isActive }) => isActive ? 'font-semibold' : ''}>Lobby</NavLink>
						<NavLink to="/arena" className={({ isActive }) => isActive ? 'font-semibold' : ''}>Arena</NavLink>
						<NavLink to="/speedrun" className={({ isActive }) => isActive ? 'font-semibold' : ''}>Speedrun</NavLink>
						<NavLink to="/flashcards" className={({ isActive }) => isActive ? 'font-semibold' : ''}>Flashcards</NavLink>
						<NavLink to="/leaderboard" className={({ isActive }) => isActive ? 'font-semibold' : ''}>Leaderboard</NavLink>
					</nav>
				</div>
			</header>
			<main className="flex-1">
				<Routes>
					<Route path="/" element={<Lobby />} />
					<Route path="/arena" element={<Arena />} />
					<Route path="/arena/:roomId" element={<Arena />} />
					<Route path="/speedrun" element={<Speedrun />} />
					<Route path="/flashcards" element={<Flashcards />} />
					<Route path="/leaderboard" element={<Leaderboard />} />
				</Routes>
			</main>
			<footer className="border-t">
				<div className="mx-auto max-w-6xl px-4 py-3 text-xs text-neutral-500">
					© {new Date().getFullYear()} CodeTogether — UCR CS175 Team 01
				</div>
			</footer>
		</div>
	)
}

export default App
