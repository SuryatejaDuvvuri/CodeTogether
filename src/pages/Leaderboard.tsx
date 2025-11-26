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

function getAchievements(stats: UserStats): string[] {
	const achievements: string[] = []
	
	if (stats.accuracy >= 90) achievements.push('🎯 Accuracy Master')
	if (stats.streak >= 10) achievements.push('🔥 Streak Champion')
	if (stats.streak >= 20) achievements.push('🔥🔥 Streak Legend')
	if (stats.collaboration >= 50) achievements.push('🤝 Team Player')
	if (stats.collaboration >= 80) achievements.push('🤝🤝 Collaboration Expert')
	if (stats.codeEdits >= 100) achievements.push('⌨️ Code Warrior')
	if (stats.chatMessages >= 50) achievements.push('💬 Chatty Coder')
	if (stats.activeTime >= 60) achievements.push('⏰ Time Dedicated')
	if (stats.totalQuestions >= 100) achievements.push('📚 Knowledge Seeker')
	if (stats.totalQuestions >= 500) achievements.push('📚📚 Master Learner')
	
	return achievements
}

function Leaderboard() {
	const [activeTab, setActiveTab] = useState<'individual' | 'team'>('individual')
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

	return (
		<div className="mx-auto max-w-4xl p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold mb-2">Leaderboard</h1>
				<p className="text-sm text-neutral-600 dark:text-neutral-400">
					Track your individual progress and team performance. Individual scores reward Speedrun accuracy and active collaboration. Team scores reward collaborative coding sessions.
				</p>
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
					Individual
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
					Team (Rooms)
				</button>
			</div>

			{/* Individual Leaderboard */}
			{activeTab === 'individual' && (
				<>
					{/* Current User Stats Card */}
					{currentUserEntry && (
						<div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
							<div className="flex items-center justify-between mb-3">
								<div>
									<h2 className="font-semibold text-blue-900 dark:text-blue-100">Your Stats</h2>
									<p className="text-sm text-blue-700 dark:text-blue-300">Rank #{currentUserRank}</p>
								</div>
								<div className="text-right">
									<div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{currentUserEntry.total.toFixed(1)}</div>
									<div className="text-xs text-blue-700 dark:text-blue-300">Total Score</div>
								</div>
							</div>
							<div className="grid grid-cols-4 gap-4 text-sm">
								<div>
									<div className="text-neutral-600 dark:text-neutral-400">Accuracy</div>
									<div className="font-semibold">{currentUserEntry.accuracy}%</div>
								</div>
								<div>
									<div className="text-neutral-600 dark:text-neutral-400">Streak</div>
									<div className="font-semibold">{currentUserEntry.streak}</div>
								</div>
								<div>
									<div className="text-neutral-600 dark:text-neutral-400">Collaboration</div>
									<div className="font-semibold">{currentUserEntry.collaboration}</div>
								</div>
								<div>
									<div className="text-neutral-600 dark:text-neutral-400">Consistency</div>
									<div className="font-semibold">{currentUserEntry.consistency}</div>
								</div>
							</div>
							<div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 grid grid-cols-3 gap-4 text-xs text-blue-700 dark:text-blue-300">
								<div>Code Edits: <span className="font-semibold">{currentUserEntry.codeEdits || 0}</span></div>
								<div>Chat Messages: <span className="font-semibold">{currentUserEntry.chatMessages || 0}</span></div>
								<div>Active Time: <span className="font-semibold">{currentUserEntry.activeTime || 0}m</span></div>
							</div>
							{/* Achievements */}
							{getAchievements(currentUserEntry).length > 0 && (
								<div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
									<div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">Achievements:</div>
									<div className="flex flex-wrap gap-2">
										{getAchievements(currentUserEntry).map((achievement, idx) => (
											<span
												key={idx}
												className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-full text-xs font-medium"
											>
												{achievement}
											</span>
										))}
									</div>
								</div>
							)}
						</div>
					)}

					{/* Individual Leaderboard Table */}
					<div className="border rounded-lg overflow-hidden">
						<div className="overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead className="bg-neutral-50 dark:bg-neutral-900 border-b">
									<tr>
										<th className="text-left px-4 py-3 font-semibold">Rank</th>
										<th className="text-left px-4 py-3 font-semibold">Name</th>
										<th className="text-center px-4 py-3 font-semibold">Accuracy</th>
										<th className="text-center px-4 py-3 font-semibold">Streak</th>
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
															? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
															: 'hover:bg-neutral-50 dark:hover:bg-neutral-900/50'
													}`}
												>
													<td className="px-4 py-3">
														<div className="flex items-center gap-2">
															<span className="font-medium">{rank}</span>
															{getRankBadge(rank) && <span className="text-lg">{getRankBadge(rank)}</span>}
														</div>
													</td>
													<td className="px-4 py-3">
														<div className="flex items-center gap-2">
															<span className={`font-medium ${isCurrentUser ? 'text-blue-700 dark:text-blue-300' : ''}`}>
																{entry.name}
															</span>
															{isCurrentUser && (
																<span className="text-xs px-2 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full">
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
