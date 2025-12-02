import { useState, useEffect, useRef } from 'react'
import { recordAnswer } from '../lib/stats.ts'
import { playSuccess, playFail, playStreak } from '../lib/sounds.ts'

type Flashcard = {
	id: string
	front: string
	back: string
	category: string
	difficulty?: 'easy' | 'medium' | 'hard'
	choices?: string[] // For MCQ mode
	correctIndex?: number // For MCQ mode
}

// Spaced repetition intervals (in days)
const INTERVALS = {
	easy: [1, 3, 7, 14, 30],
	medium: [1, 2, 5, 10, 21],
	hard: [1, 1, 3, 7, 14],
}

type CardProgress = {
	cardId: string
	lastReviewed: number
	interval: number // days
	repetition: number // 0-4 (which interval we're on)
	easeFactor: number // starts at 2.5, adjusts based on performance
	nextReview: number // timestamp
}

const FLASHCARD_DECK: Flashcard[] = [
	{
		id: 'fc1',
		front: 'What is a closure in JavaScript?',
		back: 'A closure is a function that has access to variables in its outer (enclosing) lexical scope, even after the outer function has returned.',
		category: 'JavaScript Fundamentals',
		difficulty: 'medium',
	},
	{
		id: 'fc2',
		front: 'What does the spread operator (...) do?',
		back: 'The spread operator expands iterables (arrays, objects) into individual elements. It can be used for copying arrays, merging objects, or passing arguments.',
		category: 'JavaScript Fundamentals',
		difficulty: 'easy',
	},
	{
		id: 'fc3',
		front: 'What is the difference between == and ===?',
		back: '== performs type coercion (converts types before comparison), while === checks both value and type without coercion (strict equality).',
		category: 'JavaScript Fundamentals',
		difficulty: 'easy',
	},
	{
		id: 'fc4',
		front: 'What is the event loop?',
		back: 'The event loop is JavaScript\'s mechanism for handling asynchronous operations. It continuously checks the call stack and message queue, executing callbacks when the stack is empty.',
		category: 'JavaScript Advanced',
		difficulty: 'hard',
	},
	{
		id: 'fc5',
		front: 'What is a promise?',
		back: 'A promise is an object representing the eventual completion or failure of an asynchronous operation. It has three states: pending, fulfilled, or rejected.',
		category: 'JavaScript Advanced',
		difficulty: 'medium',
	},
	{
		id: 'fc6',
		front: 'What is destructuring?',
		back: 'Destructuring is a JavaScript feature that allows extracting values from arrays or properties from objects into distinct variables using a concise syntax.',
		category: 'JavaScript Fundamentals',
		difficulty: 'easy',
	},
	{
		id: 'fc7',
		front: 'What is the difference between let, const, and var?',
		back: 'let is block-scoped and can be reassigned. const is block-scoped and cannot be reassigned. var is function-scoped and can be reassigned. let and const are not hoisted like var.',
		category: 'JavaScript Fundamentals',
		difficulty: 'medium',
	},
	{
		id: 'fc8',
		front: 'What is a higher-order function?',
		back: 'A higher-order function is a function that either takes one or more functions as arguments, returns a function, or both. Examples include map, filter, and reduce.',
		category: 'JavaScript Fundamentals',
		difficulty: 'medium',
	},
	{
		id: 'fc9',
		front: 'What is async/await?',
		back: 'async/await is syntactic sugar for promises that makes asynchronous code look and behave more like synchronous code. async functions return promises, and await pauses execution until the promise resolves.',
		category: 'JavaScript Advanced',
		difficulty: 'medium',
	},
	{
		id: 'fc10',
		front: 'What is the difference between null and undefined?',
		back: 'null is an intentional absence of value (assigned by the programmer). undefined means a variable has been declared but not assigned a value. typeof null is "object" (a bug), typeof undefined is "undefined".',
		category: 'JavaScript Fundamentals',
		difficulty: 'easy',
	},
	{
		id: 'fc11',
		front: 'What is the purpose of useEffect in React?',
		back: 'useEffect is a React hook that lets you perform side effects in function components. It runs after render and can handle API calls, subscriptions, DOM manipulation, and cleanup.',
		category: 'React',
		difficulty: 'medium',
	},
	{
		id: 'fc12',
		front: 'What is the difference between useState and useReducer?',
		back: 'useState is for simple state management with a single value. useReducer is for complex state logic with multiple sub-values or when the next state depends on the previous one. useReducer is more predictable for complex updates.',
		category: 'React',
		difficulty: 'hard',
	},
	{
		id: 'fc13',
		front: 'What is memoization?',
		back: 'Memoization is an optimization technique that caches the results of expensive function calls and returns the cached result when the same inputs occur again. React provides useMemo and useCallback for this.',
		category: 'React',
		difficulty: 'medium',
	},
	{
		id: 'fc14',
		front: 'What is the virtual DOM?',
		back: 'The virtual DOM is a JavaScript representation of the real DOM. React uses it to optimize updates by comparing the virtual DOM with the previous version and only updating the parts that changed (reconciliation).',
		category: 'React',
		difficulty: 'medium',
	},
	{
		id: 'fc15',
		front: 'What is JSX?',
		back: 'JSX is a syntax extension for JavaScript that looks like HTML. It allows you to write HTML-like code in JavaScript, which React then transforms into React.createElement() calls.',
		category: 'React',
		difficulty: 'easy',
	},
]

const STORAGE_KEY = 'codetogether:flashcard-progress'

function getCardProgress(): Map<string, CardProgress> {
	if (typeof window === 'undefined') return new Map()
	
	const stored = window.localStorage.getItem(STORAGE_KEY)
	if (!stored) return new Map()
	
	try {
		const data = JSON.parse(stored)
		return new Map(Object.entries(data))
	} catch {
		return new Map()
	}
}

function saveCardProgress(progress: Map<string, CardProgress>) {
	if (typeof window === 'undefined') return
	
	const data = Object.fromEntries(progress)
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function updateCardProgress(
	cardId: string,
	quality: number, // 0-5: 0=again, 1=hard, 2=good, 3=easy
	card: Flashcard
): CardProgress {
	const progress = getCardProgress()
	const existing = progress.get(cardId)
	
	const now = Date.now()
	const oneDay = 24 * 60 * 60 * 1000
	
	if (!existing) {
		// New card
		const difficulty = card.difficulty || 'medium'
		const intervals = INTERVALS[difficulty]
		const nextReview = now + intervals[0] * oneDay
		
		return {
			cardId,
			lastReviewed: now,
			interval: intervals[0],
			repetition: 0,
			easeFactor: 2.5,
			nextReview,
		}
	}
	
	// Update based on SM-2 algorithm (simplified)
	let { interval, repetition, easeFactor } = existing
	
	if (quality < 2) {
		// Again or Hard - reset
		repetition = 0
		interval = 1
	} else {
		// Good or Easy - advance
		if (repetition === 0) {
			interval = 1
		} else if (repetition === 1) {
			interval = 6
		} else {
			interval = Math.round(interval * easeFactor)
		}
		repetition += 1
	}
	
	// Adjust ease factor
	if (quality === 0) {
		easeFactor = Math.max(1.3, easeFactor - 0.2)
	} else if (quality === 1) {
		easeFactor = Math.max(1.3, easeFactor - 0.15)
	} else if (quality === 3) {
		easeFactor = easeFactor + 0.15
	}
	
	const nextReview = now + interval * oneDay
	
	return {
		cardId,
		lastReviewed: now,
		interval,
		repetition,
		easeFactor,
		nextReview,
	}
}

function getCardsDue(): Flashcard[] {
	const progress = getCardProgress()
	const now = Date.now()
	
	return FLASHCARD_DECK.filter((card) => {
		const cardProgress = progress.get(card.id)
		if (!cardProgress) return true // New cards are due
		return cardProgress.nextReview <= now
	})
}

// Convert flashcards to MCQ format
function createMCQCard(card: Flashcard): Flashcard {
	// For demo, create simple MCQ from existing cards
	const choices = [
		card.back, // Correct answer
		'A different answer that seems plausible',
		'Another option that could be correct',
		'An incorrect but related answer',
	]
	// Shuffle choices
	const shuffled = [...choices].sort(() => Math.random() - 0.5)
	const correctIndex = shuffled.indexOf(card.back)
	
	return {
		...card,
		choices: shuffled,
		correctIndex,
	}
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

	// Load due cards
	useEffect(() => {
		if (mode === 'spaced') {
			const due = getCardsDue()
			setCardsDue(due.length > 0 ? due : FLASHCARD_DECK.slice(0, 5)) // Fallback to first 5 if none due
		} else {
			// MCQ mode: convert first 10 cards to MCQ format
			const mcqCards = FLASHCARD_DECK.slice(0, 10).map(createMCQCard)
			setCardsDue(mcqCards)
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

	// MCQ Timer
	useEffect(() => {
		if (mode === 'mcq' && !showResult && currentCard) {
			setMcqTimer(5)
			setSelectedAnswer(null)
			setShowResult(false)
			
			timerRef.current = window.setInterval(() => {
				setMcqTimer((prev) => {
					if (prev <= 1) {
						// Time's up - mark as incorrect
						handleMCQAnswer(-1)
						return 0
					}
					return prev - 1
				})
			}, 1000)
			
			return () => {
				if (timerRef.current) {
					clearInterval(timerRef.current)
				}
			}
		}
	}, [mode, currentIndex, showResult])

	const currentCard = cardsDue[currentIndex]
	const progress = progressRef.current.get(currentCard?.id || '')

	// Save progress periodically
	useEffect(() => {
		const interval = setInterval(() => {
			saveCardProgress(progressRef.current)
		}, 5000) // Save every 5 seconds
		return () => clearInterval(interval)
	}, [])

	const handleFlip = () => {
		setIsFlipped(!isFlipped)
	}

	const handleMCQAnswer = async (selectedIndex: number) => {
		if (!currentCard || showResult) return
		
		if (timerRef.current) {
			clearInterval(timerRef.current)
			timerRef.current = null
		}
		
		const isCorrect = selectedIndex === currentCard.correctIndex
		setSelectedAnswer(selectedIndex)
		setShowResult(true)
		
		// Play sound
		if (isCorrect) {
			playSuccess()
			setStreak((prev) => {
				const newStreak = prev + 1
				if (newStreak > 0 && newStreak % 3 === 0) {
					playStreak()
				}
				return newStreak
			})
			setXp((prev) => prev + 2)
			setCorrectCount((prev) => prev + 1)
		} else {
			playFail()
			setStreak(0)
		}
		
		await recordAnswer(isCorrect, streak)
		setReviewedCount((prev) => prev + 1)
		
		// Auto-advance after 1.5 seconds
		setTimeout(() => {
			if (currentIndex < cardsDue.length - 1) {
				setCurrentIndex((prev) => prev + 1)
				setShowResult(false)
				setSelectedAnswer(null)
			} else {
				setShowStats(true)
			}
		}, 1500)
	}

	const handleRating = async (quality: number) => {
		if (!currentCard) return

		const isCorrect = quality >= 2 // Good or Easy = correct
		
		// Update progress
		const newProgress = updateCardProgress(currentCard.id, quality, currentCard)
		progressRef.current.set(currentCard.id, newProgress)
		saveCardProgress(progressRef.current)

		// Record for stats (treat as answer)
		await recordAnswer(isCorrect, isCorrect ? (correctCount + 1) : 0)

		if (isCorrect) {
			setCorrectCount((prev) => prev + 1)
		}

		setReviewedCount((prev) => prev + 1)
		setIsFlipped(false)

		// Move to next card
		if (currentIndex < cardsDue.length - 1) {
			setCurrentIndex((prev) => prev + 1)
		} else {
			// Session complete
			setShowStats(true)
		}
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

	// Stats view
	if (showStats) {
		return (
			<div className="mx-auto max-w-2xl p-6 space-y-6">
				<div className="border rounded-lg p-6 bg-white dark:bg-neutral-900 space-y-4">
					<h1 className="text-2xl font-bold text-center">Session Complete! 🎉</h1>
					
					<div className="grid grid-cols-3 gap-4">
						<div className="text-center p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
							<div className="text-2xl font-bold">{reviewedCount}</div>
							<div className="text-sm text-neutral-600 dark:text-neutral-400">Cards Reviewed</div>
						</div>
						<div className="text-center p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
							<div className="text-2xl font-bold">{correctCount}</div>
							<div className="text-sm text-neutral-600 dark:text-neutral-400">Correct</div>
						</div>
						<div className="text-center p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
							<div className="text-2xl font-bold">{accuracy}%</div>
							<div className="text-sm text-neutral-600 dark:text-neutral-400">Accuracy</div>
						</div>
					</div>

					<div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
						<div className="text-sm">
							<strong>Time Spent:</strong> {Math.floor(sessionTime / 60)}:{(sessionTime % 60).toString().padStart(2, '0')}
						</div>
						<div className="text-sm mt-2">
							<strong>Cards Due Next:</strong> {getCardsDue().length} cards need review
						</div>
					</div>

					<button
						type="button"
						onClick={resetSession}
						className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold transition-colors cursor-pointer touch-manipulation active:scale-95"
					>
						Review More Cards
					</button>
				</div>
			</div>
		)
	}

	if (!currentCard) {
		return (
			<div className="mx-auto max-w-2xl p-6 text-center">
				<p className="text-lg">No cards available. Great job reviewing!</p>
				<button
					type="button"
					onClick={resetSession}
					className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
				>
					Start New Session
				</button>
			</div>
		)
	}

	const nextReviewDate = progress?.nextReview
		? new Date(progress.nextReview).toLocaleDateString()
		: 'New card'

	return (
		<div className="mx-auto max-w-2xl p-6 space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between mb-4">
				<div>
					<h1 className="text-3xl font-bold mb-1">Flashcards</h1>
					<p className="text-sm text-neutral-600 dark:text-neutral-400">
						{mode === 'spaced' ? 'Spaced repetition learning system' : 'MCQ Speedrun Mode - 5 seconds per question'}
					</p>
				</div>
				<div className="text-right space-y-2">
					<div className="flex items-center gap-3">
						{mode === 'mcq' && streak > 0 && (
							<span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-semibold">
								🔥 Streak: {streak}
							</span>
						)}
						{mode === 'mcq' && (
							<span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold">
								⭐ XP: {xp}
							</span>
						)}
					</div>
					<div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
						Card {currentIndex + 1} / {cardsDue.length}
					</div>
					<div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
						{reviewedCount} reviewed • {correctCount} correct
					</div>
				</div>
			</div>

			{/* Mode Toggle */}
			<div className="flex gap-2 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
				<button
					type="button"
					onClick={() => setMode('spaced')}
					className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
						mode === 'spaced'
							? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm'
							: 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
					}`}
				>
					📚 Spaced Repetition
				</button>
				<button
					type="button"
					onClick={() => setMode('mcq')}
					className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
						mode === 'mcq'
							? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm'
							: 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
					}`}
				>
					⚡ MCQ Speedrun (5s)
				</button>
			</div>

			{/* Progress Bar */}
			<div className="space-y-2 mb-6">
				<div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden shadow-inner">
					<div
						className="h-3 bg-blue-500 rounded-full transition-all duration-300 shadow-sm"
						style={{ width: `${((currentIndex + 1) / cardsDue.length) * 100}%` }}
					/>
				</div>
				<div className="flex justify-between text-sm text-neutral-600 dark:text-neutral-400">
					<span className="font-medium">{cardsDue.length - currentIndex - 1} cards remaining</span>
					<span className="font-medium">{accuracy}% accuracy</span>
				</div>
			</div>

			{/* MCQ Mode */}
			{mode === 'mcq' && currentCard.choices ? (
				<div className="space-y-6">
					{/* Timer */}
					<div className="flex items-center justify-center">
						<div className={`text-4xl font-bold font-mono ${
							mcqTimer <= 2 ? 'text-red-600 dark:text-red-400 animate-pulse' : 'text-blue-600 dark:text-blue-400'
						}`}>
							{mcqTimer}s
						</div>
					</div>
					
					{/* Question */}
					<div className="border-2 border-blue-200 dark:border-blue-800 rounded-xl p-8 bg-blue-50 dark:bg-blue-900/20 shadow-lg">
						<div className="text-center space-y-4">
							<div className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide font-medium">
								{currentCard.category}
							</div>
							<div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 leading-relaxed">
								{currentCard.front}
							</div>
						</div>
					</div>
					
					{/* Choices */}
					<div className="grid grid-cols-1 gap-3">
						{currentCard.choices.map((choice, index) => {
							const isSelected = selectedAnswer === index
							const isCorrect = index === currentCard.correctIndex
							const showCorrect = showResult && isCorrect
							const showIncorrect = showResult && isSelected && !isCorrect
							
							return (
								<button
									key={index}
									type="button"
									onClick={() => !showResult && handleMCQAnswer(index)}
									disabled={showResult}
									className={`p-4 rounded-lg text-left font-medium transition-all ${
										showCorrect
											? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500 text-green-900 dark:text-green-100'
											: showIncorrect
											? 'bg-red-100 dark:bg-red-900/30 border-2 border-red-500 text-red-900 dark:text-red-100'
											: isSelected
											? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500 text-blue-900 dark:text-blue-100'
											: 'bg-white dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 hover:border-blue-400 dark:hover:border-blue-600'
									} ${!showResult ? 'cursor-pointer active:scale-95' : 'cursor-not-allowed'}`}
								>
									<div className="flex items-center gap-3">
										<span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
											showCorrect
												? 'bg-green-500 text-white'
												: showIncorrect
												? 'bg-red-500 text-white'
												: isSelected
												? 'bg-blue-500 text-white'
												: 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
										}`}>
											{String.fromCharCode(65 + index)}
										</span>
										<span>{choice}</span>
										{showCorrect && <span className="ml-auto text-green-600 dark:text-green-400">✓</span>}
										{showIncorrect && <span className="ml-auto text-red-600 dark:text-red-400">✗</span>}
									</div>
								</button>
							)
						})}
					</div>
				</div>
			) : (
				/* Spaced Repetition Mode */
				<div
					className="relative h-80 perspective-1000 mb-6"
					style={{ perspective: '1000px', minHeight: '320px' }}
				>
				<div
					className={`absolute inset-0 w-full h-full transition-transform duration-500 transform-style-3d ${
						isFlipped ? 'rotate-y-180' : ''
					}`}
					style={{
						transformStyle: 'preserve-3d',
						transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
					}}
				>
					{/* Front */}
					<div
						className="absolute inset-0 w-full h-full backface-hidden border-2 border-neutral-300 dark:border-neutral-600 rounded-xl p-8 bg-white dark:bg-neutral-900 flex items-center justify-center cursor-pointer shadow-lg"
						style={{ backfaceVisibility: 'hidden' }}
						onClick={handleFlip}
					>
						<div className="text-center space-y-6 w-full max-w-lg">
							<div className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide font-medium">
								{currentCard.category}
							</div>
							<div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 leading-relaxed px-4">
								{currentCard.front}
							</div>
							<div className="text-sm text-neutral-500 dark:text-neutral-400 mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
								Click card or button below to reveal answer
							</div>
						</div>
					</div>

					{/* Back */}
					<div
						className="absolute inset-0 w-full h-full backface-hidden border-2 border-blue-500 rounded-xl p-8 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shadow-lg"
						style={{
							backfaceVisibility: 'hidden',
							transform: 'rotateY(180deg)',
						}}
					>
						<div className="text-center space-y-6 w-full max-w-lg">
							<div className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide font-medium">
								Answer
							</div>
							<div className="text-lg text-neutral-900 dark:text-neutral-100 leading-relaxed px-4">
								{currentCard.back}
							</div>
							{progress && (
								<div className="text-xs text-neutral-500 dark:text-neutral-400 mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
									Next review: {nextReviewDate}
								</div>
							)}
						</div>
					</div>
				</div>
				</div>
			)}

			{/* Action Buttons - Only for Spaced Repetition */}
			{mode === 'spaced' && (
				<div className="space-y-4">
					{!isFlipped ? (
					<div className="text-center">
						<button
							type="button"
							onClick={handleFlip}
							className="px-8 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold text-base transition-colors cursor-pointer touch-manipulation active:scale-95 shadow-md"
						>
							Show Answer
						</button>
					</div>
				) : (
					<div className="space-y-4">
						<div className="text-base font-semibold text-center text-neutral-700 dark:text-neutral-300 mb-4">
							How well did you know this?
						</div>
						<div className="grid grid-cols-4 gap-3">
							<button
								type="button"
								onClick={() => handleRating(0)}
								className="px-4 py-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg font-semibold hover:bg-red-200 dark:hover:bg-red-900/50 active:scale-95 transition-all cursor-pointer touch-manipulation shadow-sm border-2 border-red-200 dark:border-red-800"
							>
								Again
							</button>
							<button
								type="button"
								onClick={() => handleRating(1)}
								className="px-4 py-4 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg font-semibold hover:bg-orange-200 dark:hover:bg-orange-900/50 active:scale-95 transition-all cursor-pointer touch-manipulation shadow-sm border-2 border-orange-200 dark:border-orange-800"
							>
								Hard
							</button>
							<button
								type="button"
								onClick={() => handleRating(2)}
								className="px-4 py-4 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 active:scale-95 transition-all cursor-pointer touch-manipulation shadow-sm border-2 border-blue-200 dark:border-blue-800"
							>
								Good
							</button>
							<button
								type="button"
								onClick={() => handleRating(3)}
								className="px-4 py-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg font-semibold hover:bg-green-200 dark:hover:bg-green-900/50 active:scale-95 transition-all cursor-pointer touch-manipulation shadow-sm border-2 border-green-200 dark:border-green-800"
							>
								Easy
							</button>
						</div>
					</div>
				)}
				</div>
			)}
		</div>
	)
}

export default Flashcards

