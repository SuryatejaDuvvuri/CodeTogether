import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { recordAnswer, getCurrentUserStats, calculateIndividualScore } from '../lib/stats.ts'
import type { UserStats } from '../lib/stats.ts'

type Question = {
	id: string
	prompt: string
	choices: string[]
	answerIndex: number
	hint?: string // For near-miss feedback
}

// Expanded question pool for longer sessions
const MOCK_QUESTIONS: Question[] = [
	{
		id: 'q1',
		prompt: 'What does const do in JavaScript?',
		choices: ['Defines a block-scoped constant', 'Defines a function', 'Declares a class', 'Imports a module'],
		answerIndex: 0,
		hint: 'const creates a variable that cannot be reassigned after declaration.',
	},
	{
		id: 'q2',
		prompt: 'Which array method creates a new array with elements that pass a test?',
		choices: ['map', 'forEach', 'filter', 'reduce'],
		answerIndex: 2,
		hint: 'This method filters elements based on a condition.',
	},
	{
		id: 'q3',
		prompt: 'What is the output of Boolean(0)?',
		choices: ['0', 'true', 'false', 'NaN'],
		answerIndex: 2,
		hint: 'In JavaScript, 0 is a falsy value.',
	},
	{
		id: 'q4',
		prompt: 'What does the spread operator (...) do?',
		choices: ['Expands iterables into individual elements', 'Creates a new object', 'Imports modules', 'Defines a class'],
		answerIndex: 0,
		hint: 'The spread operator expands arrays or objects into their elements.',
	},
	{
		id: 'q5',
		prompt: 'Which method returns the first element of an array?',
		choices: ['first()', 'get(0)', 'shift()', 'pop()'],
		answerIndex: 2,
		hint: 'shift() removes and returns the first element, but be careful—it modifies the array.',
	},
	{
		id: 'q6',
		prompt: 'What is a closure in JavaScript?',
		choices: ['A function that has access to outer scope variables', 'A way to import modules', 'A type of loop', 'A data structure'],
		answerIndex: 0,
		hint: 'Closures allow functions to access variables from their outer (enclosing) scope.',
	},
	{
		id: 'q7',
		prompt: 'What does === do compared to ==?',
		choices: ['Nothing, they are the same', 'Strict equality (no type coercion)', 'Loose equality (with type coercion)', 'Assignment operator'],
		answerIndex: 1,
		hint: '=== checks both value and type, while == only checks value after coercion.',
	},
	{
		id: 'q8',
		prompt: 'Which method creates a new array by transforming each element?',
		choices: ['forEach', 'map', 'filter', 'reduce'],
		answerIndex: 1,
		hint: 'map() transforms each element and returns a new array.',
	},
	{
		id: 'q9',
		prompt: 'What is the purpose of useCallback in React?',
		choices: ['To create state', 'To memoize functions', 'To handle events', 'To render components'],
		answerIndex: 1,
		hint: 'useCallback memoizes functions to prevent unnecessary re-renders.',
	},
	{
		id: 'q10',
		prompt: 'What does async/await do?',
		choices: ['Synchronous code execution', 'Asynchronous code that looks synchronous', 'Error handling', 'Module imports'],
		answerIndex: 1,
		hint: 'async/await makes asynchronous code easier to read and write.',
	},
	{
		id: 'q11',
		prompt: 'What is the difference between let and var?',
		choices: ['No difference', 'let is block-scoped, var is function-scoped', 'var is block-scoped, let is function-scoped', 'let is deprecated'],
		answerIndex: 1,
		hint: 'let has block scope, while var has function scope.',
	},
	{
		id: 'q12',
		prompt: 'What does the reduce method do?',
		choices: ['Filters elements', 'Transforms each element', 'Reduces array to a single value', 'Sorts the array'],
		answerIndex: 2,
		hint: 'reduce() accumulates values from an array into a single result.',
	},
	{
		id: 'q13',
		prompt: 'What is a promise in JavaScript?',
		choices: ['A synchronous operation', 'An object representing eventual completion/failure', 'A type of loop', 'A data structure'],
		answerIndex: 1,
		hint: 'Promises represent the eventual result of an asynchronous operation.',
	},
	{
		id: 'q14',
		prompt: 'What does destructuring do?',
		choices: ['Creates new variables', 'Extracts values from arrays/objects', 'Imports modules', 'Defines functions'],
		answerIndex: 1,
		hint: 'Destructuring extracts values from arrays or properties from objects.',
	},
	{
		id: 'q15',
		prompt: 'What is the purpose of useEffect in React?',
		choices: ['To create state', 'To handle side effects', 'To render components', 'To define props'],
		answerIndex: 1,
		hint: 'useEffect handles side effects like API calls, subscriptions, or DOM manipulation.',
	},
	{
		id: 'q16',
		prompt: 'What does the rest parameter (...) do?',
		choices: ['Spreads arrays', 'Collects remaining arguments into an array', 'Imports modules', 'Creates objects'],
		answerIndex: 1,
		hint: 'The rest parameter collects remaining function arguments into an array.',
	},
	{
		id: 'q17',
		prompt: 'What is the difference between null and undefined?',
		choices: ['No difference', 'null is assigned, undefined is default', 'undefined is assigned, null is default', 'Both are the same'],
		answerIndex: 1,
		hint: 'null is an intentional absence of value, undefined means a variable has not been assigned.',
	},
	{
		id: 'q18',
		prompt: 'What does the bind method do?',
		choices: ['Creates a new function with bound this', 'Filters arrays', 'Sorts arrays', 'Transforms arrays'],
		answerIndex: 0,
		hint: 'bind() creates a new function with a fixed this context.',
	},
	{
		id: 'q19',
		prompt: 'What is the event loop in JavaScript?',
		choices: ['A type of loop', 'The mechanism that handles asynchronous operations', 'A data structure', 'A function'],
		answerIndex: 1,
		hint: 'The event loop manages asynchronous operations and callbacks.',
	},
	{
		id: 'q20',
		prompt: 'What does the slice method do?',
		choices: ['Modifies the array', 'Returns a shallow copy of a portion of an array', 'Sorts the array', 'Filters the array'],
		answerIndex: 1,
		hint: 'slice() returns a new array with selected elements, without modifying the original.',
	},
	{
		id: 'q21',
		prompt: 'What is a higher-order function?',
		choices: ['A function that takes other functions as arguments', 'A function with high complexity', 'A function that returns numbers', 'A built-in function'],
		answerIndex: 0,
		hint: 'Higher-order functions take functions as arguments or return functions.',
	},
	{
		id: 'q22',
		prompt: 'What does the splice method do?',
		choices: ['Returns a copy', 'Modifies array by adding/removing elements', 'Filters elements', 'Sorts elements'],
		answerIndex: 1,
		hint: 'splice() modifies the array by adding or removing elements at a specific index.',
	},
	{
		id: 'q23',
		prompt: 'What is the purpose of useMemo in React?',
		choices: ['To create state', 'To memoize computed values', 'To handle events', 'To render components'],
		answerIndex: 1,
		hint: 'useMemo memoizes expensive computations to avoid recalculating on every render.',
	},
	{
		id: 'q24',
		prompt: 'What does the find method do?',
		choices: ['Returns all matching elements', 'Returns the first element that passes a test', 'Filters the array', 'Sorts the array'],
		answerIndex: 1,
		hint: 'find() returns the first element that satisfies the provided testing function.',
	},
	{
		id: 'q25',
		prompt: 'What is the difference between arrow functions and regular functions?',
		choices: ['No difference', 'Arrow functions have no this binding', 'Regular functions have no this binding', 'Arrow functions are slower'],
		answerIndex: 1,
		hint: 'Arrow functions do not have their own this context; they inherit it from the enclosing scope.',
	},
	{
		id: 'q26',
		prompt: 'What does the some method do?',
		choices: ['Returns all elements', 'Tests if at least one element passes', 'Filters elements', 'Transforms elements'],
		answerIndex: 1,
		hint: 'some() returns true if at least one element passes the test.',
	},
	{
		id: 'q27',
		prompt: 'What is the purpose of useState in React?',
		choices: ['To handle effects', 'To manage component state', 'To render components', 'To define props'],
		answerIndex: 1,
		hint: 'useState is a hook that adds state management to functional components.',
	},
	{
		id: 'q28',
		prompt: 'What does the every method do?',
		choices: ['Returns all elements', 'Tests if all elements pass', 'Filters elements', 'Transforms elements'],
		answerIndex: 1,
		hint: 'every() returns true if all elements pass the test.',
	},
	{
		id: 'q29',
		prompt: 'What is a pure function?',
		choices: ['A function with no parameters', 'A function that always returns the same output for the same input', 'A function that modifies global state', 'A built-in function'],
		answerIndex: 1,
		hint: 'Pure functions have no side effects and always return the same output for the same input.',
	},
	{
		id: 'q30',
		prompt: 'What does the includes method do?',
		choices: ['Filters elements', 'Checks if an array contains a value', 'Transforms elements', 'Sorts elements'],
		answerIndex: 1,
		hint: 'includes() returns true if the array contains the specified value.',
	},
]

type Toast = {
	id: string
	message: string
	type: 'success' | 'info' | 'milestone'
}

type SessionState = 'setup' | 'running' | 'completed'

function Speedrun() {
	// Session setup state
	const [sessionState, setSessionState] = useState<SessionState>('setup')
	const [sessionLength, setSessionLength] = useState(20)
	const [showQuitConfirm, setShowQuitConfirm] = useState(false)

	// Session tracking state
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
	const [questionsAnswered, setQuestionsAnswered] = useState(0)
	const [correctAnswersThisSession, setCorrectAnswersThisSession] = useState(0)
	const [currentStreak, setCurrentStreak] = useState(0)
	const [bestStreakThisSession, setBestStreakThisSession] = useState(0)
	const [startTime, setStartTime] = useState<number | null>(null)
	const [elapsedTime, setElapsedTime] = useState(0)

	// Question state
	const [timeLeft, setTimeLeft] = useState(5)
	const [selected, setSelected] = useState<number | null>(null)
	const [locked, setLocked] = useState(false)
	const [streakBroken, setStreakBroken] = useState(false)

	// Toast notifications
	const [toasts, setToasts] = useState<Toast[]>([])
	const toastIdCounter = useRef(0)

	// Personal stats for comparison
	const [personalStats, setPersonalStats] = useState<UserStats | null>(null)
	const [leaderboardScore, setLeaderboardScore] = useState<number | null>(null)

	// Get shuffled questions for this session
	const sessionQuestions = useMemo(() => {
		const shuffled = [...MOCK_QUESTIONS].sort(() => Math.random() - 0.5)
		return shuffled.slice(0, sessionLength)
	}, [sessionLength])

	const currentQuestion = sessionQuestions[currentQuestionIndex]

	// Load personal stats
	useEffect(() => {
		const stats = getCurrentUserStats()
		setPersonalStats(stats)
		const score = calculateIndividualScore(stats)
		setLeaderboardScore(score)
	}, [])

	// Track elapsed time
	useEffect(() => {
		if (sessionState !== 'running' || !startTime) return
		const interval = setInterval(() => {
			setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
		}, 1000)
		return () => clearInterval(interval)
	}, [sessionState, startTime])

	// Question timer
	useEffect(() => {
		if (sessionState !== 'running' || locked) return
		setTimeLeft(5)
		const id = setInterval(() => {
			setTimeLeft((t) => {
				if (t <= 1) {
					clearInterval(id)
					setLocked(true)
					return 0
				}
				return t - 1
			})
		}, 1000)
		return () => clearInterval(id)
	}, [currentQuestionIndex, locked, sessionState])

	// Auto-remove toasts after 3 seconds
	useEffect(() => {
		if (toasts.length === 0) return
		const timer = setTimeout(() => {
			setToasts((prev) => prev.slice(1))
		}, 3000)
		return () => clearTimeout(timer)
	}, [toasts])

	// Show toast notification
	const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
		const id = `toast-${toastIdCounter.current++}`
		setToasts((prev) => [...prev, { id, message, type }])
	}, [])

	// Handle answer submission
	const handleAnswer = async (i: number) => {
		if (locked || sessionState !== 'running') return
		setSelected(i)
		setLocked(true)
		const isCorrect = i === currentQuestion.answerIndex

		let newStreak = currentStreak
		if (isCorrect) {
			newStreak = currentStreak + 1
			setCurrentStreak(newStreak)
			setBestStreakThisSession((prev) => Math.max(prev, newStreak))
			setCorrectAnswersThisSession((prev) => prev + 1)

			// Variable rewards - milestone toasts
			if (newStreak === 3) {
				showToast('🔥 3-streak! Keep it going!', 'milestone')
			} else if (newStreak === 5) {
				showToast('🔥🔥 5-streak! You\'re on fire!', 'milestone')
			} else if (newStreak === 10) {
				showToast('🔥🔥🔥 10-STREAK! Incredible!', 'milestone')
			} else if (newStreak === 15) {
				showToast('🔥🔥🔥🔥 15-STREAK! Legendary!', 'milestone')
			}
		} else {
			// Loss aversion - streak break feedback
			if (currentStreak > 0) {
				setStreakBroken(true)
				setTimeout(() => setStreakBroken(false), 2000)
				if (currentStreak >= 3) {
					showToast(`Your streak broke at ${currentStreak}. You were ${bestStreakThisSession - currentStreak} away from your best (${bestStreakThisSession}). Try again!`, 'info')
				}
			}
			setCurrentStreak(0)
			newStreak = 0
		}

		setQuestionsAnswered((prev) => prev + 1)

		// Record answer for stats
		await recordAnswer(isCorrect, newStreak)

		// Progress milestone toasts
		const totalAnswered = questionsAnswered + 1
		if (totalAnswered % 10 === 0) {
			showToast(`+${totalAnswered} completed! Keep pushing!`, 'milestone')
		}
	}

	// Move to next question
	const next = () => {
		if (sessionState !== 'running') return

		// Check if session is complete
		if (questionsAnswered >= sessionLength) {
			setSessionState('completed')
			return
		}

		setSelected(null)
		setLocked(false)
		setCurrentQuestionIndex((prev) => (prev + 1) % sessionQuestions.length)
	}

	// Start session
	const startSession = () => {
		setSessionState('running')
		setStartTime(Date.now())
		setCurrentQuestionIndex(0)
		setQuestionsAnswered(0)
		setCorrectAnswersThisSession(0)
		setCurrentStreak(0)
		setBestStreakThisSession(0)
		setElapsedTime(0)
		setSelected(null)
		setLocked(false)
	}

	// Reset session
	const resetSession = () => {
		setSessionState('setup')
		setShowQuitConfirm(false)
		setCurrentQuestionIndex(0)
		setQuestionsAnswered(0)
		setCorrectAnswersThisSession(0)
		setCurrentStreak(0)
		setBestStreakThisSession(0)
		setStartTime(null)
		setElapsedTime(0)
		setSelected(null)
		setLocked(false)
	}

	// Calculate progress percentage
	const progress = useMemo(() => {
		if (sessionState === 'setup') return 0
		return (questionsAnswered / sessionLength) * 100
	}, [questionsAnswered, sessionLength, sessionState])

	// Calculate session accuracy
	const sessionAccuracy = useMemo(() => {
		if (questionsAnswered === 0) return 0
		return Math.round((correctAnswersThisSession / questionsAnswered) * 100)
	}, [correctAnswersThisSession, questionsAnswered])

	// Format time
	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60)
		const secs = seconds % 60
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}

	// Session Setup Screen (Commitment Device)
	if (sessionState === 'setup') {
		return (
			<div className="mx-auto max-w-2xl p-6 space-y-6">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-bold">Flashcard Speedrun</h1>
					<p className="text-neutral-600 dark:text-neutral-400">
						Test your knowledge with AI-generated MCQs. Build streaks, beat your best, and climb the leaderboard!
					</p>
				</div>

				<div className="border rounded-lg p-6 space-y-4 bg-white dark:bg-neutral-900">
					<div>
						<label className="block text-sm font-medium mb-3">Choose Session Length</label>
						<div className="grid grid-cols-3 gap-3">
							{[10, 20, 30].map((length) => (
								<button
									key={length}
									type="button"
									onClick={() => setSessionLength(length)}
									className={`px-4 py-3 border-2 rounded-lg font-medium transition-all touch-manipulation active:scale-95 ${
										sessionLength === length
											? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
											: 'border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800'
									}`}
								>
									{length} Questions
								</button>
							))}
						</div>
					</div>

					<div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
						<p className="text-sm text-blue-900 dark:text-blue-200">
							<strong>You're starting a {sessionLength}-question Speedrun.</strong>
							<br />
							Average time: ~{Math.round(sessionLength * 0.4)} minutes.
						</p>
					</div>

					{personalStats && (
						<div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg space-y-2 text-sm">
							<p className="font-medium">Your Current Stats:</p>
							<div className="grid grid-cols-2 gap-2">
								<div>Best Streak: <span className="font-semibold">{personalStats.streak}</span></div>
								<div>Accuracy: <span className="font-semibold">{personalStats.accuracy}%</span></div>
								<div>Total Questions: <span className="font-semibold">{personalStats.totalQuestions}</span></div>
								<div>Overall Score: <span className="font-semibold">{leaderboardScore?.toFixed(1) || '0'}</span></div>
							</div>
						</div>
					)}

					<button
						type="button"
						onClick={startSession}
						className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold text-lg transition-colors cursor-pointer touch-manipulation active:scale-95 shadow-lg"
					>
						Start Speedrun
					</button>
				</div>
			</div>
		)
	}

	// End-of-Run Summary Modal
	if (sessionState === 'completed') {
		const timeSpent = formatTime(elapsedTime)
		const newBestStreak = bestStreakThisSession > (personalStats?.streak || 0)
		const streakDiff = (personalStats?.streak || 0) - bestStreakThisSession

		return (
			<div className="mx-auto max-w-2xl p-6 space-y-6">
				<div className="border rounded-lg p-6 bg-white dark:bg-neutral-900 space-y-6">
					<div className="text-center space-y-2">
						<h1 className="text-3xl font-bold">Session Complete! 🎉</h1>
						<p className="text-neutral-600 dark:text-neutral-400">Great work! Here's how you did:</p>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-center">
							<div className="text-2xl font-bold">{questionsAnswered}</div>
							<div className="text-sm text-neutral-600 dark:text-neutral-400">Questions Answered</div>
						</div>
						<div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-center">
							<div className="text-2xl font-bold">{correctAnswersThisSession}</div>
							<div className="text-sm text-neutral-600 dark:text-neutral-400">Correct Answers</div>
						</div>
						<div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-center">
							<div className="text-2xl font-bold">{sessionAccuracy}%</div>
							<div className="text-sm text-neutral-600 dark:text-neutral-400">Session Accuracy</div>
						</div>
						<div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg text-center">
							<div className="text-2xl font-bold">{bestStreakThisSession}</div>
							<div className="text-sm text-neutral-600 dark:text-neutral-400">Best Streak</div>
						</div>
					</div>

					<div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
						<div className="text-sm space-y-1">
							<div><strong>Time Spent:</strong> {timeSpent}</div>
							{newBestStreak ? (
								<div className="text-green-700 dark:text-green-400 font-semibold">
									🔥 New personal best streak! You beat your previous record of {personalStats?.streak || 0}!
								</div>
							) : streakDiff > 0 && streakDiff <= 3 ? (
								<div className="text-orange-700 dark:text-orange-400">
									You were {streakDiff} question{streakDiff > 1 ? 's' : ''} away from beating your best streak of {personalStats?.streak || 0}. So close!
								</div>
							) : personalStats && bestStreakThisSession > 0 ? (
								<div className="text-neutral-700 dark:text-neutral-300">
									Your best streak this run was {bestStreakThisSession}. Your all-time best is {personalStats.streak}.
								</div>
							) : null}
						</div>
					</div>

					{leaderboardScore !== null && (
						<div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 text-center">
							<div className="text-sm">
								<strong>Your overall leaderboard score:</strong> {leaderboardScore.toFixed(1)}
							</div>
							<div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
								Keep playing to improve your ranking!
							</div>
						</div>
					)}

					<div className="flex gap-3">
						<button
							type="button"
							onClick={startSession}
							className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold transition-colors cursor-pointer touch-manipulation active:scale-95 shadow-lg"
						>
							Run Again
						</button>
						<button
							type="button"
							onClick={resetSession}
							className="flex-1 px-6 py-3 border-2 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg font-semibold transition-colors cursor-pointer touch-manipulation active:scale-95"
						>
							Choose Another Topic
						</button>
					</div>
				</div>
			</div>
		)
	}

	// Main game screen
	const progressColor = progress >= 75 ? 'bg-green-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-blue-500'
	const isNearEnd = progress >= 75

	return (
		<div className="mx-auto max-w-2xl p-6 space-y-4 relative">
			{/* Toast Notifications */}
			<div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 space-y-2 pointer-events-none">
				{toasts.map((toast) => (
					<div
						key={toast.id}
						className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 pointer-events-auto ${
							toast.type === 'milestone'
								? 'bg-yellow-500 text-yellow-900'
								: toast.type === 'success'
								? 'bg-green-500 text-green-900'
								: 'bg-blue-500 text-blue-900'
						}`}
					>
						{toast.message}
					</div>
				))}
			</div>

			{/* Quit Confirmation Dialog */}
			{showQuitConfirm && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-white dark:bg-neutral-900 rounded-lg p-6 max-w-md mx-4 space-y-4 shadow-xl">
						<h3 className="text-lg font-semibold">Quit Speedrun?</h3>
						<p className="text-sm text-neutral-600 dark:text-neutral-400">
							You've completed {questionsAnswered}/{sessionLength} questions. Are you sure you want to stop?
						</p>
						<div className="flex gap-3">
							<button
								type="button"
								onClick={() => setShowQuitConfirm(false)}
								className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors cursor-pointer touch-manipulation active:scale-95"
							>
								Keep Going
							</button>
							<button
								type="button"
								onClick={() => {
									setShowQuitConfirm(false)
									resetSession()
								}}
								className="flex-1 px-4 py-2 border-2 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg font-medium transition-colors cursor-pointer touch-manipulation active:scale-95"
							>
								Quit
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={() => setShowQuitConfirm(true)}
						className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 px-3 py-1.5 border rounded-md transition-colors cursor-pointer touch-manipulation"
					>
						← Quit
					</button>
					<h1 className="text-xl font-semibold">Flashcard Speedrun</h1>
				</div>
				<div className="text-sm">
					Time: <span className="font-mono font-semibold">{formatTime(elapsedTime)}</span>
				</div>
			</div>

			{/* Streak Momentum Bar (Loss Aversion) */}
			<div className="space-y-2">
				<div className="flex items-center justify-between text-sm">
					<div className="flex items-center gap-2">
						<span className="font-semibold">🔥 Streak: {currentStreak}</span>
						{bestStreakThisSession > 0 && (
							<span className="text-neutral-600 dark:text-neutral-400">
								(Best this run: {bestStreakThisSession})
							</span>
						)}
					</div>
					<div className="text-neutral-600 dark:text-neutral-400">
						{questionsAnswered} / {sessionLength} questions
					</div>
				</div>
				{streakBroken && (
					<div className="p-2 bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded text-sm text-orange-800 dark:text-orange-200 animate-pulse">
						Your streak broke at {currentStreak}. You were {bestStreakThisSession - currentStreak} away from your best ({bestStreakThisSession}). Try again!
					</div>
				)}
			</div>

			{/* Goal-Gradient Progress Bar */}
			<div className="space-y-2">
				<div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
					<div
						className={`h-3 ${progressColor} rounded-full transition-all duration-300`}
						style={{ width: `${progress}%` }}
					/>
				</div>
				<div className="flex items-center justify-between text-xs">
					<span>Progress: {questionsAnswered} / {sessionLength}</span>
					{isNearEnd && (
						<span className="text-green-600 dark:text-green-400 font-semibold animate-pulse">
							Almost there — finish strong! 💪
						</span>
					)}
				</div>
			</div>

			{/* Question Card */}
			<div className="border rounded-lg p-4 bg-white dark:bg-neutral-900">
				<p className="font-medium mb-3 text-lg">{currentQuestion.prompt}</p>

				{/* Feedback Message */}
				{locked && selected !== null && (
					<div className={`mb-3 p-3 rounded-md border-2 ${
						selected === currentQuestion.answerIndex
							? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-900 dark:text-green-100'
							: 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-900 dark:text-red-100'
					}`}>
						<p className="font-semibold text-sm mb-1">
							{selected === currentQuestion.answerIndex ? (
								<span>✓ Correct! Great job!</span>
							) : (
								<span>✗ Incorrect. The correct answer is: <span className="font-bold">{currentQuestion.choices[currentQuestion.answerIndex]}</span></span>
							)}
						</p>
						{/* Near-Miss Feedback */}
						{selected !== currentQuestion.answerIndex && currentQuestion.hint && (
							<p className="text-xs mt-1 opacity-90">
								💡 {currentQuestion.hint}
							</p>
						)}
						{selected !== currentQuestion.answerIndex && !currentQuestion.hint && (
							<p className="text-xs mt-1 opacity-90">
								Close! Many confuse these. Keep practicing!
							</p>
						)}
					</div>
				)}

				{/* Answer Choices */}
				<div className="grid gap-2">
					{currentQuestion.choices.map((c, i) => {
						const isCorrect = locked && i === currentQuestion.answerIndex
						const isWrong = locked && selected === i && i !== currentQuestion.answerIndex
						return (
							<button
								key={i}
								type="button"
								disabled={locked}
								onClick={() => handleAnswer(i)}
								className={`text-left border-2 rounded-md px-3 py-2.5 transition-all touch-manipulation cursor-pointer active:scale-95 relative ${
									locked ? 'cursor-not-allowed' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'
								} ${
									isCorrect 
										? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-100' 
										: isWrong 
										? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-900 dark:text-red-100' 
										: locked 
										? 'opacity-50 border-neutral-300 dark:border-neutral-600' 
										: 'border-neutral-300 dark:border-neutral-600'
								}`}
							>
								<div className="flex items-center justify-between gap-2">
									<span>{c}</span>
									{locked && (
										<span className="text-lg font-bold flex-shrink-0">
											{isCorrect ? '✓' : isWrong ? '✗' : ''}
										</span>
									)}
								</div>
							</button>
						)
					})}
				</div>

				{/* Question Footer */}
				<div className="mt-4 flex items-center justify-between text-sm">
					<div>
						Time left: <span className="font-mono font-semibold">{timeLeft}s</span>
					</div>
					{locked && (
						<button 
							type="button"
							onClick={next} 
							className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md font-medium transition-colors cursor-pointer touch-manipulation active:scale-95"
						>
							{questionsAnswered >= sessionLength ? 'View Results' : 'Next Question →'}
						</button>
					)}
				</div>
			</div>
		</div>
	)
}

export default Speedrun
