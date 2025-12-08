import { useState, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { recordAnswer } from '../lib/stats.ts'
import { playSuccess, playFail, playStreak, playCelebration } from '../lib/sounds.ts'

type Flashcard = {
  id: string
  front: string
  back: string
  category: string
  difficulty?: 'easy' | 'medium' | 'hard'
  choices?: string[]
  correctIndex?: number
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
  yellowBg: 'rgba(234, 179, 8, 0.1)',
}

const INTERVALS = {
  easy: [1, 3, 7, 14, 30],
  medium: [1, 2, 5, 10, 21],
  hard: [1, 1, 3, 7, 14],
}

type CardProgress = {
  cardId: string
  lastReviewed: number
  interval: number
  repetition: number
  easeFactor: number
  nextReview: number
}

const CATEGORY_CONCEPTS: Record<string, string> = {
  'OOP': `Object-Oriented Programming (OOP) is a paradigm based on "objects" containing data and code. Key ideas: encapsulation, inheritance, and polymorphism.`,
  'C++ Basics': `C++ basics include libraries, namespaces, and I/O. Know the difference between standard and user-defined headers.`,
  'Pointers': `Pointers store memory addresses. Essential for dynamic memory and data structures.`,
  'Memory Management': `C++ gives manual control over memory (new/delete). Proper management prevents leaks.`,
  'Data Structures': `C++ provides arrays and containers like std::vector. Know when to use each.`,
  'Control Flow': `Control flow (if, for, while, break, continue) directs program execution.`,
  'Common Errors': `Common errors: assignment vs comparison, off-by-one, output buffering issues.`,
  'Recursion': `Recursion: function calls itself. Needs base case and recursive case.`,
}

const FLASHCARD_DECK: Flashcard[] = [
  { id: 'cpp1', front: 'What is the difference between #include <iostream> and #include "myfile.h"?', back: 'Angle brackets < > search system directories first. Quotes " " search current directory first.', category: 'C++ Basics', difficulty: 'easy' },
  { id: 'cpp2', front: 'What does "using namespace std;" do?', back: 'Allows using std names without std:: prefix. Avoid in headers to prevent naming conflicts.', category: 'C++ Basics', difficulty: 'medium' },
  { id: 'cpp3', front: 'What is the difference between cin >> and getline()?', back: 'cin >> stops at whitespace. getline() reads entire line including spaces.', category: 'C++ Basics', difficulty: 'easy' },
  { id: 'cpp4', front: 'What is a segmentation fault?', back: 'Accessing memory without permission. Causes: null pointers, array out-of-bounds, stack overflow.', category: 'C++ Debugging', difficulty: 'medium' },
  { id: 'cpp5', front: 'Pass by value vs reference vs pointer?', back: 'Value: copies data. Reference (&): alias to original. Pointer (*): passes address, can be null.', category: 'C++ Functions', difficulty: 'medium' },
  { id: 'cpp6', front: 'What does int* ptr = nullptr; mean?', back: 'Declares pointer to int, initialized to null. Always initialize pointers!', category: 'Pointers', difficulty: 'easy' },
  { id: 'cpp7', front: 'What is *ptr vs &var?', back: '* dereferences (gets value at address). & gets memory address of variable.', category: 'Pointers', difficulty: 'medium' },
  { id: 'cpp8', front: 'What is a memory leak?', back: 'Memory allocated (new) but never freed (delete). Use smart pointers or RAII.', category: 'Memory Management', difficulty: 'hard' },
  { id: 'cpp9', front: 'Stack vs heap memory?', back: 'Stack: automatic, fast, limited. Heap: manual (new/delete), slower, larger.', category: 'Memory Management', difficulty: 'hard' },
  { id: 'cpp10', front: 'What happens if you delete a pointer twice?', back: 'Undefined behavior! Set pointer to nullptr after delete.', category: 'Memory Management', difficulty: 'medium' },
  { id: 'cpp11', front: 'C-style array vs std::vector?', back: 'Array: fixed size, no bounds checking. Vector: dynamic, safer, knows its size.', category: 'Data Structures', difficulty: 'easy' },
  { id: 'cpp12', front: 'push_back() vs emplace_back()?', back: 'push_back copies/moves object. emplace_back constructs in-place (more efficient).', category: 'Data Structures', difficulty: 'medium' },
  { id: 'cpp14', front: 'What is an infinite loop?', back: 'Loop that never terminates. Avoid by ensuring exit condition is reachable.', category: 'Control Flow', difficulty: 'easy' },
  { id: 'cpp15', front: 'break vs continue?', back: 'break exits loop entirely. continue skips to next iteration.', category: 'Control Flow', difficulty: 'easy' },
  { id: 'cpp17', front: 'public vs private vs protected?', back: 'public: anywhere. private: class only. protected: class + derived classes.', category: 'OOP', difficulty: 'medium' },
  { id: 'cpp18', front: 'What is a constructor?', back: 'Special function that initializes objects. Called automatically on creation.', category: 'OOP', difficulty: 'easy' },
  { id: 'cpp19', front: 'What is a destructor?', back: 'Function (~ClassName) that cleans up when object is destroyed.', category: 'OOP', difficulty: 'medium' },
  { id: 'cpp21', front: 'Difference between = and ==?', back: '= is assignment. == is comparison. Common bug: if(x=5) always true!', category: 'Common Errors', difficulty: 'easy' },
  { id: 'cpp22', front: 'What is an off-by-one error?', back: 'Loop runs one too many/few times. Common with array indices.', category: 'Common Errors', difficulty: 'easy' },
  { id: 'cpp25', front: 'Two parts of recursive function?', back: '1) Base case (stops recursion). 2) Recursive case (calls itself with smaller problem).', category: 'Recursion', difficulty: 'medium' },
]

const STORAGE_KEY = 'codetogether:flashcard-progress'

function getCardProgress(): Map<string, CardProgress> {
  if (typeof window === 'undefined') return new Map()
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return new Map()
  try {
    return new Map(Object.entries(JSON.parse(stored)))
  } catch {
    return new Map()
  }
}

function saveCardProgress(progress: Map<string, CardProgress>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(progress)))
}

function updateCardProgress(cardId: string, quality: number, card: Flashcard): CardProgress {
  const progress = getCardProgress()
  const existing = progress.get(cardId)
  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000

  if (!existing) {
    const difficulty = card.difficulty || 'medium'
    const intervals = INTERVALS[difficulty]
    return { cardId, lastReviewed: now, interval: intervals[0], repetition: 0, easeFactor: 2.5, nextReview: now + intervals[0] * oneDay }
  }

  let { interval, repetition, easeFactor } = existing
  if (quality < 2) {
    repetition = 0
    interval = 1
  } else {
    interval = repetition === 0 ? 1 : repetition === 1 ? 6 : Math.round(interval * easeFactor)
    repetition += 1
  }
  if (quality === 0) easeFactor = Math.max(1.3, easeFactor - 0.2)
  else if (quality === 1) easeFactor = Math.max(1.3, easeFactor - 0.15)
  else if (quality === 3) easeFactor += 0.15

  return { cardId, lastReviewed: now, interval, repetition, easeFactor, nextReview: now + interval * oneDay }
}

function getCardsDue(): Flashcard[] {
  const progress = getCardProgress()
  const now = Date.now()
  return FLASHCARD_DECK.filter((card) => {
    const cardProgress = progress.get(card.id)
    return !cardProgress || cardProgress.nextReview <= now
  })
}

function createMCQCard(card: Flashcard): Flashcard {
  const distractors = [
    'This is handled automatically by the compiler',
    'Both options are equivalent',
    'This only applies to C, not C++',
    'The behavior is undefined',
  ]
  const shuffledDistractors = [...distractors].sort(() => Math.random() - 0.5).slice(0, 3)
  const shortAnswer = card.back.split('.')[0] + '.'
  const choices = [shortAnswer, ...shuffledDistractors].sort(() => Math.random() - 0.5)
  return { ...card, choices, correctIndex: choices.indexOf(shortAnswer) }
}

function Flashcards() {
  const [mode, setMode] = useState<'spaced' | 'mcq'>('spaced')
  const [isFlipped, setIsFlipped] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [cardsDue, setCardsDue] = useState<Flashcard[]>([])
  const [reviewedCount, setReviewedCount] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [showStats, setShowStats] = useState(false)
  const [sessionStartTime] = useState(Date.now())
  const [mcqTimer, setMcqTimer] = useState(5)
  const [streak, setStreak] = useState(0)
  const [xp, setXp] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)
  const progressRef = useRef<Map<string, CardProgress>>(getCardProgress())
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (mode === 'spaced') {
      const due = getCardsDue()
      setCardsDue(due.length > 0 ? due : FLASHCARD_DECK.slice(0, 5))
    } else {
      setCardsDue(FLASHCARD_DECK.slice(0, 10).map(createMCQCard))
    }
    setCurrentIndex(0)
    setReviewedCount(0)
    setCorrectCount(0)
    setStreak(0)
    setXp(0)
    setIsFlipped(false)
    setSelectedAnswer(null)
    setShowResult(false)
  }, [mode])

  useEffect(() => {
    if (mode === 'mcq' && !showResult && currentCard) {
      setMcqTimer(5)
      setSelectedAnswer(null)
      setShowResult(false)
      timerRef.current = window.setInterval(() => {
        setMcqTimer((prev) => {
          if (prev <= 1) {
            handleMCQAnswer(-1)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }
  }, [mode, currentIndex, showResult])

  const currentCard = cardsDue[currentIndex]
  const progress = progressRef.current.get(currentCard?.id || '')
  const conceptualBackground = CATEGORY_CONCEPTS[currentCard?.category || '']

  useEffect(() => {
    const interval = setInterval(() => saveCardProgress(progressRef.current), 5000)
    return () => clearInterval(interval)
  }, [])

  const handleFlip = () => setIsFlipped(!isFlipped)

  const handleMCQAnswer = async (selectedIndex: number) => {
    if (!currentCard || showResult) return
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const isCorrect = selectedIndex === currentCard.correctIndex
    setSelectedAnswer(selectedIndex)
    setShowResult(true)
    if (isCorrect) {
      playSuccess()
      setStreak((prev) => { const n = prev + 1; if (n > 0 && n % 3 === 0) playStreak(); return n })
      setXp((prev) => prev + 2)
      setCorrectCount((prev) => prev + 1)
    } else {
      playFail()
      setStreak(0)
    }
    await recordAnswer(isCorrect, streak, isCorrect ? 2 : 0)
    setReviewedCount((prev) => prev + 1)
    setTimeout(() => {
      if (currentIndex < cardsDue.length - 1) {
        setCurrentIndex((prev) => prev + 1)
        setShowResult(false)
        setSelectedAnswer(null)
      } else {
        playCelebration()
        setShowStats(true)
      }
    }, 1500)
  }

  const handleRating = async (quality: number) => {
    if (!currentCard) return
    const isCorrect = quality >= 2
    const newProgress = updateCardProgress(currentCard.id, quality, currentCard)
    progressRef.current.set(currentCard.id, newProgress)
    saveCardProgress(progressRef.current)
    await recordAnswer(isCorrect, isCorrect ? correctCount + 1 : 0, isCorrect ? 5 : 0)
    if (isCorrect) setCorrectCount((prev) => prev + 1)
    setReviewedCount((prev) => prev + 1)
    setIsFlipped(false)
    if (currentIndex < cardsDue.length - 1) setCurrentIndex((prev) => prev + 1)
    else setShowStats(true)
  }

  const resetSession = () => {
    setIsFlipped(false)
    setCurrentIndex(0)
    setReviewedCount(0)
    setCorrectCount(0)
    setShowStats(false)
    const due = getCardsDue()
    setCardsDue(due.length > 0 ? due : FLASHCARD_DECK.slice(0, 5))
  }

  const sessionTime = Math.floor((Date.now() - sessionStartTime) / 1000)
  const accuracy = reviewedCount > 0 ? Math.round((correctCount / reviewedCount) * 100) : 0

  // Styles
  const s: Record<string, CSSProperties> = {
    container: { maxWidth: '700px', margin: '0 auto', padding: '24px' },
    card: { backgroundColor: c.card, borderRadius: '16px', border: `1px solid ${c.border}`, padding: '24px' },
    title: { fontSize: '28px', fontWeight: 700, color: c.text, margin: 0 },
    subtitle: { fontSize: '14px', color: c.textMuted, marginTop: '4px' },
    modeToggle: { display: 'flex', gap: '8px', padding: '4px', backgroundColor: c.bg, borderRadius: '12px', marginBottom: '20px' },
    modeBtn: { flex: 1, padding: '10px 16px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' },
    modeBtnActive: { backgroundColor: c.card, color: c.blue, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' },
    modeBtnInactive: { backgroundColor: 'transparent', color: c.textMuted },
    progressBar: { height: '8px', backgroundColor: c.bg, borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' },
    progressFill: { height: '100%', backgroundColor: c.blue, borderRadius: '4px', transition: 'width 0.3s' },
    statsRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: c.textMuted, marginBottom: '24px' },
    flashcard: { minHeight: '280px', borderRadius: '16px', padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s', textAlign: 'center' as const },
    flashcardFront: { backgroundColor: c.card, border: `2px solid ${c.border}` },
    flashcardBack: { backgroundColor: c.blueBg, border: `2px solid ${c.blue}` },
    category: { fontSize: '12px', color: c.textDim, textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: '16px' },
    question: { fontSize: '20px', fontWeight: 500, color: c.text, lineHeight: 1.5 },
    answer: { fontSize: '18px', color: c.text, lineHeight: 1.6 },
    btn: { padding: '12px 24px', borderRadius: '10px', border: 'none', fontSize: '15px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' },
    btnPrimary: { backgroundColor: c.blue, color: '#fff' },
    btnAgain: { backgroundColor: c.redBg, color: c.red, border: `2px solid ${c.red}30` },
    btnHard: { backgroundColor: c.orangeBg, color: c.orange, border: `2px solid ${c.orange}30` },
    btnGood: { backgroundColor: c.blueBg, color: c.blue, border: `2px solid ${c.blue}30` },
    btnEasy: { backgroundColor: c.greenBg, color: c.green, border: `2px solid ${c.green}30` },
    ratingGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '20px' },
    mcqChoice: { padding: '16px', borderRadius: '12px', border: `2px solid ${c.border}`, backgroundColor: c.bg, cursor: 'pointer', textAlign: 'left' as const, fontSize: '15px', color: c.text, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '12px' },
    mcqLetter: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: c.card, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 },
    timer: { fontSize: '48px', fontWeight: 700, textAlign: 'center' as const, marginBottom: '20px' },
    conceptBox: { backgroundColor: c.yellowBg, border: `1px solid ${c.yellow}40`, borderRadius: '12px', padding: '16px', marginBottom: '20px', fontSize: '14px', color: c.text },
    statBox: { textAlign: 'center' as const, padding: '20px', backgroundColor: c.bg, borderRadius: '12px' },
    statValue: { fontSize: '28px', fontWeight: 700 },
    statLabel: { fontSize: '13px', color: c.textMuted, marginTop: '4px' },
    badge: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 },
  }

  // Stats view
  if (showStats) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h1 style={{ ...s.title, textAlign: 'center', marginBottom: '24px' }}>Session Complete! 🎉</h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={s.statBox}>
              <div style={{ ...s.statValue, color: c.blue }}>{reviewedCount}</div>
              <div style={s.statLabel}>Cards Reviewed</div>
            </div>
            <div style={s.statBox}>
              <div style={{ ...s.statValue, color: c.green }}>{correctCount}</div>
              <div style={s.statLabel}>Correct</div>
            </div>
            <div style={s.statBox}>
              <div style={{ ...s.statValue, color: c.purple }}>{accuracy}%</div>
              <div style={s.statLabel}>Accuracy</div>
            </div>
          </div>
          <div style={{ ...s.statBox, marginBottom: '24px' }}>
            <div style={s.statLabel}>Time Spent</div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: c.text }}>{Math.floor(sessionTime / 60)}:{(sessionTime % 60).toString().padStart(2, '0')}</div>
          </div>
          <button onClick={resetSession} style={{ ...s.btn, ...s.btnPrimary, width: '100%' }}>Review More Cards</button>
        </div>
      </div>
    )
  }

  if (!currentCard) {
    return (
      <div style={s.container}>
        <div style={{ ...s.card, textAlign: 'center' }}>
          <p style={{ fontSize: '18px', color: c.text, marginBottom: '20px' }}>No cards available. Great job!</p>
          <button onClick={resetSession} style={{ ...s.btn, ...s.btnPrimary }}>Start New Session</button>
        </div>
      </div>
    )
  }

  const nextReviewDate = progress?.nextReview ? new Date(progress.nextReview).toLocaleDateString() : 'New card'

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={s.title}>Flashcards</h1>
          <p style={s.subtitle}>{mode === 'spaced' ? 'Spaced repetition learning' : 'MCQ Speedrun - 5s per question'}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            {mode === 'mcq' && streak > 0 && (
              <span style={{ ...s.badge, backgroundColor: c.orangeBg, color: c.orange }}>🔥 {streak}</span>
            )}
            {mode === 'mcq' && (
              <span style={{ ...s.badge, backgroundColor: c.purpleBg, color: c.purple }}>⭐ {xp} XP</span>
            )}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: c.text }}>Card {currentIndex + 1} / {cardsDue.length}</div>
          <div style={{ fontSize: '12px', color: c.textDim }}>{reviewedCount} reviewed • {correctCount} correct</div>
        </div>
      </div>

      {/* Concept Background */}
      {conceptualBackground && (
        <div style={s.conceptBox}>
          <strong>💡 Concept:</strong> {conceptualBackground}
        </div>
      )}

      {/* Mode Toggle */}
      <div style={s.modeToggle}>
        <button onClick={() => setMode('spaced')} style={{ ...s.modeBtn, ...(mode === 'spaced' ? s.modeBtnActive : s.modeBtnInactive) }}>📚 Spaced Repetition</button>
        <button onClick={() => setMode('mcq')} style={{ ...s.modeBtn, ...(mode === 'mcq' ? s.modeBtnActive : s.modeBtnInactive) }}>⚡ MCQ Speedrun</button>
      </div>

      {/* Progress */}
      <div style={s.progressBar}>
        <div style={{ ...s.progressFill, width: `${((currentIndex + 1) / cardsDue.length) * 100}%` }} />
      </div>
      <div style={s.statsRow}>
        <span>{cardsDue.length - currentIndex - 1} remaining</span>
        <span>{accuracy}% accuracy</span>
      </div>

      {/* MCQ Mode */}
      {mode === 'mcq' && currentCard.choices ? (
        <div>
          <div style={{ ...s.timer, color: mcqTimer <= 2 ? c.red : c.blue }}>{mcqTimer}s</div>
          <div style={{ ...s.flashcard, ...s.flashcardFront, marginBottom: '20px', cursor: 'default' }}>
            <div>
              <div style={s.category}>{currentCard.category}</div>
              <div style={s.question}>{currentCard.front}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {currentCard.choices.map((choice, i) => {
              const isSelected = selectedAnswer === i
              const isCorrect = i === currentCard.correctIndex
              const showCorrect = showResult && isCorrect
              const showWrong = showResult && isSelected && !isCorrect
              let bg = c.bg, border = c.border, textColor = c.text
              if (showCorrect) { bg = c.greenBg; border = c.green; textColor = c.green }
              else if (showWrong) { bg = c.redBg; border = c.red; textColor = c.red }
              else if (isSelected) { bg = c.blueBg; border = c.blue; textColor = c.blue }
              return (
                <button key={i} onClick={() => !showResult && handleMCQAnswer(i)} disabled={showResult}
                  style={{ ...s.mcqChoice, backgroundColor: bg, borderColor: border, color: textColor, opacity: showResult && !isCorrect && !isSelected ? 0.5 : 1 }}>
                  <span style={{ ...s.mcqLetter, backgroundColor: showCorrect ? c.green : showWrong ? c.red : isSelected ? c.blue : c.card, color: (showCorrect || showWrong || isSelected) ? '#fff' : c.textMuted }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span style={{ flex: 1 }}>{choice}</span>
                  {showCorrect && <span>✓</span>}
                  {showWrong && <span>✗</span>}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        /* Spaced Repetition Mode */
        <div>
          <div onClick={handleFlip} style={{ ...s.flashcard, ...(isFlipped ? s.flashcardBack : s.flashcardFront) }}>
            <div>
              <div style={{ ...s.category, color: isFlipped ? c.blue : c.textDim }}>{isFlipped ? 'Answer' : currentCard.category}</div>
              <div style={isFlipped ? s.answer : s.question}>{isFlipped ? currentCard.back : currentCard.front}</div>
              {!isFlipped && <div style={{ fontSize: '13px', color: c.textDim, marginTop: '24px', borderTop: `1px solid ${c.border}`, paddingTop: '16px' }}>Click to reveal answer</div>}
              {isFlipped && progress && <div style={{ fontSize: '12px', color: c.textDim, marginTop: '16px' }}>Next review: {nextReviewDate}</div>}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            {!isFlipped ? (
              <button onClick={handleFlip} style={{ ...s.btn, ...s.btnPrimary }}>Show Answer</button>
            ) : (
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: c.text, marginBottom: '16px' }}>How well did you know this?</div>
                <div style={s.ratingGrid}>
                  <button onClick={() => handleRating(0)} style={{ ...s.btn, ...s.btnAgain }}>Again</button>
                  <button onClick={() => handleRating(1)} style={{ ...s.btn, ...s.btnHard }}>Hard</button>
                  <button onClick={() => handleRating(2)} style={{ ...s.btn, ...s.btnGood }}>Good</button>
                  <button onClick={() => handleRating(3)} style={{ ...s.btn, ...s.btnEasy }}>Easy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Flashcards