import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { onValue, orderByChild, push, query, ref, serverTimestamp, set } from 'firebase/database'
import { db, rtdbEnabled } from '../lib/firebase.ts'
import { getIdentity } from '../lib/identity.ts'
import { getCurrentUserStats } from '../lib/stats.ts'

type Room = {
	id: string
	name: string
	createdAt?: number
}

function Lobby() {
	const [allRooms, setAllRooms] = useState<Room[]>(() =>
		rtdbEnabled
			? []
			: [
				{ id: 'demo-room', name: 'CS010A Loops Warmup', createdAt: Date.now() },
			],
	)
	const [presenceMap, setPresenceMap] = useState<Record<string, number>>(() =>
		rtdbEnabled ? ({} as Record<string, number>) : { 'demo-room': 1 },
	)
	const [roomName, setRoomName] = useState('')
	const [joinCode, setJoinCode] = useState('')
	const [isCreating, setIsCreating] = useState(false)
	const [userStats, setUserStats] = useState(() => getCurrentUserStats())
	const navigate = useNavigate()
	const identity = useMemo(() => getIdentity(), [])

	// Filter rooms to only show those with at least 1 person
	const rooms = useMemo(() => {
		return allRooms.filter(room => (presenceMap[room.id] ?? 0) > 0)
	}, [allRooms, presenceMap])

	// Calculate total online users
	const totalOnline = useMemo(() => {
		return Object.values(presenceMap).reduce((sum, count) => sum + count, 0)
	}, [presenceMap])

	// Daily XP calculation (10 XP per correct answer, 100 goal)
	const dailyXP = Math.min(userStats.correctAnswers * 10, 100)
	const dailyXPProgress = (dailyXP / 100) * 100

	// Refresh stats periodically
	useEffect(() => {
		const interval = setInterval(() => {
			setUserStats(getCurrentUserStats())
		}, 3000)
		return () => clearInterval(interval)
	}, [])

	useEffect(() => {
		if (!rtdbEnabled || !db) return
		const roomsRef = query(ref(db, 'rooms'), orderByChild('createdAt'))
		const unsub = onValue(roomsRef, (snapshot) => {
			const next: Room[] = []
			snapshot.forEach((child) => {
				const val = child.val() as Omit<Room, 'id'>
				next.push({ id: child.key ?? '', ...val })
			})
			next.reverse()
			setAllRooms(next)
		})
		return () => unsub()
	}, [])

	useEffect(() => {
		if (!rtdbEnabled || !db) return
		const presenceRef = ref(db, 'presence')
		const unsub = onValue(presenceRef, (snapshot) => {
			const counts: Record<string, number> = {}
			snapshot.forEach((roomSnap) => {
				const val = roomSnap.val()
				const count = val ? Object.keys(val as Record<string, unknown>).length : 0
				counts[roomSnap.key ?? ''] = count
			})
			setPresenceMap(counts)
		})
		return () => unsub()
	}, [])

	const createRoom = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!roomName.trim() || isCreating) return
		
		setIsCreating(true)
		
		try {
			// Offline demo mode
			if (!rtdbEnabled || !db) {
				const id = `demo-${Math.random().toString(36).slice(2, 8)}`
				const newRoom = { id, name: roomName.trim(), createdAt: Date.now() }
				setAllRooms((prev) => [newRoom, ...prev])
				setPresenceMap((prev) => ({ ...prev, [id]: 1 }))
				setRoomName('')
				navigate(`/arena/${id}`)
				return
			}
			
			// Firebase mode
			const listRef = ref(db, 'rooms')
			const newRef = push(listRef)
			if (!newRef.key) {
				throw new Error('Failed to generate room ID')
			}
			await set(newRef, {
				name: roomName.trim(),
				createdAt: serverTimestamp(),
				createdBy: identity.id,
				startTime: Date.now(),
			})
			setRoomName('')
			navigate(`/arena/${newRef.key}`)
		} catch (error) {
			console.error('Failed to create room:', error)
			alert(`Failed to create room: ${error instanceof Error ? error.message : 'Unknown error'}. ${!rtdbEnabled ? 'Running in offline mode.' : 'Please check your Firebase configuration.'}`)
		} finally {
			setIsCreating(false)
		}
	}

	const joinRoom = (id: string) => {
		if (!id) return
		if (!rtdbEnabled) {
			// Ensure the demo room appears in offline mode
			setAllRooms((prev) => {
				const exists = prev.some((room) => room.id === id)
				return exists ? prev : [{ id, name: `Demo Room ${id.slice(-4)}`, createdAt: Date.now() }, ...prev]
			})
			setPresenceMap((prev) => ({ ...prev, [id]: Math.max(prev[id] ?? 0, 1) }))
		}
		navigate(`/arena/${id}`)
	}

	return (
		<div className="mx-auto max-w-4xl p-6 space-y-6">
			{/* Welcome Header with Stats */}
			<div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
				<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
					<div>
						<h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Welcome to CodeTogether</h1>
						<p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
							You are playing as <span className="font-semibold text-blue-600 dark:text-blue-400">{identity.name}</span>
						</p>
					</div>
					
					{/* Stats Cards */}
					<div className="flex items-center gap-3 flex-wrap">
						{/* Streak Card */}
						<div className={`px-4 py-2 rounded-lg border-2 ${
							userStats.streak > 0 
								? 'bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 border-orange-300 dark:border-orange-700' 
								: 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700'
						}`}>
							<div className="flex items-center gap-2">
								<span className="text-xl">🔥</span>
								<div>
									<div className="text-xs text-neutral-500 dark:text-neutral-400">Your Streak</div>
									<div className="font-bold text-lg text-orange-700 dark:text-orange-300">{userStats.streak}</div>
								</div>
							</div>
							{userStats.streak > 0 && (
								<p className="text-[10px] text-orange-600 dark:text-orange-400 mt-0.5">Don't lose it!</p>
							)}
						</div>
						
						{/* Daily XP Card */}
						<div className="px-4 py-2 rounded-lg bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 border-2 border-purple-200 dark:border-purple-800">
							<div className="flex items-center gap-2">
								<span className="text-xl">📊</span>
								<div>
									<div className="text-xs text-neutral-500 dark:text-neutral-400">Today's XP</div>
									<div className="font-bold text-lg text-purple-700 dark:text-purple-300">{dailyXP}/100</div>
								</div>
							</div>
							<div className="w-full h-1.5 bg-purple-200 dark:bg-purple-800 rounded-full mt-1 overflow-hidden">
								<div 
									className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
									style={{ width: `${dailyXPProgress}%` }}
								/>
							</div>
						</div>
						
						{/* Online Users Card */}
						<div className="px-4 py-2 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-2 border-green-200 dark:border-green-800">
							<div className="flex items-center gap-2">
								<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
								<div>
									<div className="text-xs text-neutral-500 dark:text-neutral-400">Students Online</div>
									<div className="font-bold text-lg text-green-700 dark:text-green-300">👥 {totalOnline || 1}</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<div className="border rounded-xl p-4 space-y-3 lg:col-span-2 bg-white dark:bg-neutral-900 shadow-sm">
					<h2 className="font-semibold text-lg flex items-center gap-2">
						<span>🏠</span> Active Rooms
					</h2>
					{rooms.length === 0 ? (
						<p className="text-sm text-neutral-500">
							{rtdbEnabled
								? 'No rooms yet. Create one to get started.'
								: 'Offline demo mode — create a room to prototype the flow.'}
						</p>
					) : (
						<ul className="space-y-2">
							{rooms.map((room) => (
								<li key={room.id} className="border rounded-lg px-4 py-3 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
									<div>
										<p className="font-semibold">{room.name}</p>
										<p className="text-xs text-neutral-500">Room ID: {room.id}</p>
									</div>
									<div className="flex items-center gap-3">
										<span className="flex items-center gap-1 text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
											<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
											{presenceMap[room.id] ?? 0} online
										</span>
										<button 
											type="button"
											className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium active:scale-95 transition-all cursor-pointer touch-manipulation shadow-sm" 
											onClick={() => joinRoom(room.id)}
										>
											Join
										</button>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>

				<div className="space-y-4">
					<form onSubmit={createRoom} className="border rounded-xl p-4 space-y-3 bg-white dark:bg-neutral-900 shadow-sm">
						<h2 className="font-semibold text-sm uppercase tracking-wide text-neutral-500">Create Room</h2>
						<label className="text-sm flex flex-col gap-1">
							<span>Room name</span>
							<input
								type="text"
								className="border rounded-md px-3 py-2 text-sm"
								value={roomName}
								onChange={(e) => setRoomName(e.target.value)}
								placeholder="CS010B Arrays Drill"
							/>
						</label>
						<button 
							type="submit" 
							disabled={isCreating || !roomName.trim()}
							className="w-full px-3 py-2.5 border rounded-md text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 active:scale-95 transition-transform cursor-pointer touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isCreating ? 'Creating...' : 'Create & Join'}
						</button>
					</form>

					<div className="border rounded-xl p-4 space-y-3 bg-white dark:bg-neutral-900 shadow-sm">
						<h2 className="font-semibold text-sm uppercase tracking-wide text-neutral-500">Join by Code</h2>
						<label className="text-sm flex flex-col gap-1">
							<span>Room ID</span>
							<input
								type="text"
								className="border rounded-lg px-3 py-2 text-sm"
								value={joinCode}
								onChange={(e) => setJoinCode(e.target.value)}
								placeholder="Enter room ID"
							/>
						</label>
						<button 
							type="button"
							className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium active:scale-95 transition-all cursor-pointer touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed shadow-sm" 
							onClick={() => joinRoom(joinCode.trim())}
						>
							Join Room
						</button>
					</div>

					{/* Collaborative Activities Section */}
					<div className="border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
						<div className="flex items-center gap-2 mb-3">
							<span className="text-xl">👥</span>
							<h2 className="font-bold text-blue-800 dark:text-blue-200">Collaborative Activities</h2>
						</div>
						<p className="text-sm text-blue-700 dark:text-blue-300 mb-4">Create a room and choose an activity together!</p>
						<div className="grid gap-2">
							<div className="flex items-center gap-3 p-3 bg-white dark:bg-neutral-800 rounded-lg">
								<span className="text-xl">🐛</span>
								<div className="flex-1">
									<p className="font-medium text-neutral-800 dark:text-neutral-200">Fix the Bug</p>
									<p className="text-xs text-neutral-500">Debug C++ code with your team</p>
								</div>
								<span className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">+30 XP</span>
							</div>
							<div className="flex items-center gap-3 p-3 bg-white dark:bg-neutral-800 rounded-lg">
								<span className="text-xl">📝</span>
								<div className="flex-1">
									<p className="font-medium text-neutral-800 dark:text-neutral-200">Fill the Blank</p>
									<p className="text-xs text-neutral-500">Complete missing C++ code together</p>
								</div>
								<span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-full">+25 XP</span>
							</div>
							<div className="flex items-center gap-3 p-3 bg-white dark:bg-neutral-800 rounded-lg">
								<span className="text-xl">🔍</span>
								<div className="flex-1">
									<p className="font-medium text-neutral-800 dark:text-neutral-200">Code Review</p>
									<p className="text-xs text-neutral-500">Improve code quality as a team</p>
								</div>
								<span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">+20 XP</span>
							</div>
							<div className="flex items-center gap-3 p-3 bg-white dark:bg-neutral-800 rounded-lg">
								<span className="text-xl">👯</span>
								<div className="flex-1">
									<p className="font-medium text-neutral-800 dark:text-neutral-200">Pair Programming</p>
									<p className="text-xs text-neutral-500">Solve C++ problems together live</p>
								</div>
								<span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">+35 XP</span>
							</div>
						</div>
						<p className="text-xs text-blue-600 dark:text-blue-400 mt-3 text-center">
							👆 Create a room above to start any activity!
						</p>
					</div>

					{/* Flashcards Navigator Card */}
					<Link to="/flashcards" className="border-2 border-purple-200 dark:border-purple-800 rounded-xl p-4 block bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 hover:shadow-lg transition-all group">
						<div className="flex items-center gap-3 mb-2">
							<span className="text-2xl group-hover:scale-110 transition-transform">📚</span>
							<h2 className="font-bold text-purple-800 dark:text-purple-200">C++ Flashcards</h2>
						</div>
						<p className="text-sm text-purple-700 dark:text-purple-300 mb-3">Study and review C++ concepts with interactive flashcards!</p>
						<div className="flex flex-wrap items-center gap-2 text-xs">
							<span className="px-2 py-1 bg-white dark:bg-neutral-800 rounded-full text-purple-700 dark:text-purple-300 font-medium">🎯 Variables</span>
							<span className="px-2 py-1 bg-white dark:bg-neutral-800 rounded-full text-pink-700 dark:text-pink-300 font-medium">🔄 Loops</span>
							<span className="px-2 py-1 bg-white dark:bg-neutral-800 rounded-full text-indigo-700 dark:text-indigo-300 font-medium">📦 Classes</span>
							<span className="px-2 py-1 bg-white dark:bg-neutral-800 rounded-full text-blue-700 dark:text-blue-300 font-medium">🔗 Pointers</span>
						</div>
					</Link>

					{/* Enhanced Speedrun Card */}
					<Link to="/speedrun" className="border-2 border-orange-200 dark:border-orange-800 rounded-xl p-4 block bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 hover:shadow-lg transition-all group">
						<div className="flex items-center gap-3 mb-2">
							<span className="text-2xl group-hover:scale-110 transition-transform">⚡</span>
							<h2 className="font-bold text-orange-800 dark:text-orange-200">C++ Flashcard Speedrun</h2>
						</div>
						<p className="text-sm text-orange-700 dark:text-orange-300 mb-3">Master C++ fundamentals with rapid-fire MCQs!</p>
						<div className="flex items-center gap-2 text-xs">
							<span className="px-2 py-1 bg-white dark:bg-neutral-800 rounded-full text-orange-700 dark:text-orange-300 font-medium">⚡ Quick: +10 XP</span>
							<span className="px-2 py-1 bg-white dark:bg-neutral-800 rounded-full text-purple-700 dark:text-purple-300 font-medium">🧠 Deep: +25 XP</span>
						</div>
					</Link>
					
					{!rtdbEnabled && (
						<div className="border rounded-xl p-4 text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-800">
							Firebase Realtime Database is not configured. Add <code className="bg-neutral-200 dark:bg-neutral-700 px-1 py-0.5 rounded">VITE_FIREBASE_DATABASE_URL</code> to your <code className="bg-neutral-200 dark:bg-neutral-700 px-1 py-0.5 rounded">.env</code> to enable shared rooms, presence, and chat. Until then, lobby data is local to this browser.
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

export default Lobby


