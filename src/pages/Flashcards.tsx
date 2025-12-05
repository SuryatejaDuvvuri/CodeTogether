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
	// ===== C++ FUNDAMENTALS =====
	{
		id: 'cpp1',
		front: 'What is the difference between #include <iostream> and #include "myfile.h"?',
		back: 'Angle brackets < > search in system/standard library directories first. Quotes " " search in the current directory first, then system directories. Use < > for standard library, " " for your own headers.',
		category: 'C++ Basics',
		difficulty: 'easy',
	},
	{
		id: 'cpp2',
		front: 'What does "using namespace std;" do and why might you avoid it?',
		back: 'It allows you to use names from the std namespace without the std:: prefix (like cout instead of std::cout). Avoid it in headers to prevent namespace pollution and potential naming conflicts.',
		category: 'C++ Basics',
		difficulty: 'medium',
	},
	{
		id: 'cpp3',
		front: 'What is the difference between cin >> and getline()?',
		back: 'cin >> stops reading at whitespace (spaces, tabs, newlines). getline() reads the entire line including spaces until it hits a newline. Use getline() when you need to read strings with spaces.',
		category: 'C++ Basics',
		difficulty: 'easy',
	},
	{
		id: 'cpp4',
		front: 'What is a segmentation fault (segfault)?',
		back: 'A segmentation fault occurs when a program tries to access memory it doesn\'t have permission to access. Common causes: dereferencing null/uninitialized pointers, array out-of-bounds access, stack overflow.',
		category: 'C++ Debugging',
		difficulty: 'medium',
	},
	{
		id: 'cpp5',
		front: 'What is the difference between passing by value, by reference, and by pointer?',
		back: 'By value: copies the argument (changes don\'t affect original). By reference (&): alias to original (changes affect original, no copy). By pointer (*): passes memory address (changes affect original, can be null).',
		category: 'C++ Functions',
		difficulty: 'medium',
	},
	// ===== POINTERS & MEMORY =====
	{
		id: 'cpp6',
		front: 'What does int* ptr = nullptr; mean?',
		back: 'Declares a pointer to an integer and initializes it to nullptr (null pointer). nullptr is the C++11 way to represent a pointer that points to nothing. Always initialize pointers!',
		category: 'Pointers',
		difficulty: 'easy',
	},
	{
		id: 'cpp7',
		front: 'What is the difference between *ptr and &var?',
		back: '* (dereference) gets the value at the address the pointer points to. & (address-of) gets the memory address of a variable. *ptr reads/writes value, &var gets location.',
		category: 'Pointers',
		difficulty: 'medium',
	},
	{
		id: 'cpp8',
		front: 'What is a memory leak and how do you prevent it?',
		back: 'A memory leak occurs when dynamically allocated memory (new) is never freed (delete). Prevent by: always pairing new with delete, using smart pointers (unique_ptr, shared_ptr), or RAII pattern.',
		category: 'Memory Management',
		difficulty: 'hard',
	},
	{
		id: 'cpp9',
		front: 'What is the difference between stack and heap memory?',
		back: 'Stack: automatic, fast, limited size, LIFO order, for local variables. Heap: manual (new/delete), slower, larger, for dynamic allocation. Stack memory is freed automatically when scope ends.',
		category: 'Memory Management',
		difficulty: 'hard',
	},
	{
		id: 'cpp10',
		front: 'What happens if you delete a pointer twice?',
		back: 'Undefined behavior! Double delete can crash your program or corrupt memory. After delete, set pointer to nullptr. Deleting nullptr is safe and does nothing.',
		category: 'Memory Management',
		difficulty: 'medium',
	},
	// ===== ARRAYS & VECTORS =====
	{
		id: 'cpp11',
		front: 'What is the difference between a C-style array and std::vector?',
		back: 'C-style array: fixed size, no bounds checking, decays to pointer. vector: dynamic size, bounds checking with .at(), knows its size with .size(), safer and more flexible.',
		category: 'Data Structures',
		difficulty: 'easy',
	},
	{
		id: 'cpp12',
		front: 'What does vector.push_back() do vs vector.emplace_back()?',
		back: 'push_back() copies/moves an existing object into the vector. emplace_back() constructs the object in-place inside the vector (more efficient, avoids copy). Prefer emplace_back() for complex objects.',
		category: 'Data Structures',
		difficulty: 'medium',
	},
	{
		id: 'cpp13',
		front: 'What is array index out of bounds? Why doesn\'t C++ catch it?',
		back: 'Accessing an index outside the valid range (0 to size-1). C++ doesn\'t check bounds for performance. This causes undefined behavior - might crash, return garbage, or seem to work. Use .at() for checked access.',
		category: 'Data Structures',
		difficulty: 'easy',
	},
	// ===== LOOPS & CONTROL FLOW =====
	{
		id: 'cpp14',
		front: 'What is an infinite loop and how do you avoid it?',
		back: 'A loop that never terminates because its condition never becomes false. Avoid by: ensuring loop variable changes, having a reachable exit condition, using break correctly. Common cause: forgetting to increment counter.',
		category: 'Control Flow',
		difficulty: 'easy',
	},
	{
		id: 'cpp15',
		front: 'What is the difference between break and continue?',
		back: 'break: exits the loop entirely, execution continues after the loop. continue: skips the rest of the current iteration and jumps to the next iteration. Both only affect the innermost loop.',
		category: 'Control Flow',
		difficulty: 'easy',
	},
	{
		id: 'cpp16',
		front: 'What is a range-based for loop? Give an example.',
		back: 'for (auto x : container) - iterates over each element in a container. Cleaner than index-based loops. Use "auto& x" to modify elements, "const auto& x" for read-only to avoid copies.',
		category: 'Control Flow',
		difficulty: 'medium',
	},
	// ===== CLASSES & OOP =====
	{
		id: 'cpp17',
		front: 'What is the difference between public, private, and protected?',
		back: 'public: accessible from anywhere. private: only accessible within the class. protected: accessible within the class and derived classes. Default is private for class, public for struct.',
		category: 'OOP',
		difficulty: 'medium',
	},
	{
		id: 'cpp18',
		front: 'What is a constructor and when is it called?',
		back: 'A special member function that initializes an object when it\'s created. Same name as the class, no return type. Called automatically when you declare an object: MyClass obj; or MyClass* ptr = new MyClass();',
		category: 'OOP',
		difficulty: 'easy',
	},
	{
		id: 'cpp19',
		front: 'What is a destructor and when is it called?',
		back: 'A special member function (~ClassName) that cleans up when an object is destroyed. Called automatically when object goes out of scope or delete is used. Use to free dynamic memory, close files, etc.',
		category: 'OOP',
		difficulty: 'medium',
	},
	{
		id: 'cpp20',
		front: 'What is the "this" pointer?',
		back: '"this" is an implicit pointer available in non-static member functions that points to the current object. Used to: disambiguate members from parameters, return *this for chaining, pass object to other functions.',
		category: 'OOP',
		difficulty: 'medium',
	},
	// ===== COMMON ERRORS =====
	{
		id: 'cpp21',
		front: 'What is the difference between = and == in C++?',
		back: '= is assignment (sets a value). == is comparison (checks equality). Common bug: if (x = 5) assigns 5 to x and is always true! Use if (x == 5) to compare. Some put constant first: if (5 == x).',
		category: 'Common Errors',
		difficulty: 'easy',
	},
	{
		id: 'cpp22',
		front: 'What is an off-by-one error?',
		back: 'An error where a loop runs one too many or one too few times. Common causes: using <= instead of <, starting at 1 instead of 0, forgetting arrays are 0-indexed. Very common in loops and array access.',
		category: 'Common Errors',
		difficulty: 'easy',
	},
	{
		id: 'cpp23',
		front: 'What is integer overflow and when does it happen?',
		back: 'When a calculation exceeds the maximum value a type can hold. int max is ~2.1 billion. Overflow wraps around (can become negative!). Use long long for large numbers, or check before operations.',
		category: 'Common Errors',
		difficulty: 'medium',
	},
	{
		id: 'cpp24',
		front: 'Why does cout << "Hello" not print anything?',
		back: 'Output is often buffered. It might not appear until: endl or "\\n" is used, cout.flush() is called, or the program ends. Also check: is there a return before the cout? Is the code path reachable?',
		category: 'Common Errors',
		difficulty: 'easy',
	},
	// ===== RECURSION =====
	{
		id: 'cpp25',
		front: 'What are the two essential parts of a recursive function?',
		back: '1) Base case: the condition that stops recursion (prevents infinite recursion). 2) Recursive case: the function calls itself with a "smaller" problem. Missing base case = stack overflow!',
		category: 'Recursion',
		difficulty: 'medium',
	},
	{
		id: 'cpp26',
		front: 'What is a stack overflow in the context of recursion?',
		back: 'When too many recursive calls fill up the call stack memory. Caused by: missing/unreachable base case, recursion depth too deep. Each call uses stack space for variables and return address.',
		category: 'Recursion',
		difficulty: 'medium',
	},
	// ===== FILL IN THE BLANK STYLE =====
	{
		id: 'cpp27',
		front: 'Fill in the blank: To read a full line with spaces, use _____(cin, str) instead of cin >> str',
		back: 'getline(cin, str) - getline reads the entire line including spaces until it encounters a newline character.',
		category: 'Fill in the Blank',
		difficulty: 'easy',
	},
	{
		id: 'cpp28',
		front: 'Fill in the blank: To get the size of a vector v, use v._____() ',
		back: 'v.size() - returns the number of elements in the vector. Note: returns size_t (unsigned), be careful comparing with negative numbers!',
		category: 'Fill in the Blank',
		difficulty: 'easy',
	},
	{
		id: 'cpp29',
		front: 'Fill in the blank: To add an element to the end of vector v, use v._____back(element)',
		back: 'v.push_back(element) - adds element to the end of the vector and increases its size by 1. For better performance with objects, consider emplace_back().',
		category: 'Fill in the Blank',
		difficulty: 'easy',
	},
	{
		id: 'cpp30',
		front: 'Fill in the blank: In the function void swap(int& a, int& b), the & means pass by _____',
		back: 'reference - The & symbol after the type means the parameter is a reference. Changes to a and b inside the function will affect the original variables.',
		category: 'Fill in the Blank',
		difficulty: 'medium',
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

// Convert flashcards to MCQ format with plausible distractors
function createMCQCard(card: Flashcard): Flashcard {
	// C++ specific distractors based on category
	const distractorsByCategory: Record<string, string[]> = {
		'C++ Basics': [
			'This is handled automatically by the compiler with no difference',
			'Both options are equivalent and interchangeable',
			'This only applies to C, not C++',
			'The order of operations is reversed in modern compilers',
		],
		'Pointers': [
			'The pointer is automatically freed when the function returns',
			'Both operators do the same thing in different contexts',
			'Pointers in C++ are always initialized to 0',
			'The & operator creates a new copy of the variable',
		],
		'Memory Management': [
			'C++ automatically manages all memory through garbage collection',
			'Stack and heap memory are the same, just different names',
			'Memory is always freed when variables go out of scope',
			'Using new is optional since malloc still works the same way',
		],
		'Data Structures': [
			'Both are exactly the same, vector is just an alias for array',
			'Arrays in C++ automatically resize when needed',
			'Vectors are slower than arrays and should be avoided',
			'The size is always known at compile time for both',
		],
		'Control Flow': [
			'Both keywords do the same thing in loops',
			'These only work in while loops, not for loops',
			'The loop must complete all iterations before these apply',
			'This is deprecated in C++11 and later versions',
		],
		'OOP': [
			'All members are public by default in both class and struct',
			'Private members can be accessed using the dot operator',
			'The constructor must always be called manually',
			'Destructors are only needed for virtual classes',
		],
		'Common Errors': [
			'C++ automatically catches and fixes this error at runtime',
			'Modern compilers prevent this from ever happening',
			'This only occurs in debug mode, not release builds',
			'The behavior is well-defined and consistent across all platforms',
		],
		'Recursion': [
			'Recursion always runs faster than iteration',
			'The base case is optional for simple recursive functions',
			'Stack space is unlimited for recursive calls',
			'Recursive functions cannot return values',
		],
		'Fill in the Blank': [
			'get()', 
			'read()',
			'input()',
			'scan()',
		],
	}
	
	// Get category-specific distractors or use generic ones
	const categoryDistractors = distractorsByCategory[card.category] || [
		'This feature was removed in C++17',
		'The compiler handles this automatically',
		'This only applies to certain data types',
		'No special handling is required',
	]
	
	// Pick 3 random distractors
	const shuffledDistractors = [...categoryDistractors].sort(() => Math.random() - 0.5).slice(0, 3)
	
	// Create shorter answer for MCQ (first sentence or key phrase of the back)
	const shortAnswer = card.back.split('.')[0] + '.'
	
	const choices = [
		shortAnswer, // Correct answer (shortened)
		...shuffledDistractors,
	]
	
	// Shuffle choices
	const shuffled = [...choices].sort(() => Math.random() - 0.5)
	const correctIndex = shuffled.indexOf(shortAnswer)
	
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

