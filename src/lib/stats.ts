import { get, onValue, ref, set, serverTimestamp } from 'firebase/database'
import { db, rtdbEnabled } from './firebase.ts'
import { getIdentity } from './identity.ts'

export type UserStats = {
	name: string
	xp: number // Total experience points earned
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
	challenge?: string // Challenge they worked on
	participants: Array<{ id: string; name: string }>
	totalEdits: number
	totalMessages: number
	totalActiveTime: number // Total minutes across all participants
	score: number // Team score
	createdAt?: number
	lastActivity?: number
	teamKey?: string // Unique key for grouping same team compositions
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
		xp: 0,
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
export async function recordAnswer(isCorrect: boolean, currentStreak: number, xpToAward: number = 0) {
	const identity = getIdentity()

	// Merge latest stats from Firebase first to avoid overwriting XP/other fields
	let stats = getLocalStats()
	if (rtdbEnabled && db) {
		try {
			const statsRef = ref(db, `stats/${identity.id}`)
			const snap = await get(statsRef)
			if (snap.exists()) {
				const firebaseStats = snap.val()
				stats = {
					...stats,
					...firebaseStats,
				}
			}
		} catch (error) {
			console.error('Failed to read stats from Firebase:', error)
		}
	}
	
	stats.totalQuestions += 1
	if (isCorrect) {
		stats.correctAnswers += 1
		// Award XP for correct answers
		if (xpToAward > 0) {
			stats.xp = (stats.xp || 0) + xpToAward
		}
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
				xp: stats.xp || 0,
				accuracy: stats.accuracy,
				streak: stats.streak,
				collaboration: stats.collaboration,
				consistency: stats.consistency,
				totalQuestions: stats.totalQuestions,
				correctAnswers: stats.correctAnswers,
				codeEdits: stats.codeEdits,
				chatMessages: stats.chatMessages,
				activeTime: stats.activeTime,
				dailyStreak: stats.dailyStreak,
				lastActiveDate: stats.lastActiveDate,
				bestDailyStreak: stats.bestDailyStreak,
				lastUpdated: serverTimestamp(),
			})
		} catch (error) {
			console.error('Failed to save stats to Firebase:', error)
		}
	}
}

// Calculate collaboration score based on active participation
function calculateCollaborationScore(stats: UserStats): number {
	// More balanced formula with diminishing returns
	// Encourages participation but prevents score inflation
	const editScore = Math.min(Math.sqrt(stats.codeEdits) * 8, 35) // Max 35 from edits (sqrt for diminishing returns)
	const messageScore = Math.min(Math.sqrt(stats.chatMessages) * 4, 25) // Max 25 from messages
	const timeScore = Math.min(stats.activeTime * 0.4, 25) // Max 25 from active time (0.4 per minute)
	return Math.round(editScore + messageScore + timeScore)
}

// Record a code edit in collaborative session
export async function recordCodeEdit(roomId: string) {
	const identity = getIdentity()
	
	// Read from Firebase first if available to get latest stats (especially XP)
	let stats = getLocalStats()
	if (rtdbEnabled && db) {
		try {
			const statsRef = ref(db, `stats/${identity.id}`)
			const snap = await get(statsRef)
			if (snap.exists()) {
				const firebaseStats = snap.val()
				// Merge Firebase stats with local stats, preferring Firebase for all fields
				stats = {
					...stats,
					...firebaseStats,
				}
			}
		} catch (error) {
			console.error('Failed to read stats from Firebase:', error)
		}
	}
	
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
				xp: stats.xp || 0,
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
	
	// Read from Firebase first if available to get latest stats (especially XP)
	let stats = getLocalStats()
	if (rtdbEnabled && db) {
		try {
			const statsRef = ref(db, `stats/${identity.id}`)
			const snap = await get(statsRef)
			if (snap.exists()) {
				const firebaseStats = snap.val()
				stats = {
					...stats,
					...firebaseStats,
				}
			}
		} catch (error) {
			console.error('Failed to read stats from Firebase:', error)
		}
	}
	
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
				xp: stats.xp || 0,
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
	
	// Read from Firebase first if available to get latest stats (especially XP)
	let stats = getLocalStats()
	if (rtdbEnabled && db) {
		try {
			const statsRef = ref(db, `stats/${identity.id}`)
			const snap = await get(statsRef)
			if (snap.exists()) {
				const firebaseStats = snap.val()
				stats = {
					...stats,
					...firebaseStats,
				}
			}
		} catch (error) {
			console.error('Failed to read stats from Firebase:', error)
		}
	}
	
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
				xp: stats.xp || 0,
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
				xp: val.xp || 0,
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
		callback([])
		return () => {}
	}
	
	const roomStatsRef = ref(db, 'roomStats')
	const unsubscribe = onValue(roomStatsRef, (snapshot) => {
		const entries: Array<RoomStats & { id: string }> = []
		snapshot.forEach((child) => {
			const val = child.val() as Omit<RoomStats, 'id'>
			if (val && val.totalEdits > 0) { // Only show rooms with activity
				const roomStats: RoomStats & { id: string } = {
					id: child.key ?? '',
					roomId: val.roomId || child.key || '',
					roomName: val.roomName || 'Unnamed Room',
					challenge: val.challenge,
					participants: val.participants || [],
					totalEdits: val.totalEdits || 0,
					totalMessages: val.totalMessages || 0,
					totalActiveTime: val.totalActiveTime || 0,
					score: calculateTeamScore(val),
					lastActivity: val.lastActivity,
					createdAt: val.createdAt,
					teamKey: val.teamKey,
				}
				entries.push(roomStats)
			}
		})
		
		// Sort by score descending
		entries.sort((a, b) => b.score - a.score)
		callback(entries)
	})
	
	return () => unsubscribe()
}

// Calculate team score for a room
function calculateTeamScore(room: Omit<RoomStats, 'id' | 'score'>): number {
	// More balanced team scoring with diminishing returns to prevent spam
	const editScore = Math.min(Math.sqrt(room.totalEdits) * 5, 40) // Max 40 from edits (sqrt for balance)
	const messageScore = Math.min(Math.sqrt(room.totalMessages) * 3, 30) // Max 30 from messages
	const timeScore = Math.min(room.totalActiveTime * 0.3, 30) // Max 30 from active time
	return Math.round(editScore + messageScore + timeScore)
}

// Calculate individual score: Emphasis on collaboration and accuracy, with streak and consistency bonuses
// Formula designed to reward active participation and quality
function calculateIndividualScore(stats: UserStats): number {
	const A = stats.accuracy // 0-100
	const F = Math.min(stats.streak, 50) // Cap streak at 50 for fairness
	const C = stats.collaboration // 0-100
	const D = stats.consistency // 0-100
	
	// Weighted formula: Collaboration is key for this platform
	// 35% collaboration, 35% accuracy, 20% consistency, 10% streak
	return 0.35 * C + 0.35 * A + 0.20 * D + 0.10 * F
}

// Update room stats when activity happens
export async function updateRoomStats(roomId: string, roomName: string, participantIds: string[], challenge?: string) {
	if (!rtdbEnabled || !db) return
	
	try {
		const roomStatsRef = ref(db, `roomStats/${roomId}`)
		const snapshot = await get(roomStatsRef)
		
		// Create team key from sorted participant IDs
		const teamKey = participantIds.slice().sort().join('_')
		
		// Fetch actual participant names - try presence first (real-time), then stats (historical)
		const participants: Array<{ id: string; name: string }> = []
		for (const userId of participantIds) {
			try {
				// First try to get name from presence (current session)
				const presenceSnap = await get(ref(db, `presence/${roomId}/${userId}`))
				const presenceData = presenceSnap.val()
				
				if (presenceData?.name) {
					participants.push({ id: userId, name: presenceData.name })
				} else {
					// Fallback to stats database
					const userStatsSnap = await get(ref(db, `stats/${userId}`))
					const userData = userStatsSnap.val()
					participants.push({ 
						id: userId, 
						name: userData?.name || 'Anonymous' 
					})
				}
			} catch {
				participants.push({ id: userId, name: 'Anonymous' })
			}
		}
		
		const current = snapshot.val() as Partial<RoomStats> | null
		const updates: Partial<RoomStats> & { lastActivity?: any; createdAt?: any } = {
			roomId,
			roomName,
			challenge,
			participants,
			totalEdits: current?.totalEdits || 0,
			totalMessages: current?.totalMessages || 0,
			totalActiveTime: current?.totalActiveTime || 0,
			lastActivity: serverTimestamp() as any,
			teamKey,
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

/**
 * Award XP to a user for completing a challenge
 */
export async function awardXP(xpAmount: number) {
	const identity = getIdentity()

	// Always update local stats so offline/demo mode still reflects XP gains
	const localStats = getLocalStats()
	localStats.xp = (localStats.xp || 0) + xpAmount
	saveLocalStats(localStats)

	// If RTDB isn't enabled, bail after local update
	if (!rtdbEnabled || !db) return
	try {
		const userRef = ref(db, `stats/${identity.id}`)
		const snap = await get(userRef)
		const currentStats = snap.val() || {}
		await set(userRef, {
			...currentStats,
			name: identity.name,
			xp: (currentStats.xp || 0) + xpAmount,
			lastUpdated: serverTimestamp(),
		})
	} catch (e) {
		console.error('Failed to award XP:', e)
	}
}

/**
 * Award XP to all participants in a room for completing a challenge
 */
export async function awardXPToAll(participantIds: string[], xpAmount: number) {
	if (!participantIds || participantIds.length === 0) return

	// Update local stats for the current user even in offline/demo mode
	const identity = getIdentity()
	if (participantIds.includes(identity.id)) {
		const localStats = getLocalStats()
		localStats.xp = (localStats.xp || 0) + xpAmount
		saveLocalStats(localStats)
	}

	// If RTDB is unavailable, stop after the local update
	if (!rtdbEnabled || !db) return
	const database = db // Type guard
	try {
		// Award XP to each participant
		const promises = participantIds.map(async (userId) => {
			try {
				const userRef = ref(database, `stats/${userId}`)
				const snap = await get(userRef)
				const currentStats = snap.val() || {}
				
				// Use existing name from stats, no need to fetch from presence
				const userName = currentStats.name || 'Anonymous'
				
				// Preserve ALL existing stats fields and only update xp
				// Firebase doesn't allow undefined values, so conditionally include lastActiveDate
				const updates: any = {
					name: userName,
					xp: (currentStats.xp || 0) + xpAmount,
					accuracy: currentStats.accuracy || 0,
					streak: currentStats.streak || 0,
					collaboration: currentStats.collaboration || 0,
					consistency: currentStats.consistency || 0,
					totalQuestions: currentStats.totalQuestions || 0,
					correctAnswers: currentStats.correctAnswers || 0,
					codeEdits: currentStats.codeEdits || 0,
					chatMessages: currentStats.chatMessages || 0,
					activeTime: currentStats.activeTime || 0,
					dailyStreak: currentStats.dailyStreak || 0,
					bestDailyStreak: currentStats.bestDailyStreak || 0,
					lastUpdated: serverTimestamp(),
				}
				
				// Only include lastActiveDate if it exists (Firebase rejects undefined)
				if (currentStats.lastActiveDate !== undefined) {
					updates.lastActiveDate = currentStats.lastActiveDate
				}
				
				await set(userRef, updates)
			} catch (e) {
				console.error(`Failed to award XP to user ${userId}:`, e)
			}
		})
		await Promise.all(promises)
	} catch (e) {
		console.error('Failed to award XP to all participants:', e)
	}
}

