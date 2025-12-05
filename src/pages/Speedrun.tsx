import { useEffect, useMemo, useState, useRef } from 'react'
import { recordAnswer, getCurrentUserStats } from '../lib/stats.ts'
import { playSuccess, playFail, playStreak, playWarning } from '../lib/sounds.ts'

type Question = {
	id: string
	prompt: string
	choices: string[]
	answerIndex: number
	hint?: string // Optional hint for near-miss feedback
}

// C++ focused question bank for CS fundamentals classes
const MOCK_QUESTIONS: Question[] = [
	{
		id: 'q1',
		prompt: 'What is the correct way to declare a constant in C++?',
		choices: ['const int x = 5;', 'constant int x = 5;', 'int const x = 5;', 'Both A and C'],
		answerIndex: 3,
		hint: 'In C++, both "const int" and "int const" are valid ways to declare a constant.',
	},
	{
		id: 'q2',
		prompt: 'Which header file is needed for cout and cin?',
		choices: ['<stdio.h>', '<iostream>', '<conio.h>', '<string>'],
		answerIndex: 1,
		hint: 'iostream provides input/output stream objects like cout and cin.',
	},
	{
		id: 'q3',
		prompt: 'What is the output of: cout << 5/2;',
		choices: ['2.5', '2', '3', '2.0'],
		answerIndex: 1,
		hint: 'Integer division in C++ truncates the decimal part.',
	},
	{
		id: 'q4',
		prompt: 'Which operator is used to access members of a pointer to an object?',
		choices: ['.', '->', '::', '*'],
		answerIndex: 1,
		hint: 'The arrow operator (->) is used to access members through a pointer.',
	},
	{
		id: 'q5',
		prompt: 'What does the & operator do when used in a variable declaration?',
		choices: ['Bitwise AND', 'Address of', 'Creates a reference', 'Logical AND'],
		answerIndex: 2,
		hint: 'In declarations like "int& ref = x;", & creates a reference variable.',
	},
	{
		id: 'q6',
		prompt: 'What is the default access specifier for class members in C++?',
		choices: ['public', 'private', 'protected', 'None'],
		answerIndex: 1,
		hint: 'Class members are private by default, unlike struct members which are public.',
	},
	{
		id: 'q7',
		prompt: 'Which keyword is used to allocate memory dynamically in C++?',
		choices: ['malloc', 'new', 'alloc', 'create'],
		answerIndex: 1,
		hint: 'The "new" keyword allocates memory and calls the constructor.',
	},
	{
		id: 'q8',
		prompt: 'What is the correct way to declare a pointer to an integer?',
		choices: ['int p*;', 'int *p;', '*int p;', 'pointer int p;'],
		answerIndex: 1,
		hint: 'The asterisk goes before the variable name: int *p;',
	},
	{
		id: 'q9',
		prompt: 'What does endl do in C++?',
		choices: ['Ends the program', 'Inserts newline and flushes buffer', 'Ends the line only', 'Clears the screen'],
		answerIndex: 1,
		hint: 'endl inserts a newline AND flushes the output buffer.',
	},
	{
		id: 'q10',
		prompt: 'What is the size of int on most modern 64-bit systems?',
		choices: ['2 bytes', '4 bytes', '8 bytes', 'Depends on compiler'],
		answerIndex: 1,
		hint: 'int is typically 4 bytes (32 bits) even on 64-bit systems.',
	},
	{
		id: 'q11',
		prompt: 'What is the correct syntax for a for loop in C++?',
		choices: ['for (i = 0; i < 10; i++)', 'for (int i = 0; i < 10; i++)', 'for i in range(10)', 'foreach (int i in 10)'],
		answerIndex: 1,
		hint: 'C++ for loops require variable declaration, condition, and increment.',
	},
	{
		id: 'q12',
		prompt: 'What is a constructor in C++?',
		choices: ['A function that destroys objects', 'A special function that initializes objects', 'A type of variable', 'A loop structure'],
		answerIndex: 1,
		hint: 'Constructors are called automatically when an object is created.',
	},
	{
		id: 'q13',
		prompt: 'What does the scope resolution operator (::) do?',
		choices: ['Compares values', 'Accesses global or class scope', 'Creates a pointer', 'Defines a function'],
		answerIndex: 1,
		hint: 'The :: operator accesses namespaces, classes, or global scope.',
	},
	{
		id: 'q14',
		prompt: 'What is the correct way to pass an array to a function?',
		choices: ['void func(int arr[])', 'void func(int[] arr)', 'void func(array int)', 'void func(int arr)'],
		answerIndex: 0,
		hint: 'Arrays are passed as pointers: int arr[] or int* arr.',
	},
	{
		id: 'q15',
		prompt: 'What does the keyword "virtual" do in C++?',
		choices: ['Makes a variable constant', 'Enables runtime polymorphism', 'Creates a template', 'Declares a static member'],
		answerIndex: 1,
		hint: 'Virtual functions allow derived classes to override base class behavior.',
	},
	{
		id: 'q16',
		prompt: 'What is the difference between struct and class in C++?',
		choices: ['No difference', 'Default access: struct is public, class is private', 'struct cannot have functions', 'class cannot inherit'],
		answerIndex: 1,
		hint: 'The only difference is the default access specifier.',
	},
	{
		id: 'q17',
		prompt: 'What happens when you delete a null pointer in C++?',
		choices: ['Undefined behavior', 'Program crashes', 'Nothing (safe operation)', 'Compilation error'],
		answerIndex: 2,
		hint: 'Deleting a null pointer is safe and does nothing.',
	},
	{
		id: 'q18',
		prompt: 'What is the output of: cout << (5 > 3 ? "Yes" : "No");',
		choices: ['5 > 3', 'Yes', 'No', 'true'],
		answerIndex: 1,
		hint: 'The ternary operator returns the second value if condition is true.',
	},
	{
		id: 'q19',
		prompt: 'Which keyword is used to prevent a class from being inherited?',
		choices: ['static', 'const', 'final', 'sealed'],
		answerIndex: 2,
		hint: 'C++11 introduced the "final" keyword to prevent inheritance.',
	},
	{
		id: 'q20',
		prompt: 'What is the correct way to declare a vector of integers?',
		choices: ['vector int v;', 'int vector v;', 'vector<int> v;', 'vector[int] v;'],
		answerIndex: 2,
		hint: 'Vectors use angle brackets for template parameters: vector<int>.',
	},
	{
		id: 'q21',
		prompt: 'What does the "static" keyword mean for a class member?',
		choices: ['Cannot be changed', 'Shared by all instances', 'Private only', 'Cannot be inherited'],
		answerIndex: 1,
		hint: 'Static members belong to the class, not individual objects.',
	},
	{
		id: 'q22',
		prompt: 'What is the output of: cout << sizeof(char);',
		choices: ['1', '2', '4', 'Undefined'],
		answerIndex: 0,
		hint: 'char is always 1 byte by definition in C++.',
	},
	{
		id: 'q23',
		prompt: 'What is a destructor in C++?',
		choices: ['A function that creates objects', 'A function that cleans up when object is destroyed', 'A type of constructor', 'A static function'],
		answerIndex: 1,
		hint: 'Destructors (prefixed with ~) are called when objects go out of scope.',
	},
	{
		id: 'q24',
		prompt: 'What is the purpose of the "this" pointer?',
		choices: ['Points to the current function', 'Points to the current object', 'Points to the parent class', 'Points to null'],
		answerIndex: 1,
		hint: 'The "this" pointer holds the address of the current object.',
	},
	{
		id: 'q25',
		prompt: 'What is function overloading?',
		choices: ['Calling a function too many times', 'Multiple functions with same name but different parameters', 'Overriding a base class function', 'Using recursion'],
		answerIndex: 1,
		hint: 'Overloading allows functions with the same name but different signatures.',
	},
	{
		id: 'q26',
		prompt: 'What does "cin >> x;" do?',
		choices: ['Outputs x', 'Inputs a value into x', 'Compares cin and x', 'Shifts bits'],
		answerIndex: 1,
		hint: 'The extraction operator >> reads input from cin into the variable.',
	},
	{
		id: 'q27',
		prompt: 'What is the difference between ++i and i++?',
		choices: ['No difference', '++i is pre-increment, i++ is post-increment', '++i is invalid', 'i++ is faster'],
		answerIndex: 1,
		hint: 'Pre-increment (++i) increments first, post-increment (i++) uses then increments.',
	},
	{
		id: 'q28',
		prompt: 'What header is needed to use strings in C++?',
		choices: ['<string.h>', '<string>', '<strings>', '<cstring>'],
		answerIndex: 1,
		hint: 'The C++ string class is in <string>, while <cstring> has C-style string functions.',
	},
	{
		id: 'q29',
		prompt: 'What is a null pointer in C++11 and later?',
		choices: ['NULL', '0', 'nullptr', 'All of the above'],
		answerIndex: 2,
		hint: 'nullptr is the preferred null pointer constant in modern C++.',
	},
	{
		id: 'q30',
		prompt: 'What does "using namespace std;" do?',
		choices: ['Imports the standard library', 'Allows using std members without std:: prefix', 'Creates a namespace', 'Defines a macro'],
		answerIndex: 1,
		hint: 'This directive lets you use cout instead of std::cout.',
	},
	{
		id: 'q31',
		prompt: 'What is the output of: int x = 10; cout << x++;',
		choices: ['10', '11', '9', 'Undefined'],
		answerIndex: 0,
		hint: 'Post-increment returns the original value, then increments.',
	},
	{
		id: 'q32',
		prompt: 'What is an abstract class in C++?',
		choices: ['A class with no members', 'A class with at least one pure virtual function', 'A class that cannot have objects', 'Both B and C'],
		answerIndex: 3,
		hint: 'Abstract classes have pure virtual functions and cannot be instantiated.',
	},
	{
		id: 'q33',
		prompt: 'What is the purpose of the "friend" keyword?',
		choices: ['Creates a linked class', 'Allows access to private members', 'Inherits from a class', 'Defines a template'],
		answerIndex: 1,
		hint: 'Friend functions/classes can access private members of a class.',
	},
	{
		id: 'q34',
		prompt: 'How do you dynamically allocate an array of 10 integers?',
		choices: ['int arr = new int[10];', 'int* arr = new int[10];', 'int arr[10] = new;', 'new int arr[10];'],
		answerIndex: 1,
		hint: 'Dynamic arrays require a pointer: int* arr = new int[10];',
	},
	{
		id: 'q35',
		prompt: 'What is the correct way to free dynamically allocated array memory?',
		choices: ['delete arr;', 'delete[] arr;', 'free(arr);', 'remove arr;'],
		answerIndex: 1,
		hint: 'Use delete[] for arrays, delete for single objects.',
	},
]

type Toast = {
	id: number
	message: string
	type: 'success' | 'info' | 'warning'
}

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
	// Session setup state
	const [sessionStarted, setSessionStarted] = useState(false)
	const [sessionLength, setSessionLength] = useState(20)
	const [timeMode, setTimeMode] = useState<'quick' | 'deep'>('quick') // 5s or 15s per question
	const timerDuration = timeMode === 'quick' ? 5 : 15
	const xpPerQuestion = timeMode === 'quick' ? 10 : 25
	
	// Session state
	const [sessionState, setSessionState] = useState<SessionState>({
		currentQuestionIndex: 0,
		questionsAnswered: 0,
		correctAnswersThisSession: 0,
		currentStreak: 0,
		bestStreakThisSession: 0,
		sessionLength: 20,
		startTime: 0,
		elapsedTime: 0,
		isActive: false,
	})
	
	// Question state
	const [timeLeft, setTimeLeft] = useState(10)
	const [selected, setSelected] = useState<number | null>(null)
	const [locked, setLocked] = useState(false)
	const [showSummary, setShowSummary] = useState(false)
	const [showExitConfirm, setShowExitConfirm] = useState(false)
	
	// User stats
	const [userStats, setUserStats] = useState(getCurrentUserStats())
	
	// UI state
	const [toasts, setToasts] = useState<Toast[]>([])
	const [streakBroken, setStreakBroken] = useState(false)
	const [previousStreak, setPreviousStreak] = useState(0)
	
	const toastIdRef = useRef(0)
	const timerIntervalRef = useRef<number | null>(null)
	const elapsedTimeIntervalRef = useRef<number | null>(null)
	
	// Get questions for this session (cycle through if needed)
	const sessionQuestions = useMemo(() => {
		const questions: Question[] = []
		for (let i = 0; i < sessionState.sessionLength; i++) {
			questions.push(MOCK_QUESTIONS[i % MOCK_QUESTIONS.length])
		}
		return questions
	}, [sessionState.sessionLength])
	
	const currentQuestion = sessionQuestions[sessionState.currentQuestionIndex]
	
	// Update user stats when they change
	useEffect(() => {
		setUserStats(getCurrentUserStats())
	}, [sessionState.questionsAnswered])
	
	// Timer for each question
	useEffect(() => {
		if (!sessionState.isActive || locked) return
		setTimeLeft(timerDuration)
		if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
		
		timerIntervalRef.current = window.setInterval(() => {
			setTimeLeft((t) => {
				if (t <= 1) {
					if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
					setLocked(true)
					playWarning() // Play warning when time runs out
					return 0
				}
				// Play warning sound at 3 seconds remaining
				if (t === 4) {
					playWarning()
				}
				return t - 1
			})
		}, 1000)
		
		return () => {
			if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
		}
	}, [sessionState.currentQuestionIndex, locked, sessionState.isActive, timerDuration])
	
	// Track elapsed time
	useEffect(() => {
		if (!sessionState.isActive) return
		
		elapsedTimeIntervalRef.current = window.setInterval(() => {
			setSessionState((prev) => ({
				...prev,
				elapsedTime: Math.floor((Date.now() - prev.startTime) / 1000),
			}))
		}, 1000)
		
		return () => {
			if (elapsedTimeIntervalRef.current) clearInterval(elapsedTimeIntervalRef.current)
		}
	}, [sessionState.isActive, sessionState.startTime])
	
	// Auto-dismiss toasts
	useEffect(() => {
		if (toasts.length === 0) return
		const timer = setTimeout(() => {
			setToasts((prev) => prev.slice(1))
		}, 3000)
		return () => clearTimeout(timer)
	}, [toasts])
	
	// Check for milestone rewards
	useEffect(() => {
		if (!sessionState.isActive) return
		
		const { currentStreak, questionsAnswered } = sessionState
		
		// Streak milestones
		if (currentStreak === 3 && currentStreak > previousStreak) {
			showToast('🔥 3-streak! Keep it going!', 'success')
		} else if (currentStreak === 5 && currentStreak > previousStreak) {
			showToast('🔥🔥 5-streak! Amazing!', 'success')
		} else if (currentStreak === 10 && currentStreak > previousStreak) {
			showToast('🔥🔥🔥 10-streak! Incredible!', 'success')
		}
		
		// Question milestones
		if (questionsAnswered > 0 && questionsAnswered % 10 === 0) {
			showToast(`+${questionsAnswered} completed! 🎉`, 'info')
		}
		
		// Goal-gradient effect at 75%
		if (questionsAnswered === Math.ceil(sessionState.sessionLength * 0.75)) {
			showToast('Almost there — finish strong! 💪', 'info')
		}
	}, [sessionState.currentStreak, sessionState.questionsAnswered, sessionState.isActive, previousStreak])
	
	const showToast = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
		const id = toastIdRef.current++
		setToasts((prev) => [...prev, { id, message, type }])
	}
	
	const startSession = () => {
		const startTime = Date.now()
		setSessionState({
			currentQuestionIndex: 0,
			questionsAnswered: 0,
			correctAnswersThisSession: 0,
			currentStreak: 0,
			bestStreakThisSession: 0,
			sessionLength,
			startTime,
			elapsedTime: 0,
			isActive: true,
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
			newStreak = sessionState.currentStreak + 1
			newCorrect = sessionState.correctAnswersThisSession + 1
			
			// Play appropriate sound based on streak
			if (newStreak >= 5 && newStreak % 5 === 0) {
				playStreak() // Big streak milestone
			} else {
				playSuccess() // Regular correct answer
			}
		} else {
			// Loss aversion: Show streak break feedback
			playFail()
			if (sessionState.currentStreak > 0) {
				setStreakBroken(true)
				setPreviousStreak(sessionState.currentStreak)
				setTimeout(() => setStreakBroken(false), 3000)
			}
			newStreak = 0
		}
		
		const newBestStreak = Math.max(sessionState.bestStreakThisSession, newStreak)
		
		setSessionState((prev) => ({
			...prev,
			questionsAnswered: prev.questionsAnswered + 1,
			correctAnswersThisSession: newCorrect,
			currentStreak: newStreak,
			bestStreakThisSession: newBestStreak,
		}))
		
		// Record answer for stats
		await recordAnswer(isCorrect, newStreak)
		
		// Check if session is complete
		if (sessionState.questionsAnswered + 1 >= sessionState.sessionLength) {
			setTimeout(() => {
				setShowSummary(true)
				setSessionState((prev) => ({ ...prev, isActive: false }))
			}, 2000)
		}
	}
	
	const next = () => {
		if (sessionState.questionsAnswered >= sessionState.sessionLength) {
			setShowSummary(true)
			setSessionState((prev) => ({ ...prev, isActive: false }))
			return
		}
		
		setSelected(null)
		setLocked(false)
		setSessionState((prev) => ({
			...prev,
			currentQuestionIndex: (prev.currentQuestionIndex + 1) % sessionQuestions.length,
		}))
	}
	
	const handleExit = () => {
		if (sessionState.questionsAnswered > 0 && sessionState.questionsAnswered < sessionState.sessionLength) {
			setShowExitConfirm(true)
		} else {
			resetSession()
		}
	}
	
	const resetSession = () => {
		setSessionStarted(false)
		setShowSummary(false)
		setShowExitConfirm(false)
		setSelected(null)
		setLocked(false)
		setSessionState({
			currentQuestionIndex: 0,
			questionsAnswered: 0,
			correctAnswersThisSession: 0,
			currentStreak: 0,
			bestStreakThisSession: 0,
			sessionLength: 20,
			startTime: 0,
			elapsedTime: 0,
			isActive: false,
		})
		if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
		if (elapsedTimeIntervalRef.current) clearInterval(elapsedTimeIntervalRef.current)
	}
	
	const progress = useMemo(() => {
		if (sessionState.sessionLength === 0) return 0
		return (sessionState.questionsAnswered / sessionState.sessionLength) * 100
	}, [sessionState.questionsAnswered, sessionState.sessionLength])
	
	const sessionAccuracy = useMemo(() => {
		if (sessionState.questionsAnswered === 0) return 0
		return Math.round((sessionState.correctAnswersThisSession / sessionState.questionsAnswered) * 100)
	}, [sessionState.correctAnswersThisSession, sessionState.questionsAnswered])
	
	const formatTime = (seconds: number) => {
		const m = Math.floor(seconds / 60)
		const s = seconds % 60
		return `${m}:${s.toString().padStart(2, '0')}`
	}
	
	// Session setup screen
	if (!sessionStarted) {
		return (
			<div className="mx-auto max-w-2xl p-6 space-y-6">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">🎯 C++ Flashcard Speedrun</h1>
					<p className="text-neutral-600 dark:text-neutral-400">
						Test your C++ knowledge with rapid-fire questions. Build streaks, beat your best, and climb the leaderboard!
					</p>
				</div>
				
				<div className="border rounded-xl p-6 space-y-5 bg-white dark:bg-neutral-900 shadow-lg">
					{/* Time Mode Toggle - NEW! */}
					<div>
						<label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
							Choose Speed Mode
						</label>
						<div className="grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => setTimeMode('quick')}
								className={`px-4 py-4 border-2 rounded-xl font-medium transition-all cursor-pointer touch-manipulation active:scale-95 ${
									timeMode === 'quick'
										? 'border-orange-500 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 text-orange-700 dark:text-orange-300 shadow-md'
										: 'border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800'
								}`}
							>
								<div className="text-2xl mb-1">⚡</div>
								<div className="font-bold">Quick Recall</div>
								<div className="text-xs opacity-75">5 seconds • +{10} XP</div>
							</button>
							<button
								type="button"
								onClick={() => setTimeMode('deep')}
								className={`px-4 py-4 border-2 rounded-xl font-medium transition-all cursor-pointer touch-manipulation active:scale-95 ${
									timeMode === 'deep'
										? 'border-purple-500 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 text-purple-700 dark:text-purple-300 shadow-md'
										: 'border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800'
								}`}
							>
								<div className="text-2xl mb-1">🧠</div>
								<div className="font-bold">Deep Think</div>
								<div className="text-xs opacity-75">15 seconds • +{25} XP</div>
							</button>
						</div>
					</div>

					<div>
						<label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
							Choose Session Length
						</label>
						<div className="grid grid-cols-3 gap-3">
							{[10, 20, 30].map((length) => (
								<button
									key={length}
									type="button"
									onClick={() => setSessionLength(length)}
									className={`px-4 py-3 border-2 rounded-lg font-medium transition-all cursor-pointer touch-manipulation active:scale-95 ${
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
					
					<div className={`rounded-lg p-4 border ${timeMode === 'quick' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' : 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'}`}>
						<p className={`text-sm ${timeMode === 'quick' ? 'text-orange-800 dark:text-orange-200' : 'text-purple-800 dark:text-purple-200'}`}>
							<strong>⏱️ Mode:</strong> {timeMode === 'quick' ? 'Quick Recall (5s)' : 'Deep Think (15s)'} • <strong>Potential XP:</strong> {sessionLength * xpPerQuestion}
						</p>
						<p className={`text-xs mt-1 ${timeMode === 'quick' ? 'text-orange-700 dark:text-orange-300' : 'text-purple-700 dark:text-purple-300'}`}>
							{timeMode === 'quick' ? 'Fast recall builds muscle memory. Great for review!' : 'More time to think through complex concepts. Higher rewards!'}
						</p>
					</div>
					
					{userStats.totalQuestions > 0 && (
						<div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 space-y-2">
							<p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Your Stats</p>
							<div className="grid grid-cols-3 gap-2 text-sm">
								<div>
									<span className="text-neutral-500 dark:text-neutral-400">Best Streak:</span>{' '}
									<span className="font-semibold">🔥 {userStats.streak}</span>
								</div>
								<div>
									<span className="text-neutral-500 dark:text-neutral-400">Accuracy:</span>{' '}
									<span className="font-semibold">{userStats.accuracy}%</span>
								</div>
								<div>
									<span className="text-neutral-500 dark:text-neutral-400">Total XP:</span>{' '}
									<span className="font-semibold">{userStats.correctAnswers * 10}</span>
								</div>
							</div>
						</div>
					)}
					
					{/* Best Today Badge */}
					{userStats.streak >= 3 && (
						<div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center gap-3">
							<span className="text-2xl">🏆</span>
							<div>
								<p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">Best Today: {userStats.streak} streak!</p>
								<p className="text-xs text-yellow-700 dark:text-yellow-300">Can you beat it this session?</p>
							</div>
						</div>
					)}
					
					<button
						type="button"
						onClick={startSession}
						className={`w-full px-6 py-4 rounded-xl text-lg font-bold transition-all cursor-pointer touch-manipulation active:scale-95 shadow-lg text-white ${
							timeMode === 'quick' 
								? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600' 
								: 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600'
						}`}
					>
						🚀 Start {timeMode === 'quick' ? 'Quick' : 'Deep'} Speedrun
					</button>
				</div>
			</div>
		)
	}
	
	// Summary modal
	if (showSummary) {
		const isNewBestStreak = sessionState.bestStreakThisSession > (userStats.streak || 0)
		const streakDiff = (userStats.streak || 0) - sessionState.bestStreakThisSession
		
		return (
			<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
				<div className="bg-white dark:bg-neutral-900 rounded-xl p-8 max-w-lg w-full mx-4 border-2 border-blue-200 dark:border-blue-800 shadow-2xl">
					<h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-neutral-100">📊 Session Summary</h2>
					
					<div className="space-y-4 mb-6">
						<div className="grid grid-cols-2 gap-4">
							<div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
								<div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Questions Answered</div>
								<div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
									{sessionState.questionsAnswered}
								</div>
							</div>
							<div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
								<div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Correct Answers</div>
								<div className="text-2xl font-bold text-green-900 dark:text-green-100">
									{sessionState.correctAnswersThisSession}
								</div>
							</div>
							<div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
								<div className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">Session Accuracy</div>
								<div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
									{sessionAccuracy}%
								</div>
							</div>
							<div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
								<div className="text-xs text-orange-600 dark:text-orange-400 font-medium mb-1">Best Streak</div>
								<div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
									{sessionState.bestStreakThisSession}
								</div>
							</div>
						</div>
						
						<div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
							<div className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mb-1">Time Spent</div>
							<div className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
								{formatTime(sessionState.elapsedTime)}
							</div>
						</div>
						
						{isNewBestStreak && (
							<div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
								<p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
									🔥 New personal best streak! ({sessionState.bestStreakThisSession})
								</p>
							</div>
						)}
						
						{!isNewBestStreak && streakDiff > 0 && streakDiff <= 3 && (
							<div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
								<p className="text-sm text-blue-800 dark:text-blue-200">
									You were {streakDiff} {streakDiff === 1 ? 'question' : 'questions'} from beating your best streak ({userStats.streak}). Keep going!
								</p>
							</div>
						)}
					</div>
					
					<div className="flex gap-3">
						<button
							type="button"
							onClick={() => {
								resetSession()
								startSession()
							}}
							className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg active:scale-95 transition-all cursor-pointer touch-manipulation text-sm font-semibold shadow-md"
						>
							🔄 Run Again
						</button>
						<button
							type="button"
							onClick={resetSession}
							className="flex-1 px-4 py-2.5 border-2 border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 active:scale-95 transition-all cursor-pointer touch-manipulation text-sm font-semibold text-neutral-700 dark:text-neutral-300"
						>
							Choose Topic
						</button>
					</div>
				</div>
			</div>
		)
	}
	
	// Exit confirmation dialog
	if (showExitConfirm) {
		return (
			<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
				<div className="bg-white dark:bg-neutral-900 rounded-xl p-6 max-w-md w-full mx-4 border-2 border-orange-200 dark:border-orange-800 shadow-2xl">
					<h3 className="text-lg font-bold mb-3 text-neutral-900 dark:text-neutral-100">⚠️ Exit Session?</h3>
					<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
						You've completed {sessionState.questionsAnswered}/{sessionState.sessionLength} questions. Are you sure you want to stop?
					</p>
					<div className="flex gap-3">
						<button
							type="button"
							onClick={() => setShowExitConfirm(false)}
							className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg active:scale-95 transition-all cursor-pointer touch-manipulation text-sm font-semibold"
						>
							Keep Going
						</button>
						<button
							type="button"
							onClick={resetSession}
							className="flex-1 px-4 py-2.5 border-2 border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 active:scale-95 transition-all cursor-pointer touch-manipulation text-sm font-semibold text-neutral-700 dark:text-neutral-300"
						>
							Exit
						</button>
					</div>
				</div>
			</div>
		)
	}
	
	// Main game screen
	return (
		<div className="mx-auto max-w-3xl p-4 space-y-4 relative">
			{/* Toast notifications */}
			<div className="fixed top-20 right-4 z-50 space-y-2">
				{toasts.map((toast) => (
					<div
						key={toast.id}
						className={`px-4 py-3 rounded-lg shadow-lg border-2 animate-pulse ${
							toast.type === 'success'
								? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200'
								: toast.type === 'warning'
								? 'bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-200'
								: 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
						}`}
					>
						<p className="text-sm font-medium">{toast.message}</p>
					</div>
				))}
			</div>
			
			{/* Header */}
			<div className="flex items-center justify-between bg-white dark:bg-neutral-900 rounded-lg border px-4 py-3 shadow-sm">
				<div className="flex items-center gap-4">
					<h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">C++ Speedrun</h1>
					<span className={`text-xs px-2 py-1 rounded-full font-medium ${timeMode === 'quick' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'}`}>
						{timeMode === 'quick' ? '⚡ Quick' : '🧠 Deep'}
					</span>
					<button
						type="button"
						onClick={handleExit}
						className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 px-2 py-1"
					>
						Exit
					</button>
				</div>
				<div className="flex items-center gap-4 text-sm">
					{/* Streak display with loss aversion feedback */}
					<div className={`px-3 py-1.5 rounded-full transition-all ${
						streakBroken
							? 'bg-red-100 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700 animate-pulse'
							: 'bg-orange-100 dark:bg-orange-900/30'
					}`}>
						<span className="font-semibold text-orange-700 dark:text-orange-300">
							🔥 Streak: {sessionState.currentStreak}
						</span>
						{sessionState.bestStreakThisSession > 0 && (
							<span className="text-xs text-orange-600 dark:text-orange-400 ml-2">
								(Best: {sessionState.bestStreakThisSession})
							</span>
						)}
					</div>
					<div className="text-neutral-600 dark:text-neutral-400">
						Time: <span className="font-mono font-semibold">{formatTime(sessionState.elapsedTime)}</span>
					</div>
				</div>
			</div>
			
			{/* Streak break feedback */}
			{streakBroken && (
				<div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-3 animate-pulse">
					<p className="text-sm font-medium text-red-800 dark:text-red-200">
						Your streak broke at {previousStreak}. {previousStreak >= sessionState.bestStreakThisSession 
							? `You were close to your best (${sessionState.bestStreakThisSession}). Try again!`
							: 'Keep going to beat your best!'}
					</p>
				</div>
			)}
			
			{/* Goal-gradient progress bar */}
			<div className="space-y-2">
				<div className="flex items-center justify-between text-sm">
					<span className="font-medium text-neutral-700 dark:text-neutral-300">
						Progress: {sessionState.questionsAnswered} / {sessionState.sessionLength}
					</span>
					<span className="text-neutral-500 dark:text-neutral-400">
						{Math.round(progress)}%
					</span>
				</div>
				<div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
					<div
						className={`h-full rounded-full transition-all duration-300 ${
							progress >= 75
								? 'bg-gradient-to-r from-green-500 to-blue-500'
								: progress >= 50
								? 'bg-gradient-to-r from-blue-500 to-purple-500'
								: 'bg-blue-500'
						}`}
						style={{ width: `${progress}%` }}
					/>
				</div>
				{progress >= 75 && progress < 100 && (
					<p className="text-xs text-green-600 dark:text-green-400 font-medium animate-pulse">
						Almost there — finish strong! 💪
					</p>
				)}
			</div>
			
			{/* Question card */}
			<div className="border rounded-lg p-6 bg-white dark:bg-neutral-900 shadow-sm">
				<p className="font-medium text-lg mb-4">{currentQuestion.prompt}</p>
				
				{locked && selected !== null && (
					<div className={`mb-4 p-4 rounded-lg border-2 ${
						selected === currentQuestion.answerIndex
							? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-900 dark:text-green-100'
							: 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-900 dark:text-red-100'
					}`}>
						<p className="font-semibold text-sm mb-2">
							{selected === currentQuestion.answerIndex ? (
								<span>✓ Correct! Great job!</span>
							) : (
								<span>✗ Incorrect. The correct answer is: <span className="font-bold">{currentQuestion.choices[currentQuestion.answerIndex]}</span></span>
							)}
						</p>
						{selected !== currentQuestion.answerIndex && currentQuestion.hint && (
							<p className="text-xs text-red-700 dark:text-red-300 mt-2 italic">
								💡 {currentQuestion.hint}
							</p>
						)}
						{selected !== currentQuestion.answerIndex && !currentQuestion.hint && (
							<p className="text-xs text-red-700 dark:text-red-300 mt-2 italic">
								Close! Many confuse these. Review the concept and try again next time!
							</p>
						)}
					</div>
				)}
				
				<div className="grid gap-3">
					{currentQuestion.choices.map((c, i) => {
						const isCorrect = locked && i === currentQuestion.answerIndex
						const isWrong = locked && selected === i && i !== currentQuestion.answerIndex
						return (
							<button
								key={i}
								type="button"
								disabled={locked}
								onClick={() => handleAnswer(i)}
								className={`text-left border-2 rounded-lg px-4 py-3 transition-all touch-manipulation cursor-pointer active:scale-95 relative ${
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
				
				<div className="mt-4 flex items-center justify-between text-sm">
					<div className="flex items-center gap-4">
						{/* Visual Timer Bar */}
						<div className="flex items-center gap-2">
							<span className="text-neutral-500">⏱️</span>
							<div className="w-24 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
								<div 
									className={`h-full rounded-full transition-all duration-200 ${
										timeLeft <= 3 ? 'bg-red-500 animate-pulse' : timeLeft <= timerDuration * 0.5 ? 'bg-orange-500' : 'bg-green-500'
									}`}
									style={{ width: `${(timeLeft / timerDuration) * 100}%` }}
								/>
							</div>
							<span className={`font-mono font-bold ${timeLeft <= 3 ? 'text-red-600 animate-pulse' : ''}`}>{timeLeft}s</span>
						</div>
						<div>Accuracy: <span className="font-semibold">{sessionAccuracy}%</span></div>
						<div className="text-purple-600 dark:text-purple-400">+{xpPerQuestion} XP/correct</div>
					</div>
					<button
						type="button"
						onClick={next}
						disabled={!locked}
						className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-neutral-300 disabled:dark:bg-neutral-700 text-white rounded-lg font-medium transition-all cursor-pointer touch-manipulation disabled:cursor-not-allowed active:scale-95"
					>
						{sessionState.questionsAnswered >= sessionState.sessionLength ? 'Finish' : 'Next'}
					</button>
				</div>
			</div>
		</div>
	)
}

export default Speedrun
