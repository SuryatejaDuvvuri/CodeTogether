import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { onValue, orderByChild, push, query, ref, serverTimestamp, set } from 'firebase/database'
import { db, rtdbEnabled } from '../lib/firebase.ts'
import { getIdentity } from '../lib/identity.ts'

type Room = {
	id: string
	name: string
	createdAt?: number
}

function Lobby() {
	const [rooms, setRooms] = useState<Room[]>(() =>
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
	const navigate = useNavigate()
	const identity = useMemo(() => getIdentity(), [])

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
			setRooms(next)
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
				setRooms((prev) => [newRoom, ...prev])
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
			setRooms((prev) => {
				const exists = prev.some((room) => room.id === id)
				return exists ? prev : [{ id, name: `Demo Room ${id.slice(-4)}`, createdAt: Date.now() }, ...prev]
			})
			setPresenceMap((prev) => ({ ...prev, [id]: Math.max(prev[id] ?? 0, 1) }))
		}
		navigate(`/arena/${id}`)
	}

	return (
		<div className="mx-auto max-w-5xl p-6 space-y-6">
			{/* Welcome Header */}
			<div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
				<h1 className="text-3xl font-bold mb-2 text-neutral-900 dark:text-neutral-100">Welcome to CodeTogether</h1>
				<p className="text-sm text-neutral-700 dark:text-neutral-300">
					You are playing as <span className="font-semibold text-blue-700 dark:text-blue-300">{identity.name}</span>. Create a new room or join an existing one to start collaborating. Warm up anytime with the speedrun mode.
				</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Active Rooms */}
				<div className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl p-5 space-y-4 lg:col-span-2 bg-white dark:bg-neutral-900 shadow-lg">
					<h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Active Rooms</h2>
					{rooms.length === 0 ? (
						<div className="text-center py-8 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700">
							<p className="text-sm text-neutral-500 dark:text-neutral-400">
								{rtdbEnabled
									? 'No rooms yet. Create one to get started.'
									: 'Offline demo mode — create a room to prototype the flow.'}
							</p>
						</div>
					) : (
						<ul className="space-y-3">
							{rooms.map((room) => (
								<li key={room.id} className="border-2 border-neutral-200 dark:border-neutral-700 rounded-lg px-4 py-3 flex items-center justify-between bg-white dark:bg-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shadow-sm">
									<div className="flex-1">
										<p className="font-semibold text-neutral-900 dark:text-neutral-100">{room.name}</p>
										<p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 font-mono">ID: {room.id.slice(0, 20)}...</p>
									</div>
									<div className="flex items-center gap-4">
										<div className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 dark:bg-neutral-700 rounded-full">
											<span className="w-2 h-2 bg-green-500 rounded-full"></span>
											<span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{presenceMap[room.id] ?? 0} online</span>
										</div>
										<button 
											type="button"
											className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer touch-manipulation active:scale-95 shadow-md hover:shadow-lg" 
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
					{/* Create Room */}
					<form onSubmit={createRoom} className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl p-5 space-y-4 bg-white dark:bg-neutral-900 shadow-lg">
						<h2 className="font-bold text-base text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
							<span>➕</span>
							<span>Create Room</span>
						</h2>
						<label className="text-sm flex flex-col gap-2">
							<span className="font-medium text-neutral-700 dark:text-neutral-300">Room name</span>
							<input
								type="text"
								className="border-2 border-neutral-300 dark:border-neutral-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
								value={roomName}
								onChange={(e) => setRoomName(e.target.value)}
								placeholder="CS010B Arrays Drill"
							/>
						</label>
						<button 
							type="submit" 
							disabled={isCreating || !roomName.trim()}
							className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-neutral-400 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer touch-manipulation active:scale-95 shadow-md hover:shadow-lg disabled:cursor-not-allowed"
						>
							{isCreating ? '⏳ Creating...' : '✨ Create & Join'}
						</button>
					</form>

					{/* Join by Code */}
					<div className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl p-5 space-y-4 bg-white dark:bg-neutral-900 shadow-lg">
						<h2 className="font-bold text-base text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
							<span>🔑</span>
							<span>Join by Code</span>
						</h2>
						<label className="text-sm flex flex-col gap-2">
							<span className="font-medium text-neutral-700 dark:text-neutral-300">Room ID</span>
							<input
								type="text"
								className="border-2 border-neutral-300 dark:border-neutral-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono"
								value={joinCode}
								onChange={(e) => setJoinCode(e.target.value)}
								placeholder="Enter room ID"
							/>
						</label>
						<button 
							type="button"
							className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer touch-manipulation active:scale-95 shadow-md hover:shadow-lg" 
							onClick={() => joinRoom(joinCode.trim())}
						>
							🚀 Join Room
						</button>
					</div>

					{/* Learning Modes */}
					<div className="space-y-3">
						<Link to="/speedrun" className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl p-4 block hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all bg-white dark:bg-neutral-900 shadow-md hover:shadow-lg">
							<h2 className="font-bold mb-1.5 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
								<span>⚡</span>
								<span>Flashcard Speedrun</span>
							</h2>
							<p className="text-sm text-neutral-600 dark:text-neutral-400">5-second MCQs generated from course-aligned content.</p>
						</Link>
						<Link to="/flashcards" className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl p-4 block hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all bg-white dark:bg-neutral-900 shadow-md hover:shadow-lg">
							<h2 className="font-bold mb-1.5 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
								<span>🎴</span>
								<span>Spaced Repetition Flashcards</span>
							</h2>
							<p className="text-sm text-neutral-600 dark:text-neutral-400">Flip cards with spaced repetition algorithm for long-term retention.</p>
						</Link>
					</div>

					{/* Quick Start Modes */}
					<div className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl p-5 space-y-3 bg-white dark:bg-neutral-900 shadow-lg">
						<h2 className="font-bold text-base text-neutral-900 dark:text-neutral-100 flex items-center gap-2 mb-3">
							<span>🚀</span>
							<span>Quick Start</span>
						</h2>
						<button
							type="button"
							onClick={() => {
								const id = `practice-${Math.random().toString(36).slice(2, 8)}`
								navigate(`/arena/${id}`)
							}}
							className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer touch-manipulation active:scale-95 shadow-md hover:shadow-lg text-left flex items-center gap-2"
						>
							<span>💻</span>
							<span>Practice Alone</span>
						</button>
						<button
							type="button"
							onClick={() => {
								const id = `challenge-${Math.random().toString(36).slice(2, 8)}`
								navigate(`/arena/${id}`)
							}}
							className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer touch-manipulation active:scale-95 shadow-md hover:shadow-lg text-left flex items-center gap-2"
						>
							<span>⏱️</span>
							<span>5-Minute Challenge</span>
						</button>
						<button
							type="button"
							onClick={() => {
								// Mock: Match with a random partner (for demo, just create a room)
								const id = `pair-${Math.random().toString(36).slice(2, 8)}`
								navigate(`/arena/${id}`)
							}}
							className="w-full px-4 py-3 bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer touch-manipulation active:scale-95 shadow-md hover:shadow-lg text-left flex items-center gap-2"
						>
							<span>👥</span>
							<span>Match With Study Partner</span>
						</button>
					</div>
					{!rtdbEnabled && (
						<div className="border rounded-lg p-4 text-xs text-neutral-500">
							Firebase Realtime Database is not configured. Add <code>VITE_FIREBASE_DATABASE_URL</code> to your <code>.env</code> to enable shared rooms, presence, and chat. Until then, lobby data is local to this browser.
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

export default Lobby


