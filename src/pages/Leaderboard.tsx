import { useEffect, useState, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useIndividualLeaderboard, useTeamLeaderboard, type UserStats, type RoomStats } from '../lib/stats.ts'
import { getIdentity } from '../lib/identity.ts'
import { rtdbEnabled } from '../lib/firebase.ts'

// Shared color palette
const c = {
  bg: '#111113',
  card: '#18181b',
  cardHover: '#1f1f23',
  border: '#27272a',
  borderHover: '#3f3f46',
  text: '#fafafa',
  textMuted: '#a1a1aa',
  textDim: '#71717a',
  blue: '#3b82f6',
  blueBg: 'rgba(59, 130, 246, 0.1)',
  purple: '#a855f7',
  purpleBg: 'rgba(168, 85, 247, 0.1)',
  orange: '#f97316',
  orangeBg: 'rgba(249, 115, 22, 0.1)',
  green: '#22c55e',
  greenBg: 'rgba(34, 197, 94, 0.1)',
  yellow: '#eab308',
  yellowBg: 'rgba(234, 179, 8, 0.15)',
  pink: '#ec4899',
  pinkBg: 'rgba(236, 72, 153, 0.1)',
}

type LeaderboardEntry = UserStats & { id: string; total: number }
type TeamLeaderboardEntry = RoomStats & { id: string }

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

function getXPToNextRank(currentTotal: number, entries: LeaderboardEntry[], currentRank: number): { xpNeeded: number; nextRankScore: number } | null {
  if (currentRank <= 1) return null
  const nextRankEntry = entries[currentRank - 2]
  if (!nextRankEntry) return null
  return { xpNeeded: Math.max(0, Math.ceil(nextRankEntry.total - currentTotal)), nextRankScore: nextRankEntry.total }
}

function Leaderboard() {
  const [activeTab, setActiveTab] = useState<'individual' | 'team'>('individual')
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'all'>('all')
  const [individualEntries, setIndividualEntries] = useState<LeaderboardEntry[]>([])
  const [teamEntries, setTeamEntries] = useState<TeamLeaderboardEntry[]>([])
  const identity = useMemo(() => getIdentity(), [])

  // Filter by time and activity
  const filteredIndividualEntries = useMemo(() => {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    const oneWeekMs = 7 * oneDayMs
    
    return individualEntries.filter(entry => {
      // Always show current user
      if (entry.id === identity.id) return true
      
      // Filter by activity level
      const hasActivity = entry.totalQuestions > 0 || entry.xp > 0 || entry.codeEdits > 0 || entry.chatMessages > 0
      if (!hasActivity) return false
      
      // Filter by time
      if (timeFilter === 'today') {
        return entry.lastUpdated && (now - entry.lastUpdated) < oneDayMs
      } else if (timeFilter === 'week') {
        return entry.lastUpdated && (now - entry.lastUpdated) < oneWeekMs
      }
      return true // 'all' shows everyone
    })
  }, [individualEntries, identity.id, timeFilter])

  useEffect(() => { return useIndividualLeaderboard(setIndividualEntries) }, [])
  useEffect(() => { return useTeamLeaderboard(setTeamEntries) }, [])

  // Get current user's actual rank in the FULL leaderboard (not filtered)
  const currentUserActualRank = useMemo(() => {
    const index = individualEntries.findIndex((e) => e.id === identity.id)
    return index >= 0 ? index + 1 : null
  }, [individualEntries, identity.id])

  const currentUserEntry = useMemo(() => filteredIndividualEntries.find((e) => e.id === identity.id) || null, [filteredIndividualEntries, identity.id])
  const xpToNextRank = useMemo(() => {
    if (!currentUserEntry || !currentUserActualRank) return null
    return getXPToNextRank(currentUserEntry.total, individualEntries, currentUserActualRank)
  }, [currentUserEntry, currentUserActualRank, individualEntries])

  // Styles
  const s: Record<string, CSSProperties> = {
    container: { maxWidth: '1000px', margin: '0 auto', padding: '24px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' as const, gap: '16px', marginBottom: '24px' },
    title: { fontSize: '28px', fontWeight: 700, background: `linear-gradient(90deg, ${c.yellow}, ${c.orange})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    subtitle: { fontSize: '14px', color: c.textMuted, marginTop: '4px' },
    filterGroup: { display: 'flex', gap: '4px', padding: '4px', backgroundColor: c.card, borderRadius: '10px' },
    filterBtn: { padding: '8px 14px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
    filterBtnActive: { backgroundColor: c.bg, color: c.blue, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' },
    filterBtnInactive: { backgroundColor: 'transparent', color: c.textMuted },
    tabs: { display: 'flex', gap: '8px', borderBottom: `1px solid ${c.border}`, marginBottom: '24px' },
    tab: { padding: '12px 20px', border: 'none', background: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', borderBottom: '2px solid transparent', marginBottom: '-1px' },
    tabActive: { color: c.blue, borderBottomColor: c.blue },
    tabInactive: { color: c.textMuted },
    card: { backgroundColor: c.card, borderRadius: '16px', border: `1px solid ${c.border}`, overflow: 'hidden' },
    userCard: { backgroundColor: c.card, borderRadius: '16px', border: `2px solid ${c.blue}`, padding: '24px', marginBottom: '24px', background: `linear-gradient(135deg, ${c.blueBg} 0%, rgba(99, 102, 241, 0.1) 100%)` },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px' },
    statBox: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px', textAlign: 'center' as const },
    statLabel: { fontSize: '11px', color: c.textDim, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
    statValue: { fontSize: '20px', fontWeight: 700, color: c.text, marginTop: '4px' },
    progressCard: { marginTop: '20px', padding: '20px', borderRadius: '14px', background: `linear-gradient(135deg, ${c.purpleBg} 0%, ${c.pinkBg} 100%)`, border: `2px solid rgba(168, 85, 247, 0.3)` },
    progressBar: { height: '10px', backgroundColor: 'rgba(168, 85, 247, 0.3)', borderRadius: '5px', overflow: 'hidden', marginTop: '12px' },
    progressFill: { height: '100%', background: `linear-gradient(90deg, ${c.purple}, ${c.pink})`, borderRadius: '5px', transition: 'width 0.5s' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '14px' },
    th: { textAlign: 'left' as const, padding: '14px 16px', fontWeight: 600, color: c.textMuted, backgroundColor: c.bg, borderBottom: `1px solid ${c.border}` },
    thCenter: { textAlign: 'center' as const },
    thRight: { textAlign: 'right' as const },
    td: { padding: '14px 16px', borderTop: `1px solid ${c.border}` },
    tdCenter: { textAlign: 'center' as const },
    tdRight: { textAlign: 'right' as const },
    badge: { padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 },
    emptyState: { padding: '48px 24px', textAlign: 'center' as const, color: c.textMuted },
    footer: { fontSize: '12px', color: c.textDim, marginTop: '20px', lineHeight: 1.6 },
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🏆 Leaderboard</h1>
          <p style={s.subtitle}>Track your progress and compete with fellow students!</p>
        </div>
        <div style={s.filterGroup}>
          {(['today', 'week', 'all'] as const).map((filter) => (
            <button key={filter} onClick={() => setTimeFilter(filter)}
              style={{ ...s.filterBtn, ...(timeFilter === filter ? s.filterBtnActive : s.filterBtnInactive) }}>
              {filter === 'today' ? 'Today' : filter === 'week' ? 'This Week' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        <button onClick={() => setActiveTab('individual')} style={{ ...s.tab, ...(activeTab === 'individual' ? s.tabActive : s.tabInactive) }}>👤 Individual</button>
        <button onClick={() => setActiveTab('team')} style={{ ...s.tab, ...(activeTab === 'team' ? s.tabActive : s.tabInactive) }}>👥 Team (Rooms)</button>
      </div>

      {/* Individual Leaderboard */}
      {activeTab === 'individual' && (
        <>
          {/* Current User Stats Card */}
          {currentUserEntry && (
            <div style={s.userCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: c.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Your Stats {getStreakBadge(currentUserEntry.streak) && <span>{getStreakBadge(currentUserEntry.streak)}</span>}
                  </h2>
                  <p style={{ fontSize: '14px', color: c.blue, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Rank #{currentUserActualRank} {currentUserActualRank && currentUserActualRank <= 3 && <span style={{ fontSize: '18px' }}>{getRankBadge(currentUserActualRank)}</span>}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '36px', fontWeight: 700, color: c.text }}>{currentUserEntry.total.toFixed(1)}</div>
                  <div style={{ fontSize: '12px', color: c.blue }}>Total Score</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginTop: '16px' }}>
                <div style={s.statBox}><div style={s.statLabel}>XP</div><div style={s.statValue}>{currentUserEntry.xp || 0}</div></div>
                <div style={s.statBox}><div style={s.statLabel}>Accuracy</div><div style={s.statValue}>{currentUserEntry.accuracy}%</div></div>
                <div style={s.statBox}><div style={s.statLabel}>Streak</div><div style={{ ...s.statValue, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>{currentUserEntry.streak} {getStreakBadge(currentUserEntry.streak)}</div></div>
                <div style={s.statBox}><div style={s.statLabel}>Collab</div><div style={s.statValue}>{currentUserEntry.collaboration}</div></div>
                <div style={s.statBox}><div style={s.statLabel}>Consistency</div><div style={s.statValue}>{currentUserEntry.consistency}</div></div>
              </div>

              {/* XP to Next Rank */}
              {xpToNextRank && xpToNextRank.xpNeeded > 0 && (
                <div style={s.progressCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '24px' }}>🎯</span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: c.purple }}>Rank #{(currentUserActualRank || 0) - 1} is within reach!</span>
                    </div>
                    <span style={{ ...s.badge, backgroundColor: 'rgba(168, 85, 247, 0.3)', color: c.purple }}>{xpToNextRank.xpNeeded.toFixed(1)} pts away</span>
                  </div>
                  <div style={s.progressBar}>
                    <div style={{ ...s.progressFill, width: `${Math.min(100, (currentUserEntry.total / xpToNextRank.nextRankScore) * 100)}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: c.purple }}>
                    <span>Your Score: {currentUserEntry.total.toFixed(1)}</span>
                    <span>Target: {xpToNextRank.nextRankScore.toFixed(1)}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: c.purple, marginTop: '12px', opacity: 0.8 }}>
                    💡 {xpToNextRank.xpNeeded <= 20 ? "So close! One good session could do it!" : xpToNextRank.xpNeeded <= 50 ? "Keep up the momentum!" : "Practice daily to climb faster!"}
                  </p>
                </div>
              )}

              {/* #1 Celebration */}
              {currentUserActualRank === 1 && (
                <div style={{ marginTop: '20px', padding: '20px', borderRadius: '14px', background: `linear-gradient(135deg, ${c.yellowBg} 0%, ${c.orangeBg} 100%)`, border: `2px solid rgba(234, 179, 8, 0.3)`, textAlign: 'center' }}>
                  <span style={{ fontSize: '32px' }}>👑</span>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: c.yellow, marginTop: '8px' }}>You're #1! Keep defending your position!</p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: `1px solid rgba(59, 130, 246, 0.2)`, fontSize: '12px', color: c.blue }}>
                <div>Code Edits: <strong>{currentUserEntry.codeEdits || 0}</strong></div>
                <div>Chat Messages: <strong>{currentUserEntry.chatMessages || 0}</strong></div>
                <div>Active Time: <strong>{currentUserEntry.activeTime || 0}m</strong></div>
              </div>
            </div>
          )}

          {/* Individual Table */}
          <div style={s.card}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Rank</th>
                  <th style={s.th}>Name</th>
                  <th style={{ ...s.th, ...s.thCenter }}>XP</th>
                  <th style={{ ...s.th, ...s.thCenter }}>Accuracy</th>
                  <th style={{ ...s.th, ...s.thCenter }}>🔥 Streak</th>
                  <th style={{ ...s.th, ...s.thCenter }}>Collab</th>
                  <th style={{ ...s.th, ...s.thCenter }}>Consistency</th>
                  <th style={{ ...s.th, ...s.thRight }}>Total Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredIndividualEntries.length === 0 ? (
                  <tr><td colSpan={8} style={s.emptyState}>{rtdbEnabled ? 'No entries yet. Start practicing!' : 'Offline mode. Connect to Firebase for global leaderboard.'}</td></tr>
                ) : (
                  filteredIndividualEntries.map((entry, index) => {
                    const rank = index + 1
                    const isCurrentUser = entry.id === identity.id
                    return (
                      <tr key={entry.id} style={{ backgroundColor: isCurrentUser ? c.blueBg : 'transparent' }}>
                        <td style={s.td}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: rank <= 3 ? '18px' : '14px' }}>{rank}</strong>
                            {getRankBadge(rank) && <span style={{ fontSize: '20px' }}>{getRankBadge(rank)}</span>}
                          </span>
                        </td>
                        <td style={s.td}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 500, color: isCurrentUser ? c.blue : c.text }}>{entry.name}</span>
                            {getStreakBadge(entry.streak) && <span>{getStreakBadge(entry.streak)}</span>}
                            {isCurrentUser && <span style={{ ...s.badge, backgroundColor: c.blueBg, color: c.blue }}>You</span>}
                          </span>
                        </td>
                        <td style={{ ...s.td, ...s.tdCenter, fontWeight: 600, color: c.yellow }}>{entry.xp || 0}</td>
                        <td style={{ ...s.td, ...s.tdCenter }}>{entry.accuracy}%</td>
                        <td style={{ ...s.td, ...s.tdCenter, fontWeight: 600 }}>{entry.streak}</td>
                        <td style={{ ...s.td, ...s.tdCenter }}>{entry.collaboration}</td>
                        <td style={{ ...s.td, ...s.tdCenter }}>{entry.consistency}</td>
                        <td style={{ ...s.td, ...s.tdRight, fontWeight: 700 }}>{entry.total.toFixed(1)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Scoring Rubric */}
          <div style={{ ...s.card, marginTop: '24px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: c.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📊 Scoring Standards
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {/* Accuracy Card */}
              <div style={{ padding: '16px', borderRadius: '12px', background: `linear-gradient(135deg, ${c.blueBg} 0%, ${c.purpleBg} 100%)`, border: `1px solid rgba(59, 130, 246, 0.3)` }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎯</div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: c.blue, marginBottom: '8px' }}>Accuracy Score</h4>
                <p style={{ fontSize: '12px', color: c.textMuted, lineHeight: 1.5 }}>
                  Your accuracy percentage directly becomes your score. Answer correctly in Speedrun and Flashcards to increase.
                </p>
                <div style={{ marginTop: '12px', fontSize: '11px', color: c.textDim }}>
                  <div>• 100% correct answers = 100 points</div>
                  <div>• 80% correct answers = 80 points</div>
                  <div>• Range: 0-100 points</div>
                </div>
              </div>

              {/* Streak Card */}
              <div style={{ padding: '16px', borderRadius: '12px', background: `linear-gradient(135deg, ${c.orangeBg} 0%, ${c.yellowBg} 100%)`, border: `1px solid rgba(249, 115, 22, 0.3)` }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔥</div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: c.orange, marginBottom: '8px' }}>Streak Score</h4>
                <p style={{ fontSize: '12px', color: c.textMuted, lineHeight: 1.5 }}>
                  Each consecutive day of practice earns 1 point, up to a maximum of 50 points for fairness.
                </p>
                <div style={{ marginTop: '12px', fontSize: '11px', color: c.textDim }}>
                  <div>• 1 day streak = 1 point</div>
                  <div>• 25 day streak = 25 points</div>
                  <div>• 50+ days = 50 points (capped)</div>
                </div>
              </div>

              {/* Collaboration Card */}
              <div style={{ padding: '16px', borderRadius: '12px', background: `linear-gradient(135deg, ${c.greenBg} 0%, ${c.blueBg} 100%)`, border: `1px solid rgba(34, 197, 94, 0.3)` }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>👥</div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: c.green, marginBottom: '8px' }}>Collaboration Score</h4>
                <p style={{ fontSize: '12px', color: c.textMuted, lineHeight: 1.5 }}>
                  Earn points by actively participating in Arena sessions. All your contributions across every session add up over time.
                </p>
                <div style={{ marginTop: '12px', fontSize: '11px', color: c.textDim }}>
                  <div>• Code edits (all sessions combined)</div>
                  <div>• Chat messages (all sessions combined)</div>
                  <div>• Active time (all sessions combined)</div>
                  <div style={{ marginTop: '4px', fontStyle: 'italic', opacity: 0.8 }}>Scaled scoring rewards early contributions most</div>
                </div>
              </div>

              {/* Consistency Card */}
              <div style={{ padding: '16px', borderRadius: '12px', background: `linear-gradient(135deg, ${c.purpleBg} 0%, ${c.pinkBg} 100%)`, border: `1px solid rgba(168, 85, 247, 0.3)` }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📈</div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: c.purple, marginBottom: '8px' }}>Consistency Score</h4>
                <p style={{ fontSize: '12px', color: c.textMuted, lineHeight: 1.5 }}>
                  Your best-ever daily practice streak. Missing a day resets your current streak, but your record is saved.
                </p>
                <div style={{ marginTop: '12px', fontSize: '11px', color: c.textDim }}>
                  <div>• Tracks consecutive active days</div>
                  <div>• Your highest streak ever counts</div>
                  <div>• Range: 0-100+ points</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', padding: '16px', borderRadius: '12px', backgroundColor: c.bg, border: `1px solid ${c.border}` }}>
              <p style={{ fontSize: '13px', color: c.text, fontWeight: 600, marginBottom: '8px' }}>💡 How Your Total Score is Calculated:</p>
              <p style={{ fontSize: '12px', color: c.textMuted, lineHeight: 1.6 }}>
                All four scores are combined with <strong style={{ color: c.green }}>Collaboration</strong> and <strong style={{ color: c.blue }}>Accuracy</strong> weighted most heavily. <strong style={{ color: c.purple }}>Consistency</strong> matters more than <strong style={{ color: c.orange }}>Streak</strong>.
              </p>
              <p style={{ fontSize: '11px', color: c.textDim, marginTop: '8px', fontStyle: 'italic' }}>
                💡 Focus on collaboration and accuracy for maximum impact. The scoring system rewards genuine participation—your first contributions count more than later ones!
              </p>
            </div>
          </div>

          <div style={s.footer}>
            <p><strong>🎯 Strategy Tips:</strong></p>
            <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
              <li><strong>Collaborate actively</strong> - Join Arena sessions, work with teammates, and contribute meaningfully to earn the most points</li>
              <li><strong>Maintain accuracy</strong> - Take your time on questions. Getting them right matters more than rushing</li>
              <li><strong>Practice daily</strong> - Build consistency and streak scores by returning regularly</li>
              <li><strong>Quality over quantity</strong> - First contributions have biggest impact. Make them count!</li>
            </ul>
            <p style={{ marginTop: '12px', fontSize: '11px', opacity: 0.6 }}>Note: Users with 0% accuracy are hidden. Your actual rank among all users is always shown.</p>
          </div>
        </>
      )}

      {/* Team Leaderboard */}
      {activeTab === 'team' && (
        <>
          <div style={s.card}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Rank</th>
                  <th style={s.th}>Team</th>
                  <th style={{ ...s.th, ...s.thCenter }}>Sessions</th>
                  <th style={{ ...s.th, ...s.thCenter }}>Edits</th>
                  <th style={{ ...s.th, ...s.thCenter }}>Messages</th>
                  <th style={{ ...s.th, ...s.thCenter }}>Active Time</th>
                  <th style={{ ...s.th, ...s.thRight }}>Team Score</th>
                </tr>
              </thead>
              <tbody>
                {teamEntries.length === 0 ? (
                  <tr><td colSpan={7} style={s.emptyState}>{rtdbEnabled ? 'No team sessions yet. Join a room to start!' : 'Offline mode. Team leaderboard requires Firebase.'}</td></tr>
                ) : (
                  teamEntries.map((entry, index) => {
                    const rank = index + 1
                    // Format team display: "Challenge - Names" or just "Names" if no challenge
                    // Filter out "Loading..." placeholder names
                    const validParticipants = entry.participants.filter(p => p.name && p.name !== 'Loading...')
                    const participantNames = validParticipants.length > 0
                      ? validParticipants.map(p => p.name).join(', ')
                      : `${entry.participants.length} member${entry.participants.length !== 1 ? 's' : ''}`
                    const teamDisplay = entry.challenge 
                      ? `${entry.challenge} - ${participantNames}`
                      : participantNames
                    const sessionCount = (entry as any).sessionCount || 1
                    
                    return (
                      <tr key={entry.id}>
                        <td style={s.td}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong>{rank}</strong>
                            {getRankBadge(rank) && <span style={{ fontSize: '18px' }}>{getRankBadge(rank)}</span>}
                          </span>
                        </td>
                        <td style={s.td}>
                          <div style={{ fontWeight: 500, color: c.text }}>{teamDisplay}</div>
                          <div style={{ fontSize: '11px', color: c.textDim, marginTop: '2px' }}>
                            {entry.participants.length} member{entry.participants.length !== 1 ? 's' : ''}
                          </div>
                        </td>
                        <td style={{ ...s.td, ...s.tdCenter, fontWeight: 600 }}>{sessionCount}</td>
                        <td style={{ ...s.td, ...s.tdCenter }}>{entry.totalEdits}</td>
                        <td style={{ ...s.td, ...s.tdCenter }}>{entry.totalMessages}</td>
                        <td style={{ ...s.td, ...s.tdCenter }}>{Math.round(entry.totalActiveTime)}m</td>
                        <td style={{ ...s.td, ...s.tdRight, fontWeight: 700 }}>{entry.score}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={s.footer}>
            <p><strong>🏆 Team Success Strategies:</strong></p>
            <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
              <li><strong>Active collaboration wins</strong> - Teams with frequent code edits and discussions rank higher</li>
              <li><strong>Communication is key</strong> - Use chat to coordinate, share ideas, and help teammates</li>
              <li><strong>Stay engaged</strong> - Active time matters, but quality engagement beats idle sessions</li>
              <li><strong>Divide and conquer</strong> - Assign tasks strategically and work efficiently as a team</li>
            </ul>
            <p style={{ marginTop: '12px', opacity: 0.7 }}><strong>Note:</strong> Points are awarded for genuine collaboration. Simply joining a room won't boost your score—participate actively!</p>
          </div>
        </>
      )}
    </div>
  )
}

export default Leaderboard