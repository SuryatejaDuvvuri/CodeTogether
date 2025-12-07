import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, CSSProperties } from 'react'
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
  blueHover: '#2563eb',
  purple: '#a855f7',
  orange: '#f97316',
  green: '#22c55e',
  red: '#ef4444',
}

function Lobby() {
  const [allRooms, setAllRooms] = useState<Room[]>(() =>
    rtdbEnabled ? [] : [{ id: 'demo-room', name: 'CS010A Loops Warmup', createdAt: Date.now() }],
  )
  const [presenceMap, setPresenceMap] = useState<Record<string, number>>(() =>
    rtdbEnabled ? {} as Record<string, number> : { 'demo-room': 1 },
  )
  const [roomName, setRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [userStats, setUserStats] = useState(() => getCurrentUserStats())
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null)
  const navigate = useNavigate()
  const identity = useMemo(() => getIdentity(), [])

  const rooms = useMemo(() => allRooms.filter(room => (presenceMap[room.id] ?? 0) > 0), [allRooms, presenceMap])
  const totalOnline = useMemo(() => Object.values(presenceMap).reduce((sum, count) => sum + count, 0), [presenceMap])
  const dailyXP = Math.min(userStats.correctAnswers * 10, 100)

  // Responsive layout
  const [isWide, setIsWide] = useState(window.innerWidth >= 900)
  useEffect(() => {
    const handleResize = () => setIsWide(window.innerWidth >= 900)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setUserStats(getCurrentUserStats()), 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!rtdbEnabled || !db) return
    const roomsRef = query(ref(db, 'rooms'), orderByChild('createdAt'))
    const unsub = onValue(roomsRef, (snapshot) => {
      const next: Room[] = []
      snapshot.forEach((child) => {
        next.push({ id: child.key ?? '', ...(child.val() as Omit<Room, 'id'>) })
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
        counts[roomSnap.key ?? ''] = val ? Object.keys(val as Record<string, unknown>).length : 0
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
      if (!rtdbEnabled || !db) {
        const id = `demo-${Math.random().toString(36).slice(2, 8)}`
        setAllRooms((prev) => [{ id, name: roomName.trim(), createdAt: Date.now() }, ...prev])
        setPresenceMap((prev) => ({ ...prev, [id]: 1 }))
        setRoomName('')
        navigate(`/arena/${id}`)
        return
      }
      const listRef = ref(db, 'rooms')
      const newRef = push(listRef)
      if (!newRef.key) throw new Error('Failed to generate room ID')
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
    } finally {
      setIsCreating(false)
    }
  }

  const joinRoom = (id: string) => {
    if (!id) return
    if (!rtdbEnabled) {
      setAllRooms((prev) => {
        const exists = prev.some((room) => room.id === id)
        return exists ? prev : [{ id, name: `Room ${id.slice(-4)}`, createdAt: Date.now() }, ...prev]
      })
      setPresenceMap((prev) => ({ ...prev, [id]: Math.max(prev[id] ?? 0, 1) }))
    }
    navigate(`/arena/${id}`)
  }

  // Styles
  const s: Record<string, CSSProperties> = {
    container: {
      maxWidth: '1100px',
      margin: '0 auto',
      padding: '32px 24px',
    },
    // Header section
    header: {
      display: 'flex',
      flexDirection: isWide ? 'row' : 'column',
      justifyContent: 'space-between',
      alignItems: isWide ? 'center' : 'flex-start',
      gap: '24px',
      marginBottom: '32px',
      padding: '24px',
      backgroundColor: c.card,
      borderRadius: '16px',
      border: `1px solid ${c.border}`,
    },
    title: {
      fontSize: '24px',
      fontWeight: 700,
      color: c.text,
      margin: 0,
    },
    subtitle: {
      color: c.textMuted,
      marginTop: '4px',
      fontSize: '14px',
    },
    statsRow: {
      display: 'flex',
      gap: '16px',
    },
    statBox: {
      padding: '12px 20px',
      borderRadius: '12px',
      textAlign: 'center' as const,
    },
    statValue: {
      fontSize: '24px',
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
    },
    statLabel: {
      fontSize: '11px',
      color: c.textDim,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      marginTop: '2px',
    },
    // Main grid
    grid: {
      display: 'grid',
      gridTemplateColumns: isWide ? '1.5fr 1fr' : '1fr',
      gap: '24px',
    },
    // Cards
    card: {
      backgroundColor: c.card,
      borderRadius: '16px',
      border: `1px solid ${c.border}`,
      overflow: 'hidden',
    },
    cardHeader: {
      padding: '16px 20px',
      borderBottom: `1px solid ${c.border}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: {
      fontSize: '16px',
      fontWeight: 600,
      color: c.text,
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    cardBody: {
      padding: '16px',
    },
    // Room items
    roomItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 16px',
      backgroundColor: c.bg,
      borderRadius: '10px',
      marginBottom: '8px',
      border: `1px solid ${c.border}`,
      transition: 'all 0.15s ease',
    },
    roomName: {
      fontSize: '15px',
      fontWeight: 500,
      color: c.text,
      margin: 0,
    },
    roomId: {
      fontSize: '12px',
      color: c.textDim,
      fontFamily: 'monospace',
      marginTop: '2px',
    },
    roomRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    onlineBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      backgroundColor: 'rgba(34, 197, 94, 0.15)',
      borderRadius: '20px',
      fontSize: '13px',
      color: c.green,
    },
    onlineDot: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: c.green,
    },
    // Buttons
    btnPrimary: {
      padding: '10px 18px',
      backgroundColor: c.blue,
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'background-color 0.15s',
    },
    btnSecondary: {
      padding: '10px 18px',
      backgroundColor: 'transparent',
      color: c.text,
      border: `1px solid ${c.border}`,
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    // Inputs
    input: {
      width: '100%',
      padding: '12px 14px',
      backgroundColor: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '8px',
      color: c.text,
      fontSize: '14px',
      outline: 'none',
      boxSizing: 'border-box' as const,
    },
    // Sidebar cards
    sidebarCard: {
      backgroundColor: c.card,
      borderRadius: '16px',
      border: `1px solid ${c.border}`,
      padding: '20px',
      marginBottom: '16px',
    },
    sidebarTitle: {
      fontSize: '13px',
      fontWeight: 600,
      color: c.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      marginBottom: '14px',
    },
    // Quick links
    quickLinksGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px',
      marginBottom: '16px',
    },
    quickLink: {
      padding: '16px',
      borderRadius: '12px',
      textDecoration: 'none',
      display: 'block',
      transition: 'transform 0.15s, opacity 0.15s',
    },
    // Activity items
    activityItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 12px',
      backgroundColor: c.bg,
      borderRadius: '8px',
      marginBottom: '8px',
    },
    activityIcon: {
      fontSize: '16px',
      width: '24px',
      textAlign: 'center' as const,
    },
    activityText: {
      flex: 1,
    },
    activityName: {
      fontSize: '14px',
      fontWeight: 500,
      color: c.text,
    },
    activityDesc: {
      fontSize: '12px',
      color: c.textDim,
    },
    activityXP: {
      fontSize: '12px',
      fontWeight: 600,
      padding: '3px 8px',
      borderRadius: '12px',
    },
    emptyState: {
      padding: '48px 24px',
      textAlign: 'center' as const,
      color: c.textMuted,
    },
  }

  return (
    <div style={s.container}>
      {/* Welcome Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Welcome, {identity.name}</h1>
          <p style={s.subtitle}>Practice C++ with your classmates</p>
        </div>
        <div style={s.statsRow}>
          <div style={{ ...s.statBox, backgroundColor: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
            <div style={{ ...s.statValue, color: c.orange }}>
              <span>🔥</span> {userStats.streak}
            </div>
            <div style={s.statLabel}>Streak</div>
          </div>
          <div style={{ ...s.statBox, backgroundColor: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
            <div style={{ ...s.statValue, color: c.purple }}>
              <span>✨</span> {dailyXP}/100
            </div>
            <div style={s.statLabel}>Today's XP</div>
          </div>
          <div style={{ ...s.statBox, backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
            <div style={{ ...s.statValue, color: c.green }}>
              <span style={{ ...s.onlineDot, marginRight: '4px' }}></span> {totalOnline || 1}
            </div>
            <div style={s.statLabel}>Online</div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={s.grid}>
        {/* Active Rooms */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <h2 style={s.cardTitle}>
              <span>🏠</span> Active Rooms
            </h2>
            <span style={{ fontSize: '13px', color: c.textDim }}>{rooms.length} available</span>
          </div>
          <div style={s.cardBody}>
            {rooms.length === 0 ? (
              <div style={s.emptyState}>
                <p style={{ margin: 0, fontSize: '15px' }}>No active rooms</p>
                <p style={{ margin: '8px 0 0', fontSize: '13px', color: c.textDim }}>
                  Create one to get started
                </p>
              </div>
            ) : (
              rooms.map((room) => (
                <div
                  key={room.id}
                  style={{
                    ...s.roomItem,
                    borderColor: hoveredRoom === room.id ? c.borderHover : c.border,
                    backgroundColor: hoveredRoom === room.id ? c.cardHover : c.bg,
                  }}
                  onMouseEnter={() => setHoveredRoom(room.id)}
                  onMouseLeave={() => setHoveredRoom(null)}
                >
                  <div>
                    <p style={s.roomName}>{room.name}</p>
                    <p style={s.roomId}>{room.id}</p>
                  </div>
                  <div style={s.roomRight}>
                    <div style={s.onlineBadge}>
                      <span style={s.onlineDot}></span>
                      {presenceMap[room.id] ?? 0} online
                    </div>
                    <button
                      type="button"
                      style={s.btnPrimary}
                      onClick={() => joinRoom(room.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = c.blueHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = c.blue)}
                    >
                      Join
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Create Room */}
          <div style={s.sidebarCard}>
            <h3 style={s.sidebarTitle}>Create Room</h3>
            <form onSubmit={createRoom}>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. CS010B Arrays Drill"
                style={s.input}
                onFocus={(e) => (e.currentTarget.style.borderColor = c.blue)}
                onBlur={(e) => (e.currentTarget.style.borderColor = c.border)}
              />
              <button
                type="submit"
                disabled={isCreating || !roomName.trim()}
                style={{
                  ...s.btnPrimary,
                  width: '100%',
                  marginTop: '12px',
                  opacity: isCreating || !roomName.trim() ? 0.5 : 1,
                  cursor: isCreating || !roomName.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isCreating ? 'Creating...' : 'Create & Join'}
              </button>
            </form>
          </div>

          {/* Join by Code */}
          <div style={s.sidebarCard}>
            <h3 style={s.sidebarTitle}>Join by Code</h3>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter room ID"
              style={{ ...s.input, fontFamily: 'monospace' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = c.blue)}
              onBlur={(e) => (e.currentTarget.style.borderColor = c.border)}
            />
            <button
              type="button"
              disabled={!joinCode.trim()}
              onClick={() => joinRoom(joinCode.trim())}
              style={{
                ...s.btnSecondary,
                width: '100%',
                marginTop: '12px',
                opacity: !joinCode.trim() ? 0.5 : 1,
                cursor: !joinCode.trim() ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => joinCode.trim() && (e.currentTarget.style.backgroundColor = c.bg)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Join Room
            </button>
          </div>

          {/* Quick Links */}
          <div style={s.quickLinksGrid}>
            <Link
              to="/flashcards"
              style={{
                ...s.quickLink,
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
              }}
            >
              <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>📚</span>
              <span style={{ fontWeight: 600, color: '#c084fc', display: 'block' }}>Flashcards</span>
              <span style={{ fontSize: '12px', color: 'rgba(192, 132, 252, 0.7)' }}>Study concepts</span>
            </Link>
            <Link
              to="/speedrun"
              style={{
                ...s.quickLink,
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                border: '1px solid rgba(249, 115, 22, 0.25)',
              }}
            >
              <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>⚡</span>
              <span style={{ fontWeight: 600, color: '#fb923c', display: 'block' }}>Speedrun</span>
              <span style={{ fontSize: '12px', color: 'rgba(251, 146, 60, 0.7)' }}>Quick MCQs</span>
            </Link>
          </div>

          {/* Activities */}
          <div style={s.sidebarCard}>
            <h3 style={s.sidebarTitle}>Activities</h3>
            {[
              { icon: '🐛', name: 'Fix the Bug', desc: 'Debug C++ code', xp: 30, color: c.red },
              { icon: '📝', name: 'Fill the Blank', desc: 'Complete code', xp: 25, color: c.orange },
              { icon: '🔍', name: 'Code Review', desc: 'Improve quality', xp: 20, color: c.green },
              { icon: '👯', name: 'Pair Programming', desc: 'Solve together', xp: 35, color: c.purple },
            ].map((a) => (
              <div key={a.name} style={s.activityItem}>
                <span style={s.activityIcon}>{a.icon}</span>
                <div style={s.activityText}>
                  <div style={s.activityName}>{a.name}</div>
                  <div style={s.activityDesc}>{a.desc}</div>
                </div>
                <span style={{ 
                  ...s.activityXP, 
                  backgroundColor: `${a.color}20`,
                  color: a.color,
                }}>
                  +{a.xp}
                </span>
              </div>
            ))}
          </div>

          {!rtdbEnabled && (
            <p style={{ fontSize: '12px', color: c.textDim, textAlign: 'center', margin: 0 }}>
              Running in offline demo mode
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Lobby
