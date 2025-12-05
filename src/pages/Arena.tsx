import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Editor from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { Link, useParams } from 'react-router-dom'
import { db, rtdbEnabled } from '../lib/firebase.ts'
import { getIdentity } from '../lib/identity.ts'
import { recordCollaboration, recordCodeEdit, recordChatMessage, recordActiveTime, updateRoomStats, incrementRoomMessages } from '../lib/stats.ts'
import { onDisconnect, onValue, push, ref, remove, serverTimestamp, set } from 'firebase/database'

// Challenge type definitions
type ChallengeType = 'fix-the-bug' | 'fill-the-blank' | 'code-review' | 'pair-programming' | null

interface ChallengeInfo {
	icon: string
	title: string
	description: string
	xp: number
	color: string
	starterCode: string
	variants?: string[] // Multiple question variants for randomization
}

// Helper to get random variant
const getRandomVariant = (variants: string[], starterCode: string): string => {
	if (!variants || variants.length === 0) return starterCode
	const randomIndex = Math.floor(Math.random() * variants.length)
	return variants[randomIndex]
}

const CHALLENGES: Record<Exclude<ChallengeType, null>, ChallengeInfo> = {
	'fix-the-bug': {
		icon: '🐛',
		title: 'Fix the Bug',
		description: 'Find and fix the bugs in this C++ code together!',
		xp: 30,
		color: 'red',
		starterCode: `// 🐛 Fix the Bug Challenge!
// This code has 3 bugs. Work together to find and fix them!

#include <iostream>
#include <vector>
using namespace std;

// Bug 1: Function should return the sum of array elements
int sumArray(int arr[], int size) {
    int sum = 0;
    for (int i = 0; i <= size; i++) {  // Bug: off-by-one error
        sum += arr[i];
    }
    return sum;
}

// Bug 2: Function should swap two values
void swap(int a, int b) {  // Bug: should use references
    int temp = a;
    a = b;
    b = temp;
}

// Bug 3: Memory leak issue
int* createArray(int size) {
    int arr[size];  // Bug: returning stack-allocated array
    for (int i = 0; i < size; i++) {
        arr[i] = i * 2;
    }
    return arr;
}

int main() {
    int numbers[] = {1, 2, 3, 4, 5};
    cout << "Sum: " << sumArray(numbers, 5) << endl;
    
    int x = 10, y = 20;
    swap(x, y);
    cout << "After swap: x=" << x << ", y=" << y << endl;
    
    return 0;
}
`,
		variants: [
			`// 🐛 Fix the Bug Challenge - Variant A!
// This code has 3 bugs. Find and fix them!

#include <iostream>
#include <string>
using namespace std;

// Bug 1: String comparison issue
bool isEqual(string a, string b) {
    return a = b;  // Bug: assignment instead of comparison
}

// Bug 2: Infinite loop
int factorial(int n) {
    int result = 1;
    while (n >= 0) {  // Bug: should be n > 0
        result *= n;
        n--;
    }
    return result;
}

// Bug 3: Wrong return type
int divide(int a, int b) {  // Bug: should return double
    return a / b;
}

int main() {
    cout << "Equal: " << isEqual("hello", "hello") << endl;
    cout << "5! = " << factorial(5) << endl;
    cout << "7/2 = " << divide(7, 2) << endl;
    return 0;
}
`,
			`// 🐛 Fix the Bug Challenge - Variant B!
// This code has 3 bugs. Find and fix them!

#include <iostream>
using namespace std;

class Counter {
    int count;  // Bug 1: should be initialized
public:
    void increment() { count++; }
    void decrement() { count--; }
    int getCount() { return count; }
};

// Bug 2: Array bounds issue
void printReverse(int arr[], int size) {
    for (int i = size; i >= 0; i--) {  // Bug: starts at size instead of size-1
        cout << arr[i] << " ";
    }
}

// Bug 3: Missing break statements
void printGrade(int score) {
    switch(score / 10) {
        case 10:
        case 9: cout << "A";  // Bug: missing break
        case 8: cout << "B";
        case 7: cout << "C";
        default: cout << "F";
    }
}

int main() {
    Counter c;
    c.increment();
    cout << "Count: " << c.getCount() << endl;
    
    int nums[] = {1, 2, 3, 4, 5};
    printReverse(nums, 5);
    
    printGrade(95);
    return 0;
}
`,
			`// 🐛 Fix the Bug Challenge - Variant C!
// This code has 3 bugs. Find and fix them!

#include <iostream>
#include <cstring>
using namespace std;

// Bug 1: Pointer issue
void doubleValue(int* ptr) {
    ptr = new int(*ptr * 2);  // Bug: should modify original, not reassign
}

// Bug 2: String copy issue
void copyString(char* dest, const char* src) {
    while (src != '\\0') {  // Bug: dereferencing issue
        *dest++ = *src++;
    }
}

// Bug 3: Logical error
bool isPrime(int n) {
    if (n < 2) return false;
    for (int i = 2; i < n; i++) {  // Bug: inefficient, should be i*i <= n
        if (n % i == 0) return true;  // Bug: should return false
    }
    return false;  // Bug: should return true
}

int main() {
    int x = 5;
    doubleValue(&x);
    cout << "Doubled: " << x << endl;
    
    cout << "Is 17 prime? " << isPrime(17) << endl;
    return 0;
}
`
		]
	},
	'fill-the-blank': {
		icon: '📝',
		title: 'Fill the Blank',
		description: 'Complete the missing C++ code sections!',
		xp: 25,
		color: 'yellow',
		starterCode: `// 📝 Fill the Blank Challenge!
// Complete the missing code sections marked with ___

#include <iostream>
#include <string>
using namespace std;

class Rectangle {
private:
    double width;
    double height;

public:
    // TODO: Complete the constructor
    Rectangle(double w, double h) {
        ___ = w;    // Fill in the blank
        ___ = h;    // Fill in the blank
    }

    // TODO: Complete the area calculation
    double getArea() {
        return ___;  // Fill in the blank
    }

    // TODO: Complete the perimeter calculation
    double getPerimeter() {
        return ___;  // Fill in the blank
    }
};

// TODO: Complete the template function to find maximum
template <typename T>
T findMax(T a, T b) {
    return ___;  // Fill in the blank using ternary operator
}

int main() {
    Rectangle rect(5.0, 3.0);
    
    cout << "Area: " << rect.getArea() << endl;
    cout << "Perimeter: " << rect.getPerimeter() << endl;
    
    cout << "Max of 10 and 20: " << findMax(10, 20) << endl;
    cout << "Max of 3.14 and 2.71: " << findMax(3.14, 2.71) << endl;
    
    return 0;
}
`,
	},
	'code-review': {
		icon: '🔍',
		title: 'Code Review',
		description: 'Review this C++ code and suggest improvements!',
		xp: 20,
		color: 'green',
		starterCode: `// 🔍 Code Review Challenge!
// Review this code and improve it together.
// Consider: naming, efficiency, safety, and best practices

#include <iostream>
using namespace std;

// Review this function - what could be improved?
int f(int x[], int n) {
    int r = 0;
    for (int i = 0; i < n; i++) {
        if (x[i] > r) {
            r = x[i];
        }
    }
    return r;
}

// Review this class - what could be improved?
class s {
public:
    string n;
    int a;
    float g;
    
    void p() {
        cout << n << " " << a << " " << g << endl;
    }
};

// Review this function - any issues?
void process(int* arr, int size) {
    int* copy = new int[size];
    for (int i = 0; i < size; i++) {
        copy[i] = arr[i] * 2;
    }
    // Process copy...
    cout << "Processing done" << endl;
}

int main() {
    int nums[] = {5, 2, 9, 1, 7};
    cout << "Max: " << f(nums, 5) << endl;
    
    s student;
    student.n = "Alice";
    student.a = 20;
    student.g = 3.8;
    student.p();
    
    process(nums, 5);
    
    return 0;
}
`,
	},
	'pair-programming': {
		icon: '👯',
		title: 'Pair Programming',
		description: 'Solve this C++ problem together with your partner!',
		xp: 35,
		color: 'purple',
		starterCode: `// 👯 Pair Programming Challenge!
// Work together to implement the following:
// A simple linked list with insert, print, and reverse operations

#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
    
    Node(int val) : data(val), next(nullptr) {}
};

class LinkedList {
private:
    Node* head;

public:
    LinkedList() : head(nullptr) {}
    
    // TODO: Implement insertAtEnd
    void insertAtEnd(int value) {
        // Your code here
    }
    
    // TODO: Implement insertAtBeginning  
    void insertAtBeginning(int value) {
        // Your code here
    }
    
    // TODO: Implement print
    void print() {
        // Your code here
    }
    
    // TODO: Implement reverse
    void reverse() {
        // Your code here
    }
    
    // TODO: Implement destructor to free memory
    ~LinkedList() {
        // Your code here
    }
};

int main() {
    LinkedList list;
    
    // Test your implementation
    list.insertAtEnd(1);
    list.insertAtEnd(2);
    list.insertAtEnd(3);
    list.insertAtBeginning(0);
    
    cout << "Original list: ";
    list.print();
    
    list.reverse();
    cout << "Reversed list: ";
    list.print();
    
    return 0;
}
`,
	},
}

// Lesson content for each challenge type
interface LessonContent {
	title: string
	subtitle: string
	sections: {
		heading: string
		content: string
		code?: string
		bullets?: string[]
	}[]
}

const LESSONS: Record<Exclude<ChallengeType, null>, LessonContent> = {
	'fix-the-bug': {
		title: 'Lesson: Common C++ Bugs',
		subtitle: 'Learn to identify and fix the most frequent programming errors in C++.',
		sections: [
			{
				heading: 'The Big Picture',
				content: 'Debugging is a critical skill for every programmer. Common bugs in C++ include:',
				bullets: [
					'Off-by-one errors in loops (using <= instead of <)',
					'Pass-by-value vs pass-by-reference issues',
					'Memory management problems (leaks, dangling pointers)',
					'Uninitialized variables',
				],
			},
			{
				heading: 'Off-by-One Errors',
				content: 'One of the most common bugs. Arrays are 0-indexed, so for an array of size n, valid indices are 0 to n-1.',
				code: '// Wrong: accesses arr[size] which is out of bounds\nfor (int i = 0; i <= size; i++)\n\n// Correct: stops at size-1\nfor (int i = 0; i < size; i++)',
			},
			{
				heading: 'Pass by Reference',
				content: 'To modify variables inside a function, use references (&) or pointers (*).',
				code: '// Wrong: changes are local only\nvoid swap(int a, int b)\n\n// Correct: modifies original variables\nvoid swap(int& a, int& b)',
			},
			{
				heading: 'Memory Management',
				content: 'Never return pointers to local (stack) variables. Use dynamic allocation with new/delete.',
				code: '// Wrong: arr is destroyed when function returns\nint* createArray(int size) {\n    int arr[size];\n    return arr;  // Dangling pointer!\n}\n\n// Correct: heap allocation persists\nint* createArray(int size) {\n    return new int[size];\n}',
			},
		],
	},
	'fill-the-blank': {
		title: 'Lesson: C++ Classes & Templates',
		subtitle: 'Master object-oriented programming and generic programming in C++.',
		sections: [
			{
				heading: 'The Big Picture',
				content: 'Classes encapsulate data and behavior. Templates enable generic, reusable code.',
				bullets: [
					'Classes have private data members and public methods',
					'Constructors initialize object state',
					'Templates work with any data type',
					'The ternary operator provides concise conditionals',
				],
			},
			{
				heading: 'Class Constructors',
				content: 'Constructors initialize member variables when an object is created.',
				code: 'class Rectangle {\nprivate:\n    double width;\n    double height;\npublic:\n    Rectangle(double w, double h) {\n        width = w;\n        height = h;\n    }\n};',
			},
			{
				heading: 'Member Functions',
				content: 'Methods that operate on class data. Use member variables directly.',
				code: 'double getArea() {\n    return width * height;\n}\n\ndouble getPerimeter() {\n    return 2 * (width + height);\n}',
			},
			{
				heading: 'Template Functions',
				content: 'Templates let you write functions that work with any type.',
				code: 'template <typename T>\nT findMax(T a, T b) {\n    return (a > b) ? a : b;\n}\n\n// Works with int, double, etc.\nfindMax(10, 20);      // Returns 20\nfindMax(3.14, 2.71);  // Returns 3.14',
			},
		],
	},
	'code-review': {
		title: 'Lesson: Code Quality & Best Practices',
		subtitle: 'Learn to write clean, maintainable, and efficient C++ code.',
		sections: [
			{
				heading: 'The Big Picture',
				content: 'Good code is readable, maintainable, and efficient. Key principles:',
				bullets: [
					'Use descriptive, meaningful names',
					'Follow consistent naming conventions',
					'Avoid memory leaks - always free allocated memory',
					'Keep functions small and focused',
				],
			},
			{
				heading: 'Naming Conventions',
				content: 'Names should clearly describe purpose. Avoid single letters except for loop counters.',
				code: '// Bad naming\nint f(int x[], int n);\nclass s { string n; int a; };\n\n// Good naming\nint findMaximum(int numbers[], int size);\nclass Student {\n    string name;\n    int age;\n};',
			},
			{
				heading: 'Memory Management',
				content: 'Every new must have a corresponding delete. Use RAII or smart pointers.',
				code: '// Memory leak - copy is never deleted!\nvoid process(int* arr, int size) {\n    int* copy = new int[size];\n    // ... process ...\n}  // Memory leaked!\n\n// Fixed - properly free memory\nvoid process(int* arr, int size) {\n    int* copy = new int[size];\n    // ... process ...\n    delete[] copy;  // Clean up!\n}',
			},
			{
				heading: 'Class Design',
				content: 'Use private members with public getters/setters. Initialize all members.',
				code: 'class Student {\nprivate:\n    string name;\n    int age;\n    float gpa;\npublic:\n    Student(string n, int a, float g)\n        : name(n), age(a), gpa(g) {}\n\n    void print() const {\n        cout << name << ", " << age << endl;\n    }\n};',
			},
		],
	},
	'pair-programming': {
		title: 'Lesson: Linked Lists',
		subtitle: 'Understand dynamic data structures and pointer manipulation.',
		sections: [
			{
				heading: 'The Big Picture',
				content: 'A linked list is a dynamic data structure where elements (nodes) are connected via pointers.',
				bullets: [
					'Each node contains data and a pointer to the next node',
					'Dynamic size - grows and shrinks as needed',
					'O(1) insertion at head, O(n) at tail (without tail pointer)',
					'No random access - must traverse from head',
				],
			},
			{
				heading: 'Node Structure',
				content: 'Each node stores data and a pointer to the next node.',
				code: 'struct Node {\n    int data;\n    Node* next;\n\n    Node(int val) : data(val), next(nullptr) {}\n};',
			},
			{
				heading: 'Insert at Beginning',
				content: 'Create new node, point it to current head, update head.',
				code: 'void insertAtBeginning(int value) {\n    Node* newNode = new Node(value);\n    newNode->next = head;\n    head = newNode;\n}',
			},
			{
				heading: 'Insert at End',
				content: 'Traverse to last node, attach new node.',
				code: 'void insertAtEnd(int value) {\n    Node* newNode = new Node(value);\n    if (!head) {\n        head = newNode;\n        return;\n    }\n    Node* current = head;\n    while (current->next) {\n        current = current->next;\n    }\n    current->next = newNode;\n}',
			},
			{
				heading: 'Reverse a List',
				content: 'Use three pointers to reverse the links.',
				code: 'void reverse() {\n    Node* prev = nullptr;\n    Node* current = head;\n    while (current) {\n        Node* next = current->next;\n        current->next = prev;\n        prev = current;\n        current = next;\n    }\n    head = prev;\n}',
			},
		],
	},
}

function Arena() {
	const [secondsLeft, setSecondsLeft] = useState(5 * 60)
	const [showSummary, setShowSummary] = useState(false)
	const [roomName, setRoomName] = useState<string | null | undefined>(() => (rtdbEnabled ? undefined : 'Offline Demo Room'))
	const [participants, setParticipants] = useState<Array<{ id: string; name: string }>>([])
	const [messages, setMessages] = useState<Array<{ id: string; text: string; authorName: string; createdAt?: number }>>([])
	const [messageInput, setMessageInput] = useState('')
	const [collaborators, setCollaborators] = useState<Set<string>>(new Set())
	const [remoteUsers, setRemoteUsers] = useState<Map<number, { name: string; color: string; line?: number; column?: number }>>(new Map())
	const [output, setOutput] = useState<string>('')
	const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
	const [outputType, setOutputType] = useState<'success' | 'error' | 'info' | null>(null)
	const [showTerminal, setShowTerminal] = useState(true)
	const [submissionResult, setSubmissionResult] = useState<'success' | 'failure' | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [timerPaused, setTimerPaused] = useState(false)
	const [showHonorCode, setShowHonorCode] = useState(true)
	const [showSuccessModal, setShowSuccessModal] = useState(false)
	
	// Challenge state - stored in Firebase for room sync
	const [selectedChallenge, setSelectedChallenge] = useState<ChallengeType>(null)
	const [challengeLocked, setChallengeLocked] = useState(false)
	// In offline mode, always be first user. In online mode, check Firebase
	const [isFirstUser, setIsFirstUser] = useState(!rtdbEnabled)
	const [roomStartTime, setRoomStartTime] = useState<number | null>(!rtdbEnabled ? Date.now() : null)
	const [timerStartTime, setTimerStartTime] = useState<number | null>(!rtdbEnabled ? Date.now() : null)
	
	const editorRef = useRef<any>(null)
	const ydocRef = useRef<Y.Doc | null>(null)
	const providerRef = useRef<WebrtcProvider | null>(null)
	const yTextRef = useRef<Y.Text | null>(null)
	const decorationIdsRef = useRef<string[]>([])
	const collaborationRecordedRef = useRef<string | null>(null)
	const activeTimeIntervalRef = useRef<number | null>(null)
	const lastEditTimeRef = useRef<number>(0)
	const autoSaveTimeoutRef = useRef<number | null>(null)
	const { roomId: paramRoomId } = useParams<{ roomId: string }>()
	const roomId = rtdbEnabled ? paramRoomId : (paramRoomId ?? 'offline-demo')
	const identity = useMemo(() => getIdentity(), [])
	
	// Get the starter code based on challenge type (with randomization)
	const getStarterCode = (challenge: ChallengeType) => {
		if (challenge && CHALLENGES[challenge]) {
			const challengeData = CHALLENGES[challenge]
			// Use variants if available, otherwise use default starterCode
			if (challengeData.variants && challengeData.variants.length > 0) {
				return getRandomVariant(challengeData.variants, challengeData.starterCode)
			}
			return challengeData.starterCode
		}
		return `// Work together here!
#include <iostream>
using namespace std;

int add(int a, int b) {
    return a + b;
}

int main() {
    cout << "Hello, World!" << endl;
    cout << "Sum: " << add(3, 5) << endl;
    return 0;
}
`
	}
	
	// Calculate time remaining in first minute (for challenge selection)
	const selectionTimeLeft = roomStartTime ? Math.max(0, 60 - Math.floor((Date.now() - roomStartTime) / 1000)) : 60
	const canChangeChallenge = isFirstUser && !challengeLocked && selectionTimeLeft > 0
	
	// Lock challenge after 1 minute
	useEffect(() => {
		if (!roomStartTime || challengeLocked) return
		
		const timeUntilLock = Math.max(0, 60000 - (Date.now() - roomStartTime))
		if (timeUntilLock <= 0) {
			setChallengeLocked(true)
			return
		}
		
		const timeout = setTimeout(() => {
			setChallengeLocked(true)
		}, timeUntilLock)
		
		return () => clearTimeout(timeout)
	}, [roomStartTime, challengeLocked])
	
	// Sync challenge selection to Firebase
	const selectChallenge = async (challenge: Exclude<ChallengeType, null>) => {
		if (!canChangeChallenge && selectedChallenge) return
		
		setSelectedChallenge(challenge)
		
		// Update editor with new starter code
		if (editorRef.current && yTextRef.current) {
			const starterCode = getStarterCode(challenge)
			yTextRef.current.delete(0, yTextRef.current.length)
			yTextRef.current.insert(0, starterCode)
			editorRef.current.setValue(starterCode)
		}
		
		// Save to Firebase
		if (rtdbEnabled && db && roomId) {
			try {
				await set(ref(db, `rooms/${roomId}/challenge`), {
					type: challenge,
					selectedAt: serverTimestamp(),
					selectedBy: identity.name,
				})
			} catch (error) {
				console.error('Failed to save challenge selection:', error)
			}
		}
	}
	
	// Listen for challenge changes from Firebase and determine first user status
	useEffect(() => {
		// Offline mode - already handled by initial state
		if (!rtdbEnabled || !db || !roomId) {
			return
		}
		
		let hasSetFirstUser = false
		
		// Listen for room info changes (including timer resets)
		const roomRef = ref(db, `rooms/${roomId}`)
		const roomUnsub = onValue(roomRef, (snapshot) => {
			const val = snapshot.val()
			if (val?.startTime) {
				setRoomStartTime(val.startTime)
			}
			
			// Sync timer start time
			if (val?.timerStartTime) {
				setTimerStartTime(val.timerStartTime)
				// If timer is reset, unpause it
				if (!val?.submission?.timerPaused) {
					setTimerPaused(false)
				}
			} else if (val?.startTime) {
				// Use room start time as timer start time
				setTimerStartTime(val.startTime)
			}
			
			// Check if we're the creator (only on first check)
			if (!hasSetFirstUser) {
				if (val?.createdBy === identity.id) {
					setIsFirstUser(true)
					hasSetFirstUser = true
				} else if (!val?.challenge) {
					// If no challenge is set yet, we can select
					setIsFirstUser(true)
					hasSetFirstUser = true
				}
			}
		})
		
		// Listen for challenge changes
		const challengeRef = ref(db, `rooms/${roomId}/challenge`)
		const challengeUnsub = onValue(challengeRef, (snapshot) => {
			const val = snapshot.val()
			if (val?.type && CHALLENGES[val.type as Exclude<ChallengeType, null>]) {
				setSelectedChallenge(val.type as ChallengeType)
				// If challenge was set by someone else, we're not the first user
				if (val?.selectedBy !== identity.name && !hasSetFirstUser) {
					setIsFirstUser(false)
				}
			} else if (val === null) {
				// Challenge was cleared - allow new selection
				setSelectedChallenge(null)
				setChallengeLocked(false)
			}
		})
		
		// Listen for submission/terminal output sync
		const submissionRef = ref(db, `rooms/${roomId}/submission`)
		const submissionUnsub = onValue(submissionRef, (snapshot) => {
			const val = snapshot.val()
			if (val) {
				setOutput(val.output || '')
				setOutputType(val.outputType || null)
				setSubmissionResult(val.result || null)
				setShowTerminal(true)
				if (val.timerPaused) {
					setTimerPaused(true)
				}
				// Show success modal for all users when someone succeeds
				if (val.result === 'success') {
					setShowSuccessModal(true)
				}
			} else {
				// Submission was cleared
				setOutput('')
				setOutputType(null)
				setSubmissionResult(null)
				setTimerPaused(false)
				setShowSuccessModal(false)
			}
		})
		
		return () => {
			roomUnsub()
			challengeUnsub()
			submissionUnsub()
		}
	}, [roomId, rtdbEnabled, identity.id, identity.name])

	// Sync timer based on timerStartTime from Firebase
	useEffect(() => {
		if (!roomId || !timerStartTime || timerPaused) return
		
		const updateTimer = () => {
			const elapsed = Math.floor((Date.now() - timerStartTime) / 1000)
			const remaining = Math.max(0, 5 * 60 - elapsed)
			setSecondsLeft(remaining)
			if (remaining <= 0) {
				setShowSummary(true)
			}
		}
		
		// Update immediately
		updateTimer()
		
		// Then update every second
		const id = setInterval(updateTimer, 1000)
		return () => clearInterval(id)
	}, [roomId, timerStartTime, timerPaused])

	useEffect(() => {
		setShowSummary(false)
	}, [roomId])

	useEffect(() => {
		if (!roomId) return
		const ydoc = new Y.Doc()
		const room = `codetogether-arena-${roomId}`
		const provider = new WebrtcProvider(room, ydoc, {
			// default signaling servers; fine for demo
		})
		const yText = ydoc.getText('monaco')
		ydocRef.current = ydoc
		providerRef.current = provider
		yTextRef.current = yText
		
		// Set our own awareness state
		provider.awareness.setLocalStateField('user', {
			name: identity.name,
			color: `hsl(${identity.id.charCodeAt(0) * 137.5 % 360}, 70%, 50%)`,
		})
		
		// Track connected peers for collaboration indicator
		const updateCollaborators = () => {
			const peers = new Set<string>()
			provider.awareness.getStates().forEach((state, clientId) => {
				if (clientId !== provider.awareness.clientID) {
					const name = (state.user as { name?: string })?.name || `User ${clientId.toString().slice(0, 4)}`
					peers.add(name)
				}
			})
			setCollaborators(peers)
		}
		
		provider.awareness.on('change', updateCollaborators)
		updateCollaborators()
		
		return () => {
			provider.awareness.off('change', updateCollaborators)
			provider.destroy()
			ydoc.destroy()
		}
	}, [roomId])

// Auto-save code to Firebase
const autoSaveCode = async (code: string) => {
	if (!roomId || !rtdbEnabled || !db) return
	
	setSaveStatus('saving')
	try {
		await set(ref(db, `code/${roomId}`), {
			content: code,
			lastSaved: serverTimestamp(),
			savedBy: identity.name,
		})
		setSaveStatus('saved')
	} catch (error) {
		console.error('Failed to save code:', error)
		setSaveStatus('unsaved')
	}
}

// Load saved code from Firebase
useEffect(() => {
	if (!rtdbEnabled || !db || !roomId) return
	
	const codeRef = ref(db, `code/${roomId}`)
	const unsubscribe = onValue(codeRef, (snapshot) => {
		const val = snapshot.val()
		if (val?.content && editorRef.current && yTextRef.current) {
			const savedCode = val.content as string
			const currentCode = editorRef.current.getValue()
			// Only update if different to avoid overwriting active edits
			if (savedCode !== currentCode && yTextRef.current.toString() !== savedCode) {
				yTextRef.current.delete(0, yTextRef.current.length)
				yTextRef.current.insert(0, savedCode)
				editorRef.current.setValue(savedCode)
			}
		}
	})
	return () => unsubscribe()
}, [roomId, rtdbEnabled])

useEffect(() => {
	if (!rtdbEnabled) {
		setParticipants([{ id: identity.id, name: identity.name }])
		setRoomName('Offline Demo Room')
		return
	}
	if (!roomId) return
	if (!db) return
	setRoomName(undefined)
	const roomRef = ref(db, `rooms/${roomId}`)
	const unsubscribe = onValue(roomRef, (snapshot) => {
		const val = snapshot.val()
		if (val) {
			setRoomName(val.name ?? 'Untitled Room')
		} else {
			setRoomName(null)
		}
	})
	return () => unsubscribe()
}, [roomId, identity, rtdbEnabled])

useEffect(() => {
	if (!rtdbEnabled) {
		// Record collaboration even in offline mode
		if (roomId && collaborationRecordedRef.current !== roomId) {
			collaborationRecordedRef.current = roomId
			recordCollaboration()
		}
		return
	}
	if (!db) return
	if (!roomId || roomName === undefined || roomName === null) return
	
	// Record collaboration when joining a room (only once per room)
	if (collaborationRecordedRef.current !== roomId) {
		collaborationRecordedRef.current = roomId
		recordCollaboration()
	}
	
	const presenceRef = ref(db, `presence/${roomId}/${identity.id}`)
	const roomPresenceRef = ref(db, `presence/${roomId}`)
	
	// Set our presence
	set(presenceRef, {
		name: identity.name,
		joinedAt: serverTimestamp(),
	})
	
	// On disconnect: remove our presence, then check if room is empty and clean up
	const disconnect = onDisconnect(presenceRef)
	disconnect.remove()
	
	const listRef = ref(db, `presence/${roomId}`)
	const unsubscribe = onValue(listRef, (snapshot) => {
		const next: Array<{ id: string; name: string }> = []
		snapshot.forEach((child) => {
			const val = child.val() as { name?: string }
			next.push({ id: child.key ?? '', name: val?.name ?? 'Anonymous' })
		})
		setParticipants(next)
		
		// Update room stats with current participants
		if (roomName && next.length > 0) {
			updateRoomStats(roomId, roomName, next.map(p => p.id))
		}
	})
	
	// Track active time every minute
	activeTimeIntervalRef.current = window.setInterval(() => {
		if (roomId && roomName) {
			recordActiveTime(roomId, 1)
		}
	}, 60000) // Every minute
	
	// Cleanup function when leaving the room
	const cleanup = async () => {
		unsubscribe()
		if (activeTimeIntervalRef.current) {
			clearInterval(activeTimeIntervalRef.current)
			activeTimeIntervalRef.current = null
		}
		
		// Remove our presence
		try {
			await remove(presenceRef)
			
			// Check if room is now empty and delete it
			const snapshot = await new Promise<any>((resolve) => {
				onValue(roomPresenceRef, resolve, { onlyOnce: true })
			})
			
			const remainingUsers = snapshot.exists() ? Object.keys(snapshot.val() || {}).length : 0
			
			if (remainingUsers === 0 && db) {
				// Room is empty, clean up everything
				console.log('Room empty, cleaning up...')
				await Promise.all([
					remove(ref(db, `rooms/${roomId}`)),
					remove(ref(db, `presence/${roomId}`)),
					remove(ref(db, `chats/${roomId}`)),
					remove(ref(db, `code/${roomId}`)),
				]).catch(err => console.error('Cleanup error:', err))
			}
		} catch (error) {
			console.error('Error during cleanup:', error)
		}
	}
	
	return () => {
		cleanup()
	}
}, [roomId, identity, roomName, rtdbEnabled])

useEffect(() => {
	if (!rtdbEnabled) return
	if (!db) return
	if (!roomId || roomName === null) return
	const chatRef = ref(db, `chats/${roomId}`)
	const unsubscribe = onValue(chatRef, (snapshot) => {
		const next: Array<{ id: string; text: string; authorName: string; createdAt?: number }> = []
		snapshot.forEach((child) => {
			const val = child.val() as { text?: string; authorName?: string; createdAt?: number }
			next.push({
				id: child.key ?? '',
				text: val?.text ?? '',
				authorName: val?.authorName ?? 'Anonymous',
				createdAt: val?.createdAt,
			})
		})
		next.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
		setMessages(next)
	})
	return () => unsubscribe()
}, [roomId, roomName, rtdbEnabled])

	const sendMessage = async (event?: FormEvent<HTMLFormElement>) => {
		event?.preventDefault()
		const textToSend = messageInput.trim()
		
		if (!roomId || !textToSend) {
			console.log('Cannot send: no roomId or empty message', { roomId, textToSend })
			return
		}
		
		console.log('Sending message:', textToSend)
		setMessageInput('') // Clear input immediately for better UX
		
		// Track chat message for collaboration stats
		if (roomId) {
			recordChatMessage(roomId)
			if (rtdbEnabled) {
				incrementRoomMessages(roomId)
			}
		}
		
		if (!rtdbEnabled || !db) {
			console.log('Offline mode: adding message locally')
			setMessages((prev) => [
				...prev,
				{
					id: `offline-${Date.now()}`,
					text: textToSend,
					authorName: identity.name,
					createdAt: Date.now(),
				},
			])
			return
		}
		
		try {
			console.log('Firebase mode: pushing to RTDB')
			const messagesRef = push(ref(db, `chats/${roomId}`))
			await set(messagesRef, {
				text: textToSend,
				authorId: identity.id,
				authorName: identity.name,
				createdAt: serverTimestamp(),
			})
			console.log('Message sent successfully')
		} catch (error) {
			console.error('Failed to send message:', error)
			// Restore message on error
			setMessageInput(textToSend)
		}
	}

	const mmss = useMemo(() => {
		const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
		const s = (secondsLeft % 60).toString().padStart(2, '0')
		return `${m}:${s}`
	}, [secondsLeft])

	// Save submission result to Firebase for sync
	const saveSubmissionToFirebase = async (outputText: string, type: 'success' | 'error' | 'info', result: 'success' | 'failure' | null, pauseTimer: boolean) => {
		if (rtdbEnabled && db && roomId) {
			try {
				await set(ref(db, `rooms/${roomId}/submission`), {
					output: outputText,
					outputType: type,
					result: result,
					timerPaused: pauseTimer,
					submittedBy: identity.name,
					submittedAt: serverTimestamp(),
				})
			} catch (error) {
				console.error('Failed to save submission:', error)
			}
		}
	}

	// Submit code for grading (simulated)
	const submitCode = () => {
		if (!editorRef.current || isSubmitting) return
		
		setIsSubmitting(true)
		setShowTerminal(true)
		const loadingOutput = '🔄 Submitting code for grading...\n\nRunning test cases...'
		setOutput(loadingOutput)
		setOutputType('info')
		setSubmissionResult(null)
		
		// Show loading state to all users
		saveSubmissionToFirebase(loadingOutput, 'info', null, false)
		
		const code = editorRef.current.getValue()
		
		// Simulate grading with random success/failure for demo
		// In a real app, this would call a backend API
		setTimeout(async () => {
			const testsTotal = 5
			// Random number of tests passed (weighted toward success for better demo)
			const testsPassed = Math.random() > 0.3 ? testsTotal : Math.floor(Math.random() * 4) + 1
			const isSuccess = testsPassed === testsTotal
			
			if (isSuccess) {
				const xpEarned = selectedChallenge ? CHALLENGES[selectedChallenge]?.xp || 100 : 100
				const successOutput = `✅ SUCCESS! All tests passed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Test Results: ${testsPassed}/${testsTotal} passed

   ✓ Test 1: Basic functionality........PASSED
   ✓ Test 2: Edge cases.................PASSED  
   ✓ Test 3: Input validation...........PASSED
   ✓ Test 4: Performance check..........PASSED
   ✓ Test 5: Memory management..........PASSED

🎉 Congratulations! You earned +${xpEarned} XP!
⏱️ Timer stopped! Great teamwork!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code length: ${code.length} characters | Lines: ${code.split('\n').length}`
				setOutput(successOutput)
				setOutputType('success')
				setSubmissionResult('success')
				setTimerPaused(true)
				setShowSuccessModal(true)
				// Save to Firebase - pause timer for all users
				await saveSubmissionToFirebase(successOutput, 'success', 'success', true)
			} else {
				const failedTest = testsPassed + 1
				const failOutput = `❌ FAILED - Some tests did not pass
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Test Results: ${testsPassed}/${testsTotal} passed

   ${testsPassed >= 1 ? '✓' : '✗'} Test 1: Basic functionality........${testsPassed >= 1 ? 'PASSED' : 'FAILED'}
   ${testsPassed >= 2 ? '✓' : '✗'} Test 2: Edge cases.................${testsPassed >= 2 ? 'PASSED' : 'FAILED'}
   ${testsPassed >= 3 ? '✓' : '✗'} Test 3: Input validation...........${testsPassed >= 3 ? 'PASSED' : 'FAILED'}
   ${testsPassed >= 4 ? '✓' : '✗'} Test 4: Performance check..........${testsPassed >= 4 ? 'PASSED' : 'FAILED'}
   ✗ Test 5: Memory management..........FAILED

💡 Hint: Check test ${failedTest} - review your logic for edge cases.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Don't give up! Review and try again.`
				setOutput(failOutput)
				setOutputType('error')
				setSubmissionResult('failure')
				// Save to Firebase - don't pause timer on failure
				await saveSubmissionToFirebase(failOutput, 'error', 'failure', false)
			}
			setIsSubmitting(false)
		}, 1500)
	}

	// Try the same challenge again
	const tryAgain = async () => {
		if (!editorRef.current) return
		const starterCode = getStarterCode(selectedChallenge)
		editorRef.current.setValue(starterCode)
		setSubmissionResult(null)
		setOutput('')
		setOutputType(null)
		setTimerPaused(false)
		
		// Reset timer for new attempt
		const newTimerStart = Date.now()
		setTimerStartTime(newTimerStart)
		
		// Clear submission in Firebase and restart timer
		if (rtdbEnabled && db && roomId) {
			try {
				await set(ref(db, `rooms/${roomId}/submission`), null)
				await set(ref(db, `rooms/${roomId}/timerStartTime`), newTimerStart)
			} catch (error) {
				console.error('Failed to reset submission:', error)
			}
		}
	}

	// Select a new challenge
	const selectNewChallenge = async () => {
		setSelectedChallenge(null)
		setChallengeLocked(false)
		setSubmissionResult(null)
		setOutput('')
		setOutputType(null)
		setTimerPaused(false)
		
		// Reset room start time for new 60-second selection window
		const newStartTime = Date.now()
		setRoomStartTime(newStartTime)
		setTimerStartTime(newStartTime)
		
		// Clear challenge and submission in Firebase, reset timer
		if (rtdbEnabled && db && roomId) {
			try {
				await set(ref(db, `rooms/${roomId}/challenge`), null)
				await set(ref(db, `rooms/${roomId}/submission`), null)
				await set(ref(db, `rooms/${roomId}/timerStartTime`), newStartTime)
				await set(ref(db, `rooms/${roomId}/startTime`), newStartTime)
			} catch (error) {
				console.error('Failed to reset for new challenge:', error)
			}
		}
	}

	if (!roomId) {
		return (
			<div className="mx-auto max-w-3xl p-6 space-y-3">
				<h1 className="text-2xl font-semibold">Collaborative Arena</h1>
				<p className="text-sm text-neutral-600 dark:text-neutral-300">
					Choose a room from the <Link to="/" className="underline">Lobby</Link> or create a new one to start coding together.
				</p>
			</div>
		)
	}

	if (roomName === undefined) {
		return (
			<div className="mx-auto max-w-3xl p-6 space-y-3">
				<h1 className="text-xl font-semibold">Loading room…</h1>
				<p className="text-sm text-neutral-600 dark:text-neutral-300">Preparing your collaborative space.</p>
			</div>
		)
	}

	if (roomName === null) {
		return (
			<div className="mx-auto max-w-3xl p-6 space-y-3">
				<h1 className="text-xl font-semibold">Room not found</h1>
				<p className="text-sm text-neutral-600 dark:text-neutral-300">
					This room might have expired or never existed. Return to the <Link to="/" className="underline">Lobby</Link> to join an active room.
				</p>
			</div>
		)
	}
	
	// Show challenge selector if no challenge is selected yet
	if (!selectedChallenge) {
		return (
			<div className="mx-auto max-w-4xl p-6 space-y-6">
				{/* Room Header */}
				<div className="flex items-center justify-between border-b pb-4">
					<div>
						<h1 className="text-xl font-semibold">{roomName}</h1>
						<p className="text-xs text-neutral-500">Room ID: {roomId}</p>
					</div>
					<div className="flex items-center gap-3 text-sm">
						<span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
							{participants.length} online
						</span>
						<span className="font-mono text-neutral-600 dark:text-neutral-400">{mmss}</span>
					</div>
				</div>
				
				<div className="text-center space-y-2">
					<h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
						Choose a Collaborative Activity
					</h2>
					<p className="text-neutral-600 dark:text-neutral-300">
						{isFirstUser 
							? `Select an activity for your team. You have ${selectionTimeLeft}s to decide!`
							: 'Waiting for room host to select an activity...'}
					</p>
					{isFirstUser && selectionTimeLeft > 0 && (
						<div className="flex items-center justify-center gap-2">
							<div className="w-32 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
								<div 
									className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-1000"
									style={{ width: `${(selectionTimeLeft / 60) * 100}%` }}
								/>
							</div>
							<span className="text-xs text-neutral-500">{selectionTimeLeft}s</span>
						</div>
					)}
				</div>
				
				{/* Challenge Selection Grid - Only clickable if first user */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{(Object.entries(CHALLENGES) as [Exclude<ChallengeType, null>, ChallengeInfo][]).map(([key, challenge]) => (
						<button
							key={key}
							type="button"
							onClick={() => isFirstUser && selectChallenge(key)}
							disabled={!isFirstUser}
							className={`p-5 border-2 rounded-xl text-left transition-all 
								${isFirstUser ? 'hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer' : 'opacity-60 cursor-not-allowed'}
								${challenge.color === 'red' ? 'border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 hover:border-red-400' : ''}
								${challenge.color === 'yellow' ? 'border-yellow-200 dark:border-yellow-800 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 hover:border-yellow-400' : ''}
								${challenge.color === 'green' ? 'border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 hover:border-green-400' : ''}
								${challenge.color === 'purple' ? 'border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 hover:border-purple-400' : ''}
							`}
						>
							<div className="flex items-center gap-3 mb-2">
								<span className="text-3xl">{challenge.icon}</span>
								<div className="flex-1">
									<h3 className="font-bold text-lg text-neutral-800 dark:text-neutral-100">{challenge.title}</h3>
									<span className={`text-xs px-2 py-0.5 rounded-full font-medium
										${challenge.color === 'red' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : ''}
										${challenge.color === 'yellow' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' : ''}
										${challenge.color === 'green' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : ''}
										${challenge.color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : ''}
									`}>+{challenge.xp} XP</span>
								</div>
							</div>
							<p className="text-sm text-neutral-600 dark:text-neutral-400">{challenge.description}</p>
						</button>
					))}
				</div>
				
				{!isFirstUser && (
					<div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
						<p className="text-sm text-blue-700 dark:text-blue-300">
							💡 The room host will select an activity. You'll automatically join once they decide!
						</p>
					</div>
				)}
			</div>
		)
	}

	// Get current challenge info
	const challengeInfo = CHALLENGES[selectedChallenge]

	// Session Summary Modal - shown when timer runs out
	if (showSummary) {
		return (
			<div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
				<div className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-300 dark:border-neutral-600 overflow-hidden">
					{/* Header */}
					<div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-5 text-white text-center">
						<div className="text-4xl mb-2">⏰</div>
						<h3 className="text-xl font-bold">Time's Up!</h3>
					</div>
					
					{/* Body */}
					<div className="px-6 py-5 space-y-4 text-center">
						<p className="text-neutral-700 dark:text-neutral-300 text-lg">
							Great effort! Your session has ended.
						</p>
						<div className="bg-neutral-100 dark:bg-neutral-700 rounded-lg p-4">
							<p className="text-sm text-neutral-600 dark:text-neutral-400">
								Review your code and discuss with your partner what you learned.
							</p>
						</div>
					</div>
					
					{/* Footer */}
					<div className="border-t border-neutral-200 dark:border-neutral-700 px-6 py-4 space-y-3">
						<button 
							type="button"
							onClick={() => {
								setShowSummary(false)
								selectNewChallenge()
							}}
							className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
						>
							🎯 Try Another Challenge
						</button>
						<Link
							to="/flashcards"
							className="block w-full px-6 py-3 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-lg font-medium transition-colors text-center"
						>
							📚 Review Flashcards
						</Link>
						<button 
							type="button"
							onClick={() => setShowSummary(false)} 
							className="w-full px-6 py-3 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-800 dark:text-white rounded-lg font-medium transition-colors"
						>
							Review Code
						</button>
					</div>
				</div>
			</div>
		)
	}

	// Honor Code Modal - rendered separately to ensure it's on top
	if (showHonorCode) {
		return (
			<div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
				<div className="w-full max-w-lg bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-300 dark:border-neutral-600 overflow-hidden">
					{/* Header */}
					<div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white text-center">
						<div className="text-4xl mb-2">📜</div>
						<h3 className="text-xl font-bold">Academic Honor Code</h3>
					</div>
					
					{/* Body */}
					<div className="px-6 py-5 space-y-4">
						<p className="text-neutral-700 dark:text-neutral-300">
							By participating in this collaborative coding session, I pledge to uphold academic integrity:
						</p>
						
						<ul className="space-y-3">
							<li className="flex items-start gap-3">
								<span className="text-green-500 text-lg">✓</span>
								<div>
									<span className="font-medium text-neutral-900 dark:text-white">No AI Assistance:</span>
									<span className="text-neutral-600 dark:text-neutral-400"> I will not use ChatGPT, Copilot, or any AI tools to generate code.</span>
								</div>
							</li>
							<li className="flex items-start gap-3">
								<span className="text-green-500 text-lg">✓</span>
								<div>
									<span className="font-medium text-neutral-900 dark:text-white">Original Work:</span>
									<span className="text-neutral-600 dark:text-neutral-400"> All code I contribute is my own understanding and effort.</span>
								</div>
							</li>
							<li className="flex items-start gap-3">
								<span className="text-green-500 text-lg">✓</span>
								<div>
									<span className="font-medium text-neutral-900 dark:text-white">Collaboration Only:</span>
									<span className="text-neutral-600 dark:text-neutral-400"> I will only discuss and work with my assigned partner(s).</span>
								</div>
							</li>
							<li className="flex items-start gap-3">
								<span className="text-green-500 text-lg">✓</span>
								<div>
									<span className="font-medium text-neutral-900 dark:text-white">Learning Focus:</span>
									<span className="text-neutral-600 dark:text-neutral-400"> My goal is to learn and understand, not just to complete tasks.</span>
								</div>
							</li>
						</ul>
						
						<div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg p-4">
							<p className="text-amber-800 dark:text-amber-200 text-sm">
								⚠️ <strong>Reminder:</strong> Violations of academic integrity may result in disciplinary action as per university policy.
							</p>
						</div>
					</div>
					
					{/* Footer */}
					<div className="border-t border-neutral-200 dark:border-neutral-700 px-6 py-4">
						<button 
							type="button"
							onClick={() => setShowHonorCode(false)} 
							className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
						>
							I Agree to the Honor Code
						</button>
					</div>
				</div>
			</div>
		)
	}

	// Success Celebration Screen - full screen takeover when challenge is complete
	if (showSuccessModal) {
		const xpEarned = selectedChallenge ? CHALLENGES[selectedChallenge]?.xp || 100 : 100
		return (
			<div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900">
				{/* Animated background particles */}
				<div className="absolute inset-0 overflow-hidden pointer-events-none">
					<div className="absolute top-1/4 left-1/4 w-64 h-64 bg-green-500/20 rounded-full blur-3xl animate-pulse"></div>
					<div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
					<div className="absolute top-1/2 left-1/2 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }}></div>
				</div>
				
				<div className="relative w-full max-w-lg bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl border-4 border-green-400 dark:border-green-500 overflow-hidden">
					{/* Confetti Header */}
					<div className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 px-8 py-8 text-white text-center">
						<div className="text-7xl mb-3 animate-bounce">🎉</div>
						<h2 className="text-3xl font-bold mb-2">Challenge Complete!</h2>
						<p className="text-green-100 text-lg">All tests passed! Amazing teamwork!</p>
					</div>
					
					{/* Stats */}
					<div className="px-8 py-6 space-y-4">
						<div className="flex items-center justify-center gap-8">
							<div className="text-center">
								<div className="text-4xl font-bold text-green-600 dark:text-green-400">+{xpEarned}</div>
								<div className="text-sm text-neutral-500">XP Earned</div>
							</div>
							<div className="text-center">
								<div className="text-4xl font-bold text-blue-600 dark:text-blue-400">⏱️ {mmss}</div>
								<div className="text-sm text-neutral-500">Time Remaining</div>
							</div>
						</div>
						
						<div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-4 text-center">
							<p className="text-green-800 dark:text-green-200 font-medium">
								✅ 5/5 Tests Passed
							</p>
						</div>
						
						<p className="text-center text-neutral-600 dark:text-neutral-400 font-medium">
							What would you like to do next?
						</p>
					</div>
					
					{/* Action Buttons */}
					<div className="px-8 pb-8 space-y-3">
						<button 
							type="button"
							onClick={() => {
								setShowSuccessModal(false)
								selectNewChallenge()
							}}
							className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] shadow-lg"
						>
							🎯 Try a New Challenge
						</button>
						<button 
							type="button"
							onClick={() => {
								setShowSuccessModal(false)
								tryAgain()
							}}
							className="w-full px-6 py-4 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-800 dark:text-white rounded-xl font-semibold transition-all"
						>
							🔄 Practice This Challenge Again
						</button>
						<Link
							to="/flashcards"
							className="block w-full px-6 py-4 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/50 text-blue-800 dark:text-blue-200 rounded-xl font-semibold transition-all text-center"
						>
							📚 Review Flashcards
						</Link>
						<button 
							type="button"
							onClick={() => setShowSuccessModal(false)}
							className="w-full px-6 py-3 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 font-medium transition-colors"
						>
							Continue in current session
						</button>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="h-[calc(100vh-120px)] mx-auto max-w-7xl p-4 flex flex-col gap-3">
			{/* Challenge Header */}
			<div className={`p-3 rounded-xl border-2 flex items-center justify-between flex-shrink-0
				${challengeInfo.color === 'red' ? 'border-red-200 dark:border-red-800 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20' : ''}
				${challengeInfo.color === 'yellow' ? 'border-yellow-200 dark:border-yellow-800 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20' : ''}
				${challengeInfo.color === 'green' ? 'border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20' : ''}
				${challengeInfo.color === 'purple' ? 'border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20' : ''}
			`}>
				<div className="flex items-center gap-3">
					<span className="text-2xl">{challengeInfo.icon}</span>
					<div>
						<h2 className="font-bold text-neutral-800 dark:text-neutral-100">{challengeInfo.title}</h2>
						<p className="text-xs text-neutral-600 dark:text-neutral-400">{challengeInfo.description}</p>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<span className={`text-sm px-3 py-1 rounded-full font-bold
						${challengeInfo.color === 'red' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : ''}
						${challengeInfo.color === 'yellow' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' : ''}
						${challengeInfo.color === 'green' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : ''}
						${challengeInfo.color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : ''}
					`}>+{challengeInfo.xp} XP</span>
					{canChangeChallenge && (
						<button 
							type="button"
							onClick={() => setSelectedChallenge(null)}
							className="text-xs px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
						>
							Change ({selectionTimeLeft}s)
						</button>
					)}
					{challengeLocked && (
						<span className="text-xs px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-neutral-500">
							🔒 Locked
						</span>
					)}
				</div>
			</div>
			
			{/* Room Info */}
			<div className="flex items-center justify-between flex-shrink-0">
				<div>
					<h1 className="text-xl font-semibold">{roomName}</h1>
					<p className="text-xs text-neutral-500">Room ID: {roomId}</p>
				</div>
				<div className="text-sm flex items-center gap-4">
					{collaborators.size > 0 && (
						<span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs font-medium">
							{collaborators.size} {collaborators.size === 1 ? 'peer' : 'peers'} editing
						</span>
					)}
					<span>{participants.length} online</span>
					<span>Timer: <span className={`font-mono ${timerPaused ? 'text-green-500' : ''}`}>{mmss}</span> {timerPaused && '✓'}</span>
					{saveStatus === 'saving' && (
						<span className="text-xs text-blue-600 dark:text-blue-400">Saving...</span>
					)}
					{saveStatus === 'saved' && (
						<span className="text-xs text-green-600 dark:text-green-400">✓ Saved</span>
					)}
					{saveStatus === 'unsaved' && (
						<span className="text-xs text-orange-600 dark:text-orange-400">Unsaved</span>
					)}
				</div>
			</div>
			
			{/* Main Content Grid - 3 columns: Lesson | Editor | Chat */}
			<div className="flex-1 grid grid-cols-[320px_1fr_300px] gap-3 min-h-0 overflow-hidden">
				{/* Left Column: Lesson Panel */}
				<div className="flex flex-col border rounded-lg overflow-hidden bg-white dark:bg-neutral-800">
					<div className="px-4 py-3 border-b bg-gradient-to-r from-indigo-500 to-purple-500 flex-shrink-0">
						<h2 className="text-lg font-bold text-white">{LESSONS[selectedChallenge]?.title || 'Lesson'}</h2>
						<p className="text-xs text-indigo-100">{LESSONS[selectedChallenge]?.subtitle || ''}</p>
					</div>
					<div className="flex-1 overflow-y-auto p-4 space-y-5">
						{LESSONS[selectedChallenge]?.sections.map((section, idx) => (
							<div key={idx}>
								<h3 className="font-semibold text-neutral-800 dark:text-neutral-100 mb-2">{section.heading}</h3>
								<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">{section.content}</p>
								{section.bullets && (
									<ul className="list-disc list-inside text-sm text-neutral-600 dark:text-neutral-400 space-y-1 mb-2">
										{section.bullets.map((bullet, bIdx) => (
											<li key={bIdx}>{bullet}</li>
										))}
									</ul>
								)}
								{section.code && (
									<pre className="bg-neutral-900 text-green-400 text-xs p-3 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap">
										{section.code}
									</pre>
								)}
							</div>
						))}
					</div>
				</div>

				{/* Middle Column: Editor + Terminal */}
				<div className="flex flex-col border rounded-lg overflow-hidden bg-neutral-900">
					{/* Editor Header */}
					<div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-700 bg-neutral-800 flex-shrink-0">
						<div className="flex items-center gap-2">
							<span className="text-sm font-semibold text-neutral-200">Code Editor</span>
							<span className="text-xs px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full">C++</span>
						</div>
						<div className="flex items-center gap-3">
							<Link
								to="/flashcards"
								className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-1.5"
							>
								📚 Flashcards
							</Link>
							<button
								type="button"
								onClick={submitCode}
								disabled={isSubmitting}
								className="px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-neutral-600 text-white rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed shadow-sm"
							>
								{isSubmitting ? '⏳ Grading...' : '📤 Submit Code'}
							</button>
						</div>
					</div>
					
					{/* Editor */}
					<div className="flex-1 min-h-0">
						<Editor
						height="100%"
						defaultLanguage="cpp"
						defaultValue={getStarterCode(selectedChallenge)}
						theme="vs-dark"
						options={{
							minimap: { enabled: false },
							fontSize: 14,
							wordWrap: 'on',
						}}
						onMount={(editor, monaco) => {
							editorRef.current = editor
							const yText = yTextRef.current
							const provider = providerRef.current
							if (!yText || !provider) return
							
							let isApplyingRemote = false
							let isLocalEdit = false
							
							// Initialize editor with Yjs content or challenge starter code
											const initialText = yText.toString()
											if (initialText) {
												editor.setValue(initialText)
											} else {
												// Set starter code for new sessions
												const starterCode = getStarterCode(selectedChallenge)
												editor.setValue(starterCode)
												yText.insert(0, starterCode)
											}							// Track our own cursor position
							const updateOwnCursor = () => {
								const position = editor.getPosition()
								if (position) {
									provider.awareness.setLocalStateField('cursor', {
										line: position.lineNumber,
										column: position.column,
									})
								}
							}
							
							editor.onDidChangeCursorPosition(updateOwnCursor)
							updateOwnCursor()
							
							// Update remote cursor decorations
							const updateRemoteCursors = () => {
								if (!editorRef.current) return
								
								const decorations: any[] = []
								const userMap = new Map<number, { name: string; color: string; line?: number; column?: number }>()
								
								provider.awareness.getStates().forEach((state, clientId) => {
									if (clientId === provider.awareness.clientID) return
									
									const user = state.user as { name?: string; color?: string } | undefined
									const cursor = state.cursor as { line?: number; column?: number } | undefined
									
									if (user && cursor && cursor.line && cursor.column) {
										const name = user.name || `User ${clientId.toString().slice(0, 4)}`
										const color = user.color || '#3b82f6'
										
										userMap.set(clientId, { name, color, line: cursor.line, column: cursor.column })
										
										// Add decoration for remote cursor with dynamic color and prominent hover
										const cursorId = `remote-cursor-${clientId}`
										decorations.push({
											range: new monaco.Range(cursor.line, cursor.column, cursor.line, cursor.column),
											options: {
												className: cursorId,
												hoverMessage: { 
													value: `👤 ${name} is editing here (Line ${cursor.line}, Column ${cursor.column})`,
												},
												stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
												overviewRuler: {
													color: color,
													position: monaco.editor.OverviewRulerLane.Left,
												},
											},
										})
										
										// Dynamically set cursor color
										setTimeout(() => {
											const styleId = `cursor-style-${clientId}`
											let style = document.head.querySelector(`style#${styleId}`) as HTMLStyleElement
											if (!style) {
												style = document.createElement('style')
												style.id = styleId
												document.head.appendChild(style)
											}
											style.textContent = `
												.monaco-editor .${cursorId} {
													border-left: 3px solid ${color} !important;
													margin-left: -2px;
													opacity: 0.9;
													box-shadow: 0 0 4px ${color}40;
												}
											`
										}, 0)
									}
								})
								
								setRemoteUsers(userMap)
								decorationIdsRef.current = editorRef.current.deltaDecorations(decorationIdsRef.current, decorations)
							}
							
							// Apply remote updates to editor (only when not typing)
							const applyFromY = () => {
								if (isLocalEdit) return // Skip if we just made a local edit
								isApplyingRemote = true
								const text = yText.toString()
								const currentText = editor.getValue()
								if (text !== currentText) {
									const position = editor.getPosition()
									editor.setValue(text)
									// Try to restore cursor position
									if (position) {
										const lineCount = editor.getModel()?.getLineCount() ?? 1
										const safeLine = Math.min(position.lineNumber, lineCount)
										const safeColumn = Math.min(position.column, (editor.getModel()?.getLineContent(safeLine)?.length ?? 0) + 1)
										editor.setPosition({ lineNumber: safeLine, column: safeColumn })
									}
								}
								isApplyingRemote = false
							}
							
							// Listen for remote changes
							yText.observe(applyFromY)
							
							// Listen for awareness changes (cursor positions)
							provider.awareness.on('change', () => {
								updateRemoteCursors()
								const peers = new Set<string>()
								provider.awareness.getStates().forEach((state, clientId) => {
									if (clientId !== provider.awareness.clientID) {
										const user = state.user as { name?: string } | undefined
										const name = user?.name || `User ${clientId.toString().slice(0, 4)}`
										peers.add(name)
									}
								})
								setCollaborators(peers)
							})
							
							// Update cursors periodically and on scroll
							const cursorInterval = setInterval(updateRemoteCursors, 100)
							editor.onDidScrollChange(updateRemoteCursors)
							
							// Push local edits to Yjs and track collaboration
							const sub = editor.onDidChangeModelContent(() => {
								if (isApplyingRemote) return // Ignore changes we just applied from remote
								
								isLocalEdit = true
								const currentValue = editor.getValue()
								const yTextValue = yText.toString()
								
								// Only update if different to avoid loops
								if (currentValue !== yTextValue) {
									yText.delete(0, yText.length)
									if (currentValue) {
										yText.insert(0, currentValue)
									}
									
									// Track code edit for collaboration (throttled to once per 2 seconds)
									const now = Date.now()
									if (now - lastEditTimeRef.current > 2000 && roomId) {
										lastEditTimeRef.current = now
										recordCodeEdit(roomId)
									}
									
									// Auto-save code (debounced to 2 seconds after last edit)
									setSaveStatus('unsaved')
									if (autoSaveTimeoutRef.current) {
										clearTimeout(autoSaveTimeoutRef.current)
									}
									autoSaveTimeoutRef.current = window.setTimeout(() => {
										autoSaveCode(currentValue)
									}, 2000)
								}
								
								// Reset flag after a short delay to allow remote updates
								setTimeout(() => {
									isLocalEdit = false
								}, 100)
							})
							
							editor.onDidDispose(() => {
								clearInterval(cursorInterval)
								if (autoSaveTimeoutRef.current) {
									clearTimeout(autoSaveTimeoutRef.current)
								}
								yText.unobserve(applyFromY)
								provider.awareness.off('change', updateRemoteCursors)
								sub.dispose()
							})
							
							updateRemoteCursors()
						}}
						/>
					</div>
					
					{/* Terminal */}
					{showTerminal && (
						<div className={`border-t border-neutral-700 flex-shrink-0 ${
							outputType === 'error' 
								? 'bg-red-950/50' 
								: outputType === 'success' 
								? 'bg-green-950/30' 
								: 'bg-neutral-800'
						}`} style={{ height: '180px' }}>
							<div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
								<div className="flex items-center gap-2">
									<span className="text-sm font-semibold text-neutral-300">📟 Terminal</span>
									{outputType === 'error' && (
										<span className="text-xs px-2 py-0.5 bg-red-900/50 text-red-300 rounded">❌ Failed</span>
									)}
									{outputType === 'success' && (
										<span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-300 rounded">✅ Passed</span>
									)}
									{isSubmitting && (
										<span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded animate-pulse">Grading...</span>
									)}
								</div>
								<button
									type="button"
									onClick={() => setShowTerminal(false)}
									className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 hover:bg-neutral-700/50 rounded"
								>
									▼ Collapse
								</button>
							</div>
							<div className={`font-mono text-xs p-3 overflow-y-auto ${
								outputType === 'error' ? 'text-red-300' : outputType === 'success' ? 'text-green-300' : 'text-neutral-300'
							}`} style={{ height: 'calc(100% - 40px)' }}>
								{output ? (
									<pre className="whitespace-pre-wrap">{output}</pre>
								) : (
									<span className="text-neutral-500 italic">Click "Submit Code" to grade your solution.</span>
								)}
							</div>
						</div>
					)}
					
					{!showTerminal && (
						<button
							type="button"
							onClick={() => setShowTerminal(true)}
							className="flex-shrink-0 px-4 py-2 border-t border-neutral-700 bg-neutral-800 text-neutral-400 text-sm hover:text-neutral-200 hover:bg-neutral-700 transition-colors"
						>
							▲ Show Terminal
						</button>
					)}
				</div>
				
				{/* Right Column: Participants + Chat */}
				<div className="flex flex-col border rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
					{/* Participants */}
					<div className="border-b px-3 py-2 flex-shrink-0 bg-neutral-50 dark:bg-neutral-800">
						<h2 className="text-sm font-semibold mb-2">Participants ({participants.length})</h2>
						<ul className="space-y-1 text-sm max-h-20 overflow-y-auto">
							{participants.map((p) => {
								const remoteUser = Array.from(remoteUsers.values()).find(u => u.name === p.name)
								const color = remoteUser?.color || '#3b82f6'
								return (
									<li key={p.id} className={`flex items-center gap-2 ${p.id === identity.id ? 'font-semibold' : ''}`}>
										<span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
										<span className="flex-1 truncate text-xs">{p.name}{p.id === identity.id ? ' (You)' : ''}</span>
										{remoteUser && <span className="text-xs text-neutral-500">L{remoteUser.line}</span>}
									</li>
								)
							})}
						</ul>
					</div>
					
					{/* Chat Section */}
					<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
						<div className="px-3 py-1.5 border-b bg-white dark:bg-neutral-900 flex-shrink-0">
							<span className="text-xs font-medium text-neutral-500">💬 Team Chat</span>
						</div>
						{/* Scrollable Messages */}
						<div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm min-h-0">
							{messages.map((msg) => (
								<div key={msg.id}>
									<p className="font-semibold text-xs text-neutral-500">{msg.authorName}</p>
									<p className="text-neutral-800 dark:text-neutral-200 text-sm">{msg.text}</p>
								</div>
							))}
							{messages.length === 0 && (
								<p className="text-neutral-400 text-xs text-center py-4">No messages yet</p>
							)}
						</div>
						{/* Fixed Chat Input */}
						<div className="border-t px-2 py-2 bg-neutral-50 dark:bg-neutral-800 flex-shrink-0">
							<form 
								onSubmit={(e) => { e.preventDefault(); sendMessage(e); }}
								className="flex gap-2"
							>
								<input
									type="text"
									autoComplete="off"
									maxLength={500}
									className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
									value={messageInput}
									onChange={(e) => setMessageInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault()
											sendMessage(e as unknown as FormEvent<HTMLFormElement>)
										}
									}}
									placeholder="Type a message..."
								/>
								<button 
									type="submit" 
									disabled={!messageInput.trim()}
									className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white rounded text-xs font-medium disabled:cursor-not-allowed"
								>
									Send
								</button>
							</form>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default Arena


