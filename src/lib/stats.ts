import { get, onValue, ref, set, serverTimestamp } from 'firebase/database'
import { db, rtdbEnabled } from './firebase.ts'
import { getIdentity } from './identity.ts'

export type UserStats = {
	name: string
	accuracy: number // Percentage of correct answers
	streak: number // Current or best streak
	collaboration: number // Collaboration score (based on active participation)
	consistency: number // Days active or sessions completed
	totalQuestions: number
	correctAnswers: number
	// Active collaboration metrics
	codeEdits: number // Number of code edits made in collaborative sessions
	chatMessages: number // Number of chat messages sent
	activeTime: number // Minutes spent actively collaborating
	lastUpdated?: number
	// Daily streak tracking
	dailyStreak?: number // Consecutive days of activity
	lastActiveDate?: string // YYYY-MM-DD format
	bestDailyStreak?: number // Best daily streak ever
}

export type RoomStats = {
	roomId: string
	roomName: string
	participants: Array<{ id: string; name: string }>
	totalEdits: number
	totalMessages: number
	totalActiveTime: number // Total minutes across all participants
	score: number // Team score
	createdAt?: number
	lastActivity?: number
}

const STORAGE_KEY = 'codetogether:stats'

// Get stats from localStorage (offline mode)
function getLocalStats(): UserStats {
	if (typeof window === 'undefined') {
		return getDefaultStats('Server')
	}
	
	const identity = getIdentity()
	const stored = window.localStorage.getItem(`${STORAGE_KEY}-${identity.id}`)
	if (stored) {
		return JSON.parse(stored) as UserStats
	}
	return getDefaultStats(identity.name)
}

// Save stats to localStorage (offline mode)
function saveLocalStats(stats: UserStats) {
	if (typeof window === 'undefined') return
	
	const identity = getIdentity()
	window.localStorage.setItem(`${STORAGE_KEY}-${identity.id}`, JSON.stringify(stats))
}

// Get default stats
function getDefaultStats(name: string): UserStats {
	return {
		name,
		accuracy: 0,
		streak: 0,
		collaboration: 0,
		consistency: 0,
		totalQuestions: 0,
		correctAnswers: 0,
		codeEdits: 0,
		chatMessages: 0,
		activeTime: 0,
		dailyStreak: 0,
		lastActiveDate: undefined,
		bestDailyStreak: 0,
	}
}

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
	return new Date().toISOString().split('T')[0]
}

// Check and update daily streak
function updateDailyStreak(stats: UserStats): UserStats {
	const today = getTodayDate()
	const yesterday = new Date()
	yesterday.setDate(yesterday.getDate() - 1)
	const yesterdayStr = yesterday.toISOString().split('T')[0]
	
	if (stats.lastActiveDate === today) {
		// Already active today, no change needed
		return stats
	}
	
	if (stats.lastActiveDate === yesterdayStr) {
		// Consecutive day! Increment streak
		stats.dailyStreak = (stats.dailyStreak || 0) + 1
		stats.bestDailyStreak = Math.max(stats.bestDailyStreak || 0, stats.dailyStreak)
		stats.consistency = Math.max(stats.consistency, stats.dailyStreak)
	} else if (!stats.lastActiveDate) {
		// First activity ever
		stats.dailyStreak = 1
		stats.bestDailyStreak = 1
		stats.consistency = 1
	} else {
		// Streak broken! Reset to 1
		stats.dailyStreak = 1
	}
	
	stats.lastActiveDate = today
	return stats
}

// Calculate accuracy percentage
function calculateAccuracy(stats: UserStats): number {
	if (stats.totalQuestions === 0) return 0
	return Math.round((stats.correctAnswers / stats.totalQuestions) * 100)
}

// Update stats after answering a question
export async function recordAnswer(isCorrect: boolean, currentStreak: number) {
	const identity = getIdentity()
	let stats = getLocalStats()
	
	stats.totalQuestions += 1
	if (isCorrect) {
		stats.correctAnswers += 1
	}
	stats.streak = Math.max(stats.streak, currentStreak)
	
	// Update daily streak tracking
	stats = updateDailyStreak(stats)
	stats.accuracy = calculateAccuracy(stats)
	stats.lastUpdated = Date.now()
	
	saveLocalStats(stats)
	
	// Also save to Firebase if enabled
	if (rtdbEnabled && db) {
		try {
			const statsRef = ref(db, `stats/${identity.id}`)
			await set(statsRef, {
				name: identity.name,
				accuracy: stats.accuracy,
				streak: stats.streak,
				collaboration: stats.collaboration,
				consistency: stats.consistency,
				totalQuestions: stats.totalQuestions,
				correctAnswers: stats.correctAnswers,
				lastUpdated: serverTimestamp(),
			})
		} catch (error) {
			console.error('Failed to save stats to Firebase:', error)
		}
	}
}

// Calculate collaboration score based on active participation
function calculateCollaborationScore(stats: UserStats): number {
	// Weighted formula: edits (40%), messages (30%), active time (30%)
	const editScore = Math.min(stats.codeEdits * 0.1, 40) // Max 40 points from edits
	const messageScore = Math.min(stats.chatMessages * 0.5, 30) // Max 30 points from messages
	const timeScore = Math.min(stats.activeTime * 0.5, 30) // Max 30 points from active time
	return Math.round(editScore + messageScore + timeScore)
}

// Record a code edit in collaborative session
export async function recordCodeEdit(roomId: string) {
	const identity = getIdentity()
	const stats = getLocalStats()
	
	stats.codeEdits += 1
	stats.collaboration = calculateCollaborationScore(stats)
	stats.lastUpdated = Date.now()
	
	saveLocalStats(stats)
	
	// Also save to Firebase if enabled
	if (rtdbEnabled && db) {
		try {
			const statsRef = ref(db, `stats/${identity.id}`)
			await set(statsRef, {
				name: identity.name,
				accuracy: stats.accuracy,
				streak: stats.streak,
				collaboration: stats.collaboration,
				consistency: stats.consistency,
				totalQuestions: stats.totalQuestions,
				correctAnswers: stats.correctAnswers,
				codeEdits: stats.codeEdits,
				chatMessages: stats.chatMessages,
				activeTime: stats.activeTime,
				lastUpdated: serverTimestamp(),
			})
			
			// Also update room stats
			await incrementRoomEdits(roomId)
		} catch (error) {
			console.error('Failed to save stats to Firebase:', error)
		}
	}
}

// Record a chat message in collaborative session
export async function recordChatMessage(_roomId: string) {
	const identity = getIdentity()
	const stats = getLocalStats()
	
	stats.chatMessages += 1
	stats.collaboration = calculateCollaborationScore(stats)
	stats.lastUpdated = Date.now()
	
	saveLocalStats(stats)
	
	// Also save to Firebase if enabled
	if (rtdbEnabled && db) {
		try {
			const statsRef = ref(db, `stats/${identity.id}`)
			await set(statsRef, {
				name: identity.name,
				accuracy: stats.accuracy,
				streak: stats.streak,
				collaboration: stats.collaboration,
				consistency: stats.consistency,
				totalQuestions: stats.totalQuestions,
				correctAnswers: stats.correctAnswers,
				codeEdits: stats.codeEdits,
				chatMessages: stats.chatMessages,
				activeTime: stats.activeTime,
				lastUpdated: serverTimestamp(),
			})
		} catch (error) {
			console.error('Failed to save stats to Firebase:', error)
		}
	}
}

// Record active time in collaborative session (call periodically, e.g., every minute)
export async function recordActiveTime(_roomId: string, minutes: number = 1) {
	const identity = getIdentity()
	const stats = getLocalStats()
	
	stats.activeTime += minutes
	stats.collaboration = calculateCollaborationScore(stats)
	stats.lastUpdated = Date.now()
	
	saveLocalStats(stats)
	
	// Also save to Firebase if enabled
	if (rtdbEnabled && db) {
		try {
			const statsRef = ref(db, `stats/${identity.id}`)
			await set(statsRef, {
				name: identity.name,
				accuracy: stats.accuracy,
				streak: stats.streak,
				collaboration: stats.collaboration,
				consistency: stats.consistency,
				totalQuestions: stats.totalQuestions,
				correctAnswers: stats.correctAnswers,
				codeEdits: stats.codeEdits,
				chatMessages: stats.chatMessages,
				activeTime: stats.activeTime,
				lastUpdated: serverTimestamp(),
			})
		} catch (error) {
			console.error('Failed to save stats to Firebase:', error)
		}
	}
}

// Update collaboration stats (legacy - now we track active participation instead)
export async function recordCollaboration() {
	const identity = getIdentity()
	const stats = getLocalStats()
	
	stats.consistency += 1
	stats.lastUpdated = Date.now()
	
	saveLocalStats(stats)
	
	// Also save to Firebase if enabled
	if (rtdbEnabled && db) {
		try {
			const statsRef = ref(db, `stats/${identity.id}`)
			await set(statsRef, {
				name: identity.name,
				accuracy: stats.accuracy,
				streak: stats.streak,
				collaboration: stats.collaboration,
				consistency: stats.consistency,
				totalQuestions: stats.totalQuestions,
				correctAnswers: stats.correctAnswers,
				codeEdits: stats.codeEdits,
				chatMessages: stats.chatMessages,
				activeTime: stats.activeTime,
				lastUpdated: serverTimestamp(),
			})
		} catch (error) {
			console.error('Failed to save stats to Firebase:', error)
		}
	}
}

// Get current user's stats
export function getCurrentUserStats(): UserStats {
	return getLocalStats()
}

// Get all individual leaderboard entries (for Speedrun)
export function useIndividualLeaderboard(
	callback: (entries: Array<UserStats & { id: string; total: number }>) => void,
) {
	if (!rtdbEnabled || !db) {
		// Offline mode: return local stats only
		const identity = getIdentity()
		const stats = getLocalStats()
		const total = calculateIndividualScore(stats)
		callback([{ ...stats, id: identity.id, total }])
		return () => {}
	}
	
	const statsRef = ref(db, 'stats')
	const unsubscribe = onValue(statsRef, (snapshot) => {
		const entries: Array<UserStats & { id: string; total: number }> = []
		snapshot.forEach((child) => {
			const val = child.val() as Omit<UserStats, 'id'>
			const stats: UserStats = {
				name: val.name || 'Anonymous',
				accuracy: val.accuracy || 0,
				streak: val.streak || 0,
				collaboration: val.collaboration || 0,
				consistency: val.consistency || 0,
				totalQuestions: val.totalQuestions || 0,
				correctAnswers: val.correctAnswers || 0,
				codeEdits: val.codeEdits || 0,
				chatMessages: val.chatMessages || 0,
				activeTime: val.activeTime || 0,
				lastUpdated: val.lastUpdated,
			}
			const total = calculateIndividualScore(stats)
			entries.push({ ...stats, id: child.key ?? '', total })
		})
		
		// Sort by total score descending
		entries.sort((a, b) => b.total - a.total)
		callback(entries)
	})
	
	return () => unsubscribe()
}

// Get all team/room leaderboard entries (for Arena)
export function useTeamLeaderboard(
	callback: (entries: Array<RoomStats & { id: string }>) => void,
) {
	if (!rtdbEnabled || !db) {
		// Offline mode: return empty
		callback([])
		return () => {}
	}
	
	const roomStatsRef = ref(db, 'roomStats')
	const unsubscribe = onValue(roomStatsRef, (snapshot) => {
		const entries: Array<RoomStats & { id: string }> = []
		snapshot.forEach((child) => {
			const val = child.val() as Omit<RoomStats, 'id'>
			const roomStats: RoomStats = {
				roomId: val.roomId || child.key || '',
				roomName: val.roomName || 'Untitled Room',
				participants: val.participants || [],
				totalEdits: val.totalEdits || 0,
				totalMessages: val.totalMessages || 0,
				totalActiveTime: val.totalActiveTime || 0,
				score: calculateTeamScore(val),
				createdAt: val.createdAt,
				lastActivity: val.lastActivity,
			}
			entries.push({ ...roomStats, id: child.key ?? '' })
		})
		
		// Sort by score descending
		entries.sort((a, b) => b.score - a.score)
		callback(entries)
	})
	
	return () => unsubscribe()
}

// Calculate team score for a room
function calculateTeamScore(room: Omit<RoomStats, 'id' | 'score'>): number {
	// Team score based on: edits (40%), messages (30%), active time (30%)
	const editScore = Math.min(room.totalEdits * 0.2, 40)
	const messageScore = Math.min(room.totalMessages * 1, 30)
	const timeScore = Math.min(room.totalActiveTime * 0.5, 30)
	return Math.round(editScore + messageScore + timeScore)
}

// Calculate individual score for Speedrun leaderboard: 0.4*A + 0.25*F + 0.2*C + 0.15*D
// Note: C (collaboration) is now based on active participation, not just joining
function calculateIndividualScore(stats: UserStats): number {
	const A = stats.accuracy
	const F = stats.streak
	const C = stats.collaboration
	const D = stats.consistency
	return 0.4 * A + 0.25 * F + 0.2 * C + 0.15 * D
}

// Update room stats when activity happens
export async function updateRoomStats(roomId: string, roomName: string, participantIds: string[]) {
	if (!rtdbEnabled || !db) return
	
	try {
		const roomStatsRef = ref(db, `roomStats/${roomId}`)
		const snapshot = await get(roomStatsRef)
		
		const current = snapshot.val() as Partial<RoomStats> | null
		const updates: Partial<RoomStats> & { lastActivity?: any; createdAt?: any } = {
			roomId,
			roomName,
			participants: participantIds.map(id => ({ id, name: 'Loading...' })), // Names will be filled from presence
			totalEdits: current?.totalEdits || 0,
			totalMessages: current?.totalMessages || 0,
			totalActiveTime: current?.totalActiveTime || 0,
			lastActivity: serverTimestamp() as any,
		}
		
		if (!current) {
			updates.createdAt = serverTimestamp() as any
		}
		
		await set(roomStatsRef, updates)
	} catch (error) {
		console.error('Failed to update room stats:', error)
	}
}

// Increment room edit count
export async function incrementRoomEdits(roomId: string) {
	if (!rtdbEnabled || !db) return
	
	try {
		const roomStatsRef = ref(db, `roomStats/${roomId}/totalEdits`)
		const snapshot = await get(roomStatsRef)
		const current = (snapshot.val() as number) || 0
		await set(roomStatsRef, current + 1)
		
		// Also update last activity
		await set(ref(db, `roomStats/${roomId}/lastActivity`), serverTimestamp())
	} catch (error) {
		console.error('Failed to increment room edits:', error)
	}
}

// Increment room message count
export async function incrementRoomMessages(roomId: string) {
	if (!rtdbEnabled || !db) return
	
	try {
		const roomStatsRef = ref(db, `roomStats/${roomId}/totalMessages`)
		const snapshot = await get(roomStatsRef)
		const current = (snapshot.val() as number) || 0
		await set(roomStatsRef, current + 1)
		
		// Also update last activity
		await set(ref(db, `roomStats/${roomId}/lastActivity`), serverTimestamp())
	} catch (error) {
		console.error('Failed to increment room messages:', error)
	}
}

