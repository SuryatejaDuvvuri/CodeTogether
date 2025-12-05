import { useEffect, useState, useMemo } from 'react'
import { useIndividualLeaderboard, useTeamLeaderboard, type UserStats, type RoomStats } from '../lib/stats.ts'
import { getIdentity } from '../lib/identity.ts'
import { rtdbEnabled } from '../lib/firebase.ts'

type LeaderboardEntry = UserStats & {
	id: string
	total: number
}

type TeamLeaderboardEntry = RoomStats & {
	id: string
}

function getRankBadge(rank: number): string {
	if (rank === 1) return '🥇'
	if (rank === 2) return '🥈'
	if (rank === 3) return '🥉'
	return ''
}

function getStreakBadge(streak: number): string {
	if (streak >= 10) return '🔥🔥🔥'
	if (streak >= 5) return '🔥🔥'
	if (streak >= 3) return '🔥'
	return ''
}

// Calculate XP to next rank
function getXPToNextRank(currentTotal: number, entries: LeaderboardEntry[], currentRank: number): { xpNeeded: number; nextRankScore: number } | null {
	if (currentRank <= 1) return null // Already #1
	const nextRankEntry = entries[currentRank - 2] // -2 because rank is 1-indexed and we want the entry above
	if (!nextRankEntry) return null
	const xpNeeded = Math.ceil(nextRankEntry.total - currentTotal)
	return { xpNeeded: Math.max(0, xpNeeded), nextRankScore: nextRankEntry.total }
}

function Leaderboard() {
	const [activeTab, setActiveTab] = useState<'individual' | 'team'>('individual')
	const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'all'>('all')
	const [individualEntries, setIndividualEntries] = useState<LeaderboardEntry[]>([])
	const [teamEntries, setTeamEntries] = useState<TeamLeaderboardEntry[]>([])
	const identity = useMemo(() => getIdentity(), [])

	useEffect(() => {
		const unsubscribe = useIndividualLeaderboard((entries) => {
			setIndividualEntries(entries)
		})
		return unsubscribe
	}, [])

	useEffect(() => {
		const unsubscribe = useTeamLeaderboard((entries) => {
			setTeamEntries(entries)
		})
		return unsubscribe
	}, [])

	const currentUserEntry = useMemo(() => {
		return individualEntries.find((e) => e.id === identity.id) || null
	}, [individualEntries, identity.id])

	const currentUserRank = useMemo(() => {
		if (!currentUserEntry) return null
		return individualEntries.findIndex((e) => e.id === identity.id) + 1
	}, [individualEntries, identity.id, currentUserEntry])

	const xpToNextRank = useMemo(() => {
		if (!currentUserEntry || !currentUserRank) return null
		return getXPToNextRank(currentUserEntry.total, individualEntries, currentUserRank)
	}, [currentUserEntry, currentUserRank, individualEntries])

	return (
		<div className="mx-auto max-w-4xl p-6 space-y-6">
			<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">🏆 Leaderboard</h1>
					<p className="text-sm text-neutral-600 dark:text-neutral-400">
						Track your progress and compete with fellow students!
					</p>
				</div>
				
				{/* Time Filter Toggle */}
				<div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
					{(['today', 'week', 'all'] as const).map((filter) => (
						<button
							key={filter}
							type="button"
							onClick={() => setTimeFilter(filter)}
							className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
								timeFilter === filter
									? 'bg-white dark:bg-neutral-700 shadow-sm text-blue-600 dark:text-blue-400'
									: 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
							}`}
						>
							{filter === 'today' ? 'Today' : filter === 'week' ? 'This Week' : 'All Time'}
						</button>
					))}
				</div>
			</div>

			{/* Tabs */}
			<div className="flex gap-2 border-b">
				<button
					type="button"
					onClick={() => setActiveTab('individual')}
					className={`px-4 py-2 font-medium text-sm transition-colors ${
						activeTab === 'individual'
							? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
							: 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
					}`}
				>
					👤 Individual
				</button>
				<button
					type="button"
					onClick={() => setActiveTab('team')}
					className={`px-4 py-2 font-medium text-sm transition-colors ${
						activeTab === 'team'
							? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
							: 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
					}`}
				>
					👥 Team (Rooms)
				</button>
			</div>

			{/* Individual Leaderboard */}
			{activeTab === 'individual' && (
				<>
					{/* Current User Stats Card with XP to Next Rank */}
					{currentUserEntry && (
						<div className="border-2 border-blue-500 rounded-xl p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 shadow-lg">
							<div className="flex items-center justify-between mb-4">
								<div>
									<h2 className="font-bold text-lg text-blue-900 dark:text-blue-100 flex items-center gap-2">
										Your Stats
										{getStreakBadge(currentUserEntry.streak) && (
											<span>{getStreakBadge(currentUserEntry.streak)}</span>
										)}
									</h2>
									<p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
										Rank #{currentUserRank}
										{currentUserRank && currentUserRank <= 3 && <span>{getRankBadge(currentUserRank)}</span>}
									</p>
								</div>
								<div className="text-right">
									<div className="text-3xl font-bold text-blue-900 dark:text-blue-100">{currentUserEntry.total.toFixed(1)}</div>
									<div className="text-xs text-blue-700 dark:text-blue-300">Total Score</div>
								</div>
							</div>
							<div className="grid grid-cols-4 gap-4 text-sm">
								<div className="bg-white/50 dark:bg-neutral-800/50 rounded-lg p-2">
									<div className="text-neutral-600 dark:text-neutral-400 text-xs">Accuracy</div>
									<div className="font-bold text-lg">{currentUserEntry.accuracy}%</div>
								</div>
								<div className="bg-white/50 dark:bg-neutral-800/50 rounded-lg p-2">
									<div className="text-neutral-600 dark:text-neutral-400 text-xs">Streak</div>
									<div className="font-bold text-lg flex items-center gap-1">
										{currentUserEntry.streak}
										{getStreakBadge(currentUserEntry.streak)}
									</div>
								</div>
								<div className="bg-white/50 dark:bg-neutral-800/50 rounded-lg p-2">
									<div className="text-neutral-600 dark:text-neutral-400 text-xs">Collaboration</div>
									<div className="font-bold text-lg">{currentUserEntry.collaboration}</div>
								</div>
								<div className="bg-white/50 dark:bg-neutral-800/50 rounded-lg p-2">
									<div className="text-neutral-600 dark:text-neutral-400 text-xs">Consistency</div>
									<div className="font-bold text-lg">{currentUserEntry.consistency}</div>
								</div>
							</div>
							
							{/* XP to Next Rank Progress Bar */}
							{xpToNextRank && xpToNextRank.xpNeeded > 0 && (
								<div className="mt-4 p-3 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg border border-purple-200 dark:border-purple-800">
									<div className="flex items-center justify-between mb-2">
										<span className="text-sm font-medium text-purple-800 dark:text-purple-200">
											📈 XP to Rank #{(currentUserRank || 0) - 1}
										</span>
										<span className="text-sm font-bold text-purple-700 dark:text-purple-300">
											{xpToNextRank.xpNeeded.toFixed(1)} pts needed
										</span>
									</div>
									<div className="h-2 bg-purple-200 dark:bg-purple-800 rounded-full overflow-hidden">
										<div 
											className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
											style={{ width: `${Math.min(100, (currentUserEntry.total / xpToNextRank.nextRankScore) * 100)}%` }}
										/>
									</div>
									<p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
										Keep practicing to climb the ranks!
									</p>
								</div>
							)}
							
							<div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 grid grid-cols-3 gap-4 text-xs text-blue-700 dark:text-blue-300">
								<div>Code Edits: <span className="font-semibold">{currentUserEntry.codeEdits || 0}</span></div>
								<div>Chat Messages: <span className="font-semibold">{currentUserEntry.chatMessages || 0}</span></div>
								<div>Active Time: <span className="font-semibold">{currentUserEntry.activeTime || 0}m</span></div>
							</div>
						</div>
					)}

					{/* Individual Leaderboard Table */}
					<div className="border rounded-xl overflow-hidden shadow-sm bg-white dark:bg-neutral-900">
						<div className="overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead className="bg-neutral-50 dark:bg-neutral-900 border-b">
									<tr>
										<th className="text-left px-4 py-3 font-semibold">Rank</th>
										<th className="text-left px-4 py-3 font-semibold">Name</th>
										<th className="text-center px-4 py-3 font-semibold">Accuracy</th>
										<th className="text-center px-4 py-3 font-semibold">🔥 Streak</th>
										<th className="text-center px-4 py-3 font-semibold">Collab</th>
										<th className="text-center px-4 py-3 font-semibold">Consistency</th>
										<th className="text-right px-4 py-3 font-semibold">Total Score</th>
									</tr>
								</thead>
								<tbody>
									{individualEntries.length === 0 ? (
										<tr>
											<td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
												{rtdbEnabled
													? 'No entries yet. Start practicing to appear on the leaderboard!'
													: 'Offline mode. Your stats are saved locally. Connect to Firebase to see the global leaderboard.'}
											</td>
										</tr>
									) : (
										individualEntries.map((entry, index) => {
											const rank = index + 1
											const isCurrentUser = entry.id === identity.id
											return (
												<tr
													key={entry.id}
													className={`border-t transition-colors ${
														isCurrentUser
															? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800'
															: 'hover:bg-neutral-50 dark:hover:bg-neutral-900/50'
													}`}
												>
													<td className="px-4 py-3">
														<div className="flex items-center gap-2">
															<span className={`font-bold ${rank <= 3 ? 'text-lg' : ''}`}>{rank}</span>
															{getRankBadge(rank) && <span className="text-xl">{getRankBadge(rank)}</span>}
														</div>
													</td>
													<td className="px-4 py-3">
														<div className="flex items-center gap-2">
															<span className={`font-medium ${isCurrentUser ? 'text-blue-700 dark:text-blue-300' : ''}`}>
																{entry.name}
															</span>
															{getStreakBadge(entry.streak) && (
																<span className="text-sm">{getStreakBadge(entry.streak)}</span>
															)}
															{isCurrentUser && (
																<span className="text-xs px-2 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full font-medium">
																	You
																</span>
															)}
														</div>
													</td>
													<td className="px-4 py-3 text-center">{entry.accuracy}%</td>
													<td className="px-4 py-3 text-center">
														<span className="font-medium">{entry.streak}</span>
													</td>
													<td className="px-4 py-3 text-center">{entry.collaboration}</td>
													<td className="px-4 py-3 text-center">{entry.consistency}</td>
													<td className="px-4 py-3 text-right">
														<span className="font-semibold">{entry.total.toFixed(1)}</span>
													</td>
												</tr>
											)
										})
									)}
								</tbody>
							</table>
						</div>
					</div>

					{/* Info Footer */}
					<div className="text-xs text-neutral-500 space-y-1">
						<p>
							<strong>Individual Score:</strong> 0.4×Accuracy + 0.25×Streak + 0.2×Collaboration + 0.15×Consistency
						</p>
						<p>
							<strong>Collaboration Score:</strong> Based on active participation (code edits, chat messages, active time)
						</p>
					</div>
				</>
			)}

			{/* Team Leaderboard */}
			{activeTab === 'team' && (
				<>
					<div className="border rounded-lg overflow-hidden">
						<div className="overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead className="bg-neutral-50 dark:bg-neutral-900 border-b">
									<tr>
										<th className="text-left px-4 py-3 font-semibold">Rank</th>
										<th className="text-left px-4 py-3 font-semibold">Room Name</th>
										<th className="text-center px-4 py-3 font-semibold">Participants</th>
										<th className="text-center px-4 py-3 font-semibold">Edits</th>
										<th className="text-center px-4 py-3 font-semibold">Messages</th>
										<th className="text-center px-4 py-3 font-semibold">Active Time</th>
										<th className="text-right px-4 py-3 font-semibold">Team Score</th>
									</tr>
								</thead>
								<tbody>
									{teamEntries.length === 0 ? (
										<tr>
											<td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
												{rtdbEnabled
													? 'No team sessions yet. Join or create a room to start collaborating!'
													: 'Offline mode. Team leaderboard requires Firebase connection.'}
											</td>
										</tr>
									) : (
										teamEntries.map((entry, index) => {
											const rank = index + 1
											return (
												<tr
													key={entry.id}
													className="border-t hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
												>
													<td className="px-4 py-3">
														<div className="flex items-center gap-2">
															<span className="font-medium">{rank}</span>
															{getRankBadge(rank) && <span className="text-lg">{getRankBadge(rank)}</span>}
														</div>
													</td>
													<td className="px-4 py-3">
														<div className="font-medium">{entry.roomName}</div>
														<div className="text-xs text-neutral-500">ID: {entry.roomId.slice(0, 8)}...</div>
													</td>
													<td className="px-4 py-3 text-center">
														<span className="font-medium">{entry.participants.length}</span>
													</td>
													<td className="px-4 py-3 text-center">{entry.totalEdits}</td>
													<td className="px-4 py-3 text-center">{entry.totalMessages}</td>
													<td className="px-4 py-3 text-center">{Math.round(entry.totalActiveTime)}m</td>
													<td className="px-4 py-3 text-right">
														<span className="font-semibold">{entry.score}</span>
													</td>
												</tr>
											)
										})
									)}
								</tbody>
							</table>
						</div>
					</div>

					{/* Info Footer */}
					<div className="text-xs text-neutral-500 space-y-1">
						<p>
							<strong>Team Score:</strong> Based on total code edits (40%), chat messages (30%), and active time (30%)
						</p>
						<p>
							<strong>Active Collaboration:</strong> Teams earn points by actively coding together, not just by joining a room.
						</p>
					</div>
				</>
			)}
		</div>
	)
}

export default Leaderboard
