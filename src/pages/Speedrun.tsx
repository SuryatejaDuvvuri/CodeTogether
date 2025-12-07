import { useEffect, useMemo, useState, useRef } from 'react'
import type { CSSProperties } from 'react'
import { recordAnswer, getCurrentUserStats } from '../lib/stats.ts'
import { playSuccess, playFail, playStreak, playWarning } from '../lib/sounds.ts'

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
  blueBg: 'rgba(59, 130, 246, 0.1)',
  purple: '#a855f7',
  purpleBg: 'rgba(168, 85, 247, 0.1)',
  orange: '#f97316',
  orangeBg: 'rgba(249, 115, 22, 0.1)',
  green: '#22c55e',
  greenBg: 'rgba(34, 197, 94, 0.1)',
  red: '#ef4444',
  redBg: 'rgba(239, 68, 68, 0.1)',
  yellow: '#eab308',
  yellowBg: 'rgba(234, 179, 8, 0.15)',
}

type Question = {
  id: string
  prompt: string
  choices: string[]
  answerIndex: number
  hint?: string
}

type DeepThinkQuestion = {
  id: string
  prompt: string
  code: string
  choices: string[]
  answerIndex: number
  explanation: string
}

const MOCK_QUESTIONS: Question[] = [
  { id: 'q1', prompt: 'What is the correct way to declare a constant in C++?', choices: ['const int x = 5;', 'constant int x = 5;', 'int const x = 5;', 'Both A and C'], answerIndex: 3, hint: 'Both "const int" and "int const" are valid.' },
  { id: 'q2', prompt: 'Which header file is needed for cout and cin?', choices: ['<stdio.h>', '<iostream>', '<conio.h>', '<string>'], answerIndex: 1, hint: 'iostream provides input/output stream objects.' },
  { id: 'q3', prompt: 'What is the output of: cout << 5/2;', choices: ['2.5', '2', '3', '2.0'], answerIndex: 1, hint: 'Integer division truncates the decimal.' },
  { id: 'q4', prompt: 'Which operator accesses members of a pointer to an object?', choices: ['.', '->', '::', '*'], answerIndex: 1, hint: 'Arrow operator (->) for pointer member access.' },
  { id: 'q5', prompt: 'What does & do in a variable declaration?', choices: ['Bitwise AND', 'Address of', 'Creates a reference', 'Logical AND'], answerIndex: 2, hint: 'In declarations, & creates a reference variable.' },
  { id: 'q6', prompt: 'Default access specifier for class members?', choices: ['public', 'private', 'protected', 'None'], answerIndex: 1, hint: 'Class members are private by default.' },
  { id: 'q7', prompt: 'Keyword for dynamic memory allocation?', choices: ['malloc', 'new', 'alloc', 'create'], answerIndex: 1, hint: '"new" allocates memory and calls constructor.' },
  { id: 'q8', prompt: 'Correct pointer declaration?', choices: ['int p*;', 'int *p;', '*int p;', 'pointer int p;'], answerIndex: 1, hint: 'Asterisk before variable name: int *p;' },
  { id: 'q9', prompt: 'What does endl do?', choices: ['Ends program', 'Newline + flush buffer', 'Ends line only', 'Clears screen'], answerIndex: 1, hint: 'endl inserts newline AND flushes buffer.' },
  { id: 'q10', prompt: 'Size of int on 64-bit systems?', choices: ['2 bytes', '4 bytes', '8 bytes', 'Depends'], answerIndex: 1, hint: 'int is typically 4 bytes even on 64-bit.' },
  { id: 'q11', prompt: 'Correct for loop syntax?', choices: ['for (i = 0; i < 10; i++)', 'for (int i = 0; i < 10; i++)', 'for i in range(10)', 'foreach (int i in 10)'], answerIndex: 1, hint: 'C++ requires variable declaration in for loop.' },
  { id: 'q12', prompt: 'What is a constructor?', choices: ['Destroys objects', 'Initializes objects', 'A variable type', 'A loop'], answerIndex: 1, hint: 'Constructors initialize objects on creation.' },
  { id: 'q13', prompt: 'What does :: do?', choices: ['Compares values', 'Accesses scope', 'Creates pointer', 'Defines function'], answerIndex: 1, hint: ':: accesses namespaces, classes, or global scope.' },
  { id: 'q14', prompt: 'Pass array to function?', choices: ['void func(int arr[])', 'void func(int[] arr)', 'void func(array int)', 'void func(int arr)'], answerIndex: 0, hint: 'Arrays passed as pointers: int arr[] or int* arr.' },
  { id: 'q15', prompt: 'What does "virtual" do?', choices: ['Makes constant', 'Enables polymorphism', 'Creates template', 'Declares static'], answerIndex: 1, hint: 'Virtual enables runtime polymorphism.' },
  { id: 'q16', prompt: 'struct vs class difference?', choices: ['No difference', 'Default access differs', 'struct no functions', 'class no inherit'], answerIndex: 1, hint: 'Only difference is default access specifier.' },
  { id: 'q17', prompt: 'Delete null pointer?', choices: ['Undefined', 'Crashes', 'Safe (nothing)', 'Compile error'], answerIndex: 2, hint: 'Deleting null pointer is safe.' },
  { id: 'q18', prompt: 'Output of: cout << (5 > 3 ? "Yes" : "No");', choices: ['5 > 3', 'Yes', 'No', 'true'], answerIndex: 1, hint: 'Ternary returns second value if true.' },
  { id: 'q19', prompt: 'Prevent class inheritance?', choices: ['static', 'const', 'final', 'sealed'], answerIndex: 2, hint: 'C++11 "final" prevents inheritance.' },
  { id: 'q20', prompt: 'Declare vector of integers?', choices: ['vector int v;', 'int vector v;', 'vector<int> v;', 'vector[int] v;'], answerIndex: 2, hint: 'Vectors use angle brackets: vector<int>.' },
]

const DEEP_THINK_QUESTIONS: DeepThinkQuestion[] = [
  { id: 'dt1', prompt: 'What is the output?', code: `int x = 5;\ncout << x++ << " " << ++x;`, choices: ['5 7', '6 7', '5 6', 'Undefined behavior'], answerIndex: 3, explanation: 'Order of evaluation is unspecified - undefined behavior!' },
  { id: 'dt2', prompt: 'What will this print?', code: `int arr[] = {1, 2, 3, 4, 5};\nint* p = arr;\ncout << *(p + 2);`, choices: ['1', '2', '3', '4'], answerIndex: 2, explanation: 'p + 2 moves 2 elements forward. *(p+2) = arr[2] = 3.' },
  { id: 'dt3', prompt: 'What is the output?', code: `int a = 10, b = 20;\nint& ref = a;\nref = b;\ncout << a << " " << b;`, choices: ['10 20', '20 20', '10 10', '20 10'], answerIndex: 1, explanation: 'ref is alias for a. Assigning b to ref assigns 20 to a.' },
  { id: 'dt4', prompt: 'What does this output?', code: `for(int i = 0; i < 5; i++) {\n  if(i == 2) continue;\n  if(i == 4) break;\n  cout << i << " ";\n}`, choices: ['0 1 2 3 4', '0 1 3', '0 1 2 3', '0 1 3 4'], answerIndex: 1, explanation: 'continue skips i=2, break exits at i=4. Output: 0 1 3' },
  { id: 'dt5', prompt: 'What is printed?', code: `int x = 5;\nint* p = &x;\nint** pp = &p;\ncout << **pp;`, choices: ['Address of x', 'Address of p', '5', 'Error'], answerIndex: 2, explanation: '**pp dereferences twice to get x value: 5.' },
  { id: 'dt6', prompt: 'What is the output?', code: `class Base {\npublic:\n  virtual void show() { cout << "Base"; }\n};\nclass Derived : public Base {\npublic:\n  void show() { cout << "Derived"; }\n};\nBase* ptr = new Derived();\nptr->show();`, choices: ['Base', 'Derived', 'BaseDerived', 'Error'], answerIndex: 1, explanation: 'Virtual function + derived object = Derived::show() called.' },
  { id: 'dt7', prompt: 'What will be printed?', code: `int arr[3] = {10, 20, 30};\ncout << 2[arr];`, choices: ['20', '30', 'Error', '2'], answerIndex: 1, explanation: '2[arr] = *(2+arr) = *(arr+2) = arr[2] = 30.' },
  { id: 'dt8', prompt: 'What is the output?', code: `int i = 0;\nwhile(i++ < 3) {\n  cout << i << " ";\n}`, choices: ['0 1 2', '1 2 3', '0 1 2 3', '1 2 3 4'], answerIndex: 1, explanation: 'Post-increment: compare then increment. Prints 1 2 3.' },
]

type SessionState = {
  currentQuestionIndex: number
  questionsAnswered: number
  correctAnswersThisSession: number
  currentStreak: number
  bestStreakThisSession: number
  sessionLength: number
  startTime: number
  elapsedTime: number
  isActive: boolean
}

function Speedrun() {
  const [sessionStarted, setSessionStarted] = useState(false)
  const [sessionLength, setSessionLength] = useState(20)
  const [timeMode, setTimeMode] = useState<'quick' | 'deep'>('quick')
  const timerDuration = timeMode === 'quick' ? 5 : 15
  const xpPerQuestion = timeMode === 'quick' ? 10 : 25

  const [sessionState, setSessionState] = useState<SessionState>({
    currentQuestionIndex: 0, questionsAnswered: 0, correctAnswersThisSession: 0,
    currentStreak: 0, bestStreakThisSession: 0, sessionLength: 20,
    startTime: 0, elapsedTime: 0, isActive: false,
  })

  const [timeLeft, setTimeLeft] = useState(10)
  const [selected, setSelected] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [userStats, setUserStats] = useState(getCurrentUserStats())
  const [streakBroken, setStreakBroken] = useState(false)
  const [previousStreak, setPreviousStreak] = useState(0)
  const [flashAnimation, setFlashAnimation] = useState<'correct' | 'wrong' | null>(null)

  const timerIntervalRef = useRef<number | null>(null)
  const elapsedTimeIntervalRef = useRef<number | null>(null)

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const sessionQuestions = useMemo(() => {
    if (timeMode === 'deep') {
      return shuffleArray(DEEP_THINK_QUESTIONS).slice(0, Math.min(sessionState.sessionLength, DEEP_THINK_QUESTIONS.length))
    }
    const shuffled = shuffleArray(MOCK_QUESTIONS)
    return Array.from({ length: sessionState.sessionLength }, (_, i) => shuffled[i % shuffled.length])
  }, [sessionState.sessionLength, timeMode])

  const currentQuestion = sessionQuestions[sessionState.currentQuestionIndex]
  const isDeepThink = timeMode === 'deep'
  const currentDeepQuestion = isDeepThink ? (currentQuestion as DeepThinkQuestion) : null

  useEffect(() => { setUserStats(getCurrentUserStats()) }, [sessionState.questionsAnswered])

  useEffect(() => {
    if (!sessionState.isActive || locked) return
    setTimeLeft(timerDuration)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); handleTimeOut(); return 0 }
        if (t === 4) playWarning()
        return t - 1
      })
    }, 1000)
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) }
  }, [sessionState.currentQuestionIndex, locked, sessionState.isActive, timerDuration])

  useEffect(() => {
    if (!sessionState.isActive) return
    elapsedTimeIntervalRef.current = window.setInterval(() => {
      setSessionState((prev) => ({ ...prev, elapsedTime: Math.floor((Date.now() - prev.startTime) / 1000) }))
    }, 1000)
    return () => { if (elapsedTimeIntervalRef.current) clearInterval(elapsedTimeIntervalRef.current) }
  }, [sessionState.isActive, sessionState.startTime])

  const startSession = () => {
    setSessionState({
      currentQuestionIndex: 0, questionsAnswered: 0, correctAnswersThisSession: 0,
      currentStreak: 0, bestStreakThisSession: 0, sessionLength,
      startTime: Date.now(), elapsedTime: 0, isActive: true,
    })
    setSessionStarted(true)
    setSelected(null)
    setLocked(false)
    setTimeLeft(timerDuration)
    setStreakBroken(false)
    setPreviousStreak(0)
  }

  const handleAnswer = async (i: number) => {
    if (locked || !sessionState.isActive) return
    setSelected(i)
    setLocked(true)
    const isCorrect = i === currentQuestion.answerIndex
    let newStreak = sessionState.currentStreak
    let newCorrect = sessionState.correctAnswersThisSession

    if (isCorrect) {
      newStreak++; newCorrect++
      setFlashAnimation('correct')
      if (newStreak >= 5 && newStreak % 5 === 0) playStreak(); else playSuccess()
    } else {
      setFlashAnimation('wrong')
      playFail()
      if (sessionState.currentStreak > 0) { setStreakBroken(true); setPreviousStreak(sessionState.currentStreak); setTimeout(() => setStreakBroken(false), 3000) }
      newStreak = 0
    }
    setTimeout(() => setFlashAnimation(null), 500)

    setSessionState((prev) => ({
      ...prev, questionsAnswered: prev.questionsAnswered + 1, correctAnswersThisSession: newCorrect,
      currentStreak: newStreak, bestStreakThisSession: Math.max(prev.bestStreakThisSession, newStreak),
    }))
    await recordAnswer(isCorrect, newStreak)

    if (sessionState.questionsAnswered + 1 >= sessionState.sessionLength) {
      setTimeout(() => { setShowSummary(true); setSessionState((prev) => ({ ...prev, isActive: false })) }, 2000)
    }
  }

  const handleTimeOut = async () => {
    if (locked || !sessionState.isActive) return
    setSelected(-1); setLocked(true)
    setFlashAnimation('wrong'); playFail()
    if (sessionState.currentStreak > 0) { setStreakBroken(true); setPreviousStreak(sessionState.currentStreak); setTimeout(() => setStreakBroken(false), 3000) }
    setSessionState((prev) => ({ ...prev, questionsAnswered: prev.questionsAnswered + 1, currentStreak: 0 }))
    await recordAnswer(false, 0)
    setTimeout(() => setFlashAnimation(null), 500)
    if (sessionState.questionsAnswered + 1 >= sessionState.sessionLength) {
      setTimeout(() => { setShowSummary(true); setSessionState((prev) => ({ ...prev, isActive: false })) }, 2000)
    }
  }

  const next = () => {
    if (sessionState.questionsAnswered >= sessionState.sessionLength) {
      setShowSummary(true); setSessionState((prev) => ({ ...prev, isActive: false })); return
    }
    setSelected(null); setLocked(false)
    setSessionState((prev) => ({ ...prev, currentQuestionIndex: (prev.currentQuestionIndex + 1) % sessionQuestions.length }))
  }

  const handleExit = () => {
    if (sessionState.questionsAnswered > 0 && sessionState.questionsAnswered < sessionState.sessionLength) setShowExitConfirm(true)
    else resetSession()
  }

  const resetSession = () => {
    setSessionStarted(false); setShowSummary(false); setShowExitConfirm(false); setSelected(null); setLocked(false)
    setSessionState({ currentQuestionIndex: 0, questionsAnswered: 0, correctAnswersThisSession: 0, currentStreak: 0, bestStreakThisSession: 0, sessionLength: 20, startTime: 0, elapsedTime: 0, isActive: false })
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    if (elapsedTimeIntervalRef.current) clearInterval(elapsedTimeIntervalRef.current)
  }

  const progress = sessionState.sessionLength ? (sessionState.questionsAnswered / sessionState.sessionLength) * 100 : 0
  const sessionAccuracy = sessionState.questionsAnswered ? Math.round((sessionState.correctAnswersThisSession / sessionState.questionsAnswered) * 100) : 0
  const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`

  // Styles
  const s: Record<string, CSSProperties> = {
    container: { maxWidth: '800px', margin: '0 auto', padding: '24px' },
    card: { backgroundColor: c.card, borderRadius: '16px', border: `1px solid ${c.border}`, padding: '24px' },
    title: { fontSize: '28px', fontWeight: 700, margin: 0 },
    subtitle: { fontSize: '14px', color: c.textMuted, marginTop: '4px' },
    btn: { padding: '12px 24px', borderRadius: '10px', border: 'none', fontSize: '15px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' },
    btnPrimary: { backgroundColor: c.blue, color: '#fff' },
    btnSecondary: { backgroundColor: 'transparent', color: c.text, border: `2px solid ${c.border}` },
    modeCard: { padding: '20px', borderRadius: '12px', border: '2px solid', cursor: 'pointer', textAlign: 'center' as const, transition: 'all 0.15s' },
    lengthBtn: { padding: '12px 16px', borderRadius: '10px', border: '2px solid', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s' },
    progressBar: { height: '10px', backgroundColor: c.bg, borderRadius: '5px', overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: '5px', transition: 'width 0.3s' },
    choiceBtn: { width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid', backgroundColor: c.bg, cursor: 'pointer', textAlign: 'left' as const, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.15s' },
    choiceLetter: { width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 },
    codeBlock: { backgroundColor: '#0d1117', borderRadius: '12px', padding: '16px', fontFamily: 'monospace', fontSize: '14px', color: '#7ee787', border: `1px solid ${c.border}`, overflowX: 'auto' as const, whiteSpace: 'pre-wrap' as const },
    statBox: { textAlign: 'center' as const, padding: '20px', backgroundColor: c.bg, borderRadius: '12px' },
    statValue: { fontSize: '28px', fontWeight: 700 },
    statLabel: { fontSize: '13px', color: c.textMuted, marginTop: '4px' },
    badge: { padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 },
    modal: { position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(4px)' },
    modalCard: { backgroundColor: c.card, borderRadius: '16px', padding: '32px', maxWidth: '500px', width: '90%', border: `2px solid ${c.border}` },
    timerBar: { width: '120px', height: '8px', backgroundColor: c.bg, borderRadius: '4px', overflow: 'hidden' },
  }

  // Setup screen
  if (!sessionStarted) {
    return (
      <div style={s.container}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ ...s.title, background: `linear-gradient(90deg, ${c.orange}, ${c.red})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>🎯 C++ Speedrun</h1>
          <p style={s.subtitle}>Test your knowledge with rapid-fire questions. Build streaks and earn XP!</p>
        </div>

        <div style={s.card}>
          {/* Mode Selection */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: c.textMuted, marginBottom: '12px' }}>Choose Speed Mode</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div onClick={() => setTimeMode('quick')} style={{ ...s.modeCard, borderColor: timeMode === 'quick' ? c.orange : c.border, backgroundColor: timeMode === 'quick' ? c.orangeBg : 'transparent' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>⚡</div>
                <div style={{ fontWeight: 700, color: timeMode === 'quick' ? c.orange : c.text }}>Quick Recall</div>
                <div style={{ fontSize: '12px', color: c.textMuted }}>5 seconds • +10 XP</div>
              </div>
              <div onClick={() => setTimeMode('deep')} style={{ ...s.modeCard, borderColor: timeMode === 'deep' ? c.purple : c.border, backgroundColor: timeMode === 'deep' ? c.purpleBg : 'transparent' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🧠</div>
                <div style={{ fontWeight: 700, color: timeMode === 'deep' ? c.purple : c.text }}>Deep Think</div>
                <div style={{ fontSize: '12px', color: c.textMuted }}>15 seconds • +25 XP</div>
              </div>
            </div>
          </div>

          {/* Length Selection */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: c.textMuted, marginBottom: '12px' }}>Session Length</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[10, 20, 30].map((len) => (
                <button key={len} onClick={() => setSessionLength(len)} style={{ ...s.lengthBtn, borderColor: sessionLength === len ? c.blue : c.border, backgroundColor: sessionLength === len ? c.blueBg : 'transparent', color: sessionLength === len ? c.blue : c.text }}>
                  {len} Questions
                </button>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: timeMode === 'quick' ? c.orangeBg : c.purpleBg, border: `1px solid ${timeMode === 'quick' ? c.orange : c.purple}40`, marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', color: c.text }}><strong>⏱️ Mode:</strong> {timeMode === 'quick' ? 'Quick (5s)' : 'Deep (15s)'} • <strong>Potential XP:</strong> {sessionLength * xpPerQuestion}</div>
          </div>

          {/* Stats */}
          {userStats.totalQuestions > 0 && (
            <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: c.bg, marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: c.textMuted, marginBottom: '8px' }}>Your Stats</div>
              <div style={{ display: 'flex', gap: '24px', fontSize: '14px' }}>
                <span><span style={{ color: c.textDim }}>Best Streak:</span> 🔥 {userStats.streak}</span>
                <span><span style={{ color: c.textDim }}>Accuracy:</span> {userStats.accuracy}%</span>
                <span><span style={{ color: c.textDim }}>Total XP:</span> {userStats.correctAnswers * 10}</span>
              </div>
            </div>
          )}

          {/* Trophy Box */}
          <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: c.yellowBg, border: `1px solid ${c.yellow}40`, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>🏆</span>
            <div>
              <div style={{ fontWeight: 600, color: c.text }}>Best Today: {userStats.streak > 0 ? `${userStats.streak} streak!` : 'No streak yet'}</div>
              <div style={{ fontSize: '12px', color: c.textMuted }}>{userStats.streak === 0 ? 'Start a streak!' : userStats.streak < 5 ? `${5 - userStats.streak} more for "On Fire"!` : userStats.streak < 10 ? `${10 - userStats.streak} more for Unstoppable!` : "You're Unstoppable!"}</div>
            </div>
          </div>

          <button onClick={startSession} style={{ ...s.btn, width: '100%', padding: '16px', fontSize: '18px', background: timeMode === 'quick' ? `linear-gradient(90deg, ${c.orange}, ${c.red})` : `linear-gradient(90deg, ${c.purple}, ${c.blue})`, color: '#fff' }}>
            🚀 Start {timeMode === 'quick' ? 'Quick' : 'Deep'} Speedrun
          </button>
        </div>
      </div>
    )
  }

  // Summary Modal
  if (showSummary) {
    return (
      <div style={s.modal}>
        <div style={s.modalCard}>
          <h2 style={{ ...s.title, marginBottom: '24px' }}>📊 Session Summary</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{ ...s.statBox, backgroundColor: c.blueBg }}><div style={{ ...s.statValue, color: c.blue }}>{sessionState.questionsAnswered}</div><div style={s.statLabel}>Questions</div></div>
            <div style={{ ...s.statBox, backgroundColor: c.greenBg }}><div style={{ ...s.statValue, color: c.green }}>{sessionState.correctAnswersThisSession}</div><div style={s.statLabel}>Correct</div></div>
            <div style={{ ...s.statBox, backgroundColor: c.purpleBg }}><div style={{ ...s.statValue, color: c.purple }}>{sessionAccuracy}%</div><div style={s.statLabel}>Accuracy</div></div>
            <div style={{ ...s.statBox, backgroundColor: c.orangeBg }}><div style={{ ...s.statValue, color: c.orange }}>{sessionState.bestStreakThisSession}</div><div style={s.statLabel}>Best Streak</div></div>
          </div>
          <div style={{ ...s.statBox, marginBottom: '24px' }}><div style={s.statLabel}>Time</div><div style={{ fontSize: '20px', fontWeight: 600, color: c.text }}>{formatTime(sessionState.elapsedTime)}</div></div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => { resetSession(); startSession() }} style={{ ...s.btn, ...s.btnPrimary, flex: 1 }}>🔄 Run Again</button>
            <button onClick={resetSession} style={{ ...s.btn, ...s.btnSecondary, flex: 1 }}>Choose Topic</button>
          </div>
        </div>
      </div>
    )
  }

  // Exit Confirm Modal
  if (showExitConfirm) {
    return (
      <div style={s.modal}>
        <div style={{ ...s.modalCard, borderColor: c.orange }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: c.text, marginBottom: '12px' }}>⚠️ Exit Session?</h3>
          <p style={{ fontSize: '14px', color: c.textMuted, marginBottom: '20px' }}>You've completed {sessionState.questionsAnswered}/{sessionState.sessionLength} questions.</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setShowExitConfirm(false)} style={{ ...s.btn, ...s.btnPrimary, flex: 1 }}>Keep Going</button>
            <button onClick={resetSession} style={{ ...s.btn, ...s.btnSecondary, flex: 1 }}>Exit</button>
          </div>
        </div>
      </div>
    )
  }

  // Main Game Screen
  return (
    <div style={s.container}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.card, borderRadius: '12px', border: `1px solid ${c.border}`, padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: c.text, margin: 0 }}>C++ Speedrun</h1>
          <span style={{ ...s.badge, backgroundColor: timeMode === 'quick' ? c.orangeBg : c.purpleBg, color: timeMode === 'quick' ? c.orange : c.purple }}>{timeMode === 'quick' ? '⚡ Quick' : '🧠 Deep'}</span>
          <button onClick={handleExit} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: '14px' }}>Exit</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
          <span style={{ ...s.badge, backgroundColor: streakBroken ? c.redBg : c.orangeBg, color: streakBroken ? c.red : c.orange, border: streakBroken ? `2px solid ${c.red}` : 'none' }}>
            {sessionState.currentStreak >= 5 ? '🔥🔥' : '🔥'} {sessionState.currentStreak} {sessionState.bestStreakThisSession > 0 && `(Best: ${sessionState.bestStreakThisSession})`}
          </span>
          <span style={{ color: c.textMuted }}>Time: <strong style={{ color: c.text, fontFamily: 'monospace' }}>{formatTime(sessionState.elapsedTime)}</strong></span>
        </div>
      </div>

      {/* Streak Break Alert */}
      {streakBroken && (
        <div style={{ backgroundColor: c.redBg, border: `2px solid ${c.red}`, borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: c.red }}>Streak broke at {previousStreak}. Keep going!</span>
        </div>
      )}

      {/* Progress */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
          <span style={{ color: c.text, fontWeight: 500 }}>Progress: {sessionState.questionsAnswered} / {sessionState.sessionLength}</span>
          <span style={{ color: c.textMuted }}>{Math.round(progress)}%</span>
        </div>
        <div style={s.progressBar}>
          <div style={{ ...s.progressFill, width: `${progress}%`, background: progress >= 75 ? `linear-gradient(90deg, ${c.green}, ${c.blue})` : c.blue }} />
        </div>
        {progress >= 75 && progress < 100 && <p style={{ fontSize: '13px', color: c.green, marginTop: '8px' }}>Almost there! 💪</p>}
      </div>

      {/* Question Card */}
      <div style={{ ...s.card, border: flashAnimation === 'correct' ? `3px solid ${c.green}` : flashAnimation === 'wrong' ? `3px solid ${c.red}` : `1px solid ${c.border}`, backgroundColor: flashAnimation === 'correct' ? c.greenBg : flashAnimation === 'wrong' ? c.redBg : c.card }}>
        <p style={{ fontSize: '18px', fontWeight: 500, color: c.text, marginBottom: '16px' }}>{currentQuestion.prompt}</p>

        {/* Code Block for Deep Think */}
        {isDeepThink && currentDeepQuestion?.code && (
          <div style={{ ...s.codeBlock, marginBottom: '20px' }}>{currentDeepQuestion.code}</div>
        )}

        {/* Feedback */}
        {locked && selected !== null && (
          <div style={{ padding: '16px', borderRadius: '12px', marginBottom: '20px', backgroundColor: selected === currentQuestion.answerIndex ? c.greenBg : c.redBg, border: `2px solid ${selected === currentQuestion.answerIndex ? c.green : c.red}` }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: selected === currentQuestion.answerIndex ? c.green : c.red, margin: 0 }}>
              {selected === currentQuestion.answerIndex ? '✓ Correct!' : `✗ Incorrect. Answer: ${currentQuestion.choices[currentQuestion.answerIndex]}`}
            </p>
            {isDeepThink && currentDeepQuestion?.explanation && <p style={{ fontSize: '13px', color: c.textMuted, marginTop: '8px' }}>💡 {currentDeepQuestion.explanation}</p>}
            {!isDeepThink && selected !== currentQuestion.answerIndex && (currentQuestion as Question).hint && <p style={{ fontSize: '13px', color: c.red, marginTop: '8px', fontStyle: 'italic' }}>💡 {(currentQuestion as Question).hint}</p>}
          </div>
        )}

        {/* Choices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {currentQuestion.choices.map((choice, i) => {
            const isCorrect = locked && i === currentQuestion.answerIndex
            const isWrong = locked && selected === i && i !== currentQuestion.answerIndex
            let bg = c.bg, border = c.border, textColor = c.text, letterBg = c.card, letterColor = c.textMuted
            if (isCorrect) { bg = c.greenBg; border = c.green; textColor = c.green; letterBg = c.green; letterColor = '#fff' }
            else if (isWrong) { bg = c.redBg; border = c.red; textColor = c.red; letterBg = c.red; letterColor = '#fff' }
            return (
              <button key={i} onClick={() => handleAnswer(i)} disabled={locked}
                style={{ ...s.choiceBtn, backgroundColor: bg, borderColor: border, color: textColor, opacity: locked && !isCorrect && !isWrong ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}>
                <span style={{ ...s.choiceLetter, backgroundColor: letterBg, color: letterColor }}>{String.fromCharCode(65 + i)}</span>
                <span style={{ flex: 1 }}>{choice}</span>
                {isCorrect && <span>✓</span>}
                {isWrong && <span>✗</span>}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${c.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: c.textMuted }}>⏱️</span>
              <div style={s.timerBar}><div style={{ height: '100%', borderRadius: '4px', backgroundColor: timeLeft <= 3 ? c.red : timeLeft <= timerDuration * 0.5 ? c.orange : c.green, width: `${(timeLeft / timerDuration) * 100}%`, transition: 'width 0.2s' }} /></div>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: timeLeft <= 3 ? c.red : c.text }}>{timeLeft}s</span>
            </div>
            <span style={{ color: c.textMuted }}>Accuracy: <strong style={{ color: c.text }}>{sessionAccuracy}%</strong></span>
            <span style={{ color: c.purple }}>+{xpPerQuestion} XP</span>
          </div>
          <button onClick={next} disabled={!locked} style={{ ...s.btn, ...s.btnPrimary, opacity: locked ? 1 : 0.5, cursor: locked ? 'pointer' : 'not-allowed' }}>
            {sessionState.questionsAnswered >= sessionState.sessionLength ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Speedrun