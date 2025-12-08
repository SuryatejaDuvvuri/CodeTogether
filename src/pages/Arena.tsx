import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { FormEvent, CSSProperties } from 'react'
import Editor from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { Link, useParams } from 'react-router-dom'
import { db, rtdbEnabled } from '../lib/firebase.ts'
import { getIdentity } from '../lib/identity.ts'
import { recordCollaboration, recordCodeEdit, recordChatMessage, recordActiveTime, updateRoomStats, incrementRoomMessages, awardXPToAll } from '../lib/stats.ts'
import { onDisconnect, onValue, push, ref, remove, serverTimestamp, set } from 'firebase/database'
import { playVictory, playSuccess, playStreak, playCelebration } from '../lib/sounds.ts'

const c = {
  bg: '#111113', card: '#18181b', cardHover: '#1f1f23', border: '#27272a', borderHover: '#3f3f46',
  text: '#fafafa', textMuted: '#a1a1aa', textDim: '#71717a',
  blue: '#3b82f6', blueHover: '#2563eb', purple: '#a855f7', orange: '#f97316', green: '#22c55e', red: '#ef4444', yellow: '#eab308',
}

type ChallengeType = 'fix-the-bug' | 'fill-the-blank' | 'code-review' | 'pair-programming' | null
interface ChallengeInfo { icon: string; title: string; description: string; xp: number; color: string }
type CodeRegion = { id: string; name: string; description: string; startMarker: string; endMarker: string; assignedTo: string | null; assignedName: string | null }

const CHALLENGES: Record<Exclude<ChallengeType, null>, ChallengeInfo> = {
  'fix-the-bug': { icon: '🐛', title: 'Fix the Bug', description: 'Find and fix the bugs together!', xp: 30, color: 'red' },
  'fill-the-blank': { icon: '📝', title: 'Fill the Blank', description: 'Complete the missing code!', xp: 25, color: 'yellow' },
  'code-review': { icon: '🔍', title: 'Code Review', description: 'Improve code quality!', xp: 20, color: 'green' },
  'pair-programming': { icon: '👯', title: 'Pair Programming', description: 'Solve problems together!', xp: 35, color: 'purple' },
}

const calculateRegionLines = (code: string, regionDefs: Omit<CodeRegion, 'assignedTo' | 'assignedName'>[]): Record<string, { start: number; end: number }> => {
  const lines = code.split('\n')
  const result: Record<string, { start: number; end: number }> = {}
  
  regionDefs.forEach(region => {
    let startLine = -1
    let braceCount = 0
    let endLine = -1
    
    // Find start line
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(region.startMarker)) {
        startLine = i + 1
        break
      }
    }
    
    // Find end line by counting braces
    if (startLine !== -1) {
      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i]
        // Count opening and closing braces
        for (const char of line) {
          if (char === '{') braceCount++
          if (char === '}') braceCount--
        }
        // When braces balance out after opening, we found the end
        if (braceCount === 0 && line.includes('}')) {
          endLine = i + 1
          break
        }
      }
    }
    
    if (startLine !== -1 && endLine !== -1) {
      result[region.id] = { start: startLine, end: endLine }
    }
  })
  
  return result
}

const getRegionColor = (regionId: string): string => {
  const colors: Record<string, string> = { 'A': '#3b82f6', 'B': '#22c55e', 'C': '#f97316', 'D': '#a855f7' }
  return colors[regionId] || '#6b7280'
}

const CHALLENGE_REGIONS: Record<Exclude<ChallengeType, null>, { starterCode: string; regions: Omit<CodeRegion, 'assignedTo' | 'assignedName'>[] }> = {
  'fix-the-bug': {
    starterCode: `// 🐛 Fix the Bug Challenge!
#include <iostream>
using namespace std;

int sumArray(int arr[], int size) {
    int sum = 0;
    for (int i = 0; i <= size; i++) { sum += arr[i]; } // BUG: i < size
    return sum;
}

void swap(int a, int b) { // BUG: need int& a, int& b
    int temp = a; a = b; b = temp;
}

int* createArray(int size) {
    int arr[size]; // BUG: local array
    for (int i = 0; i < size; i++) arr[i] = i * 2;
    return arr;
}

int main() {
    int nums[] = {1, 2, 3, 4, 5};
    cout << sumArray(nums, 5) << endl;
    return 0;
}
`,
    regions: [
      { id: 'A', name: 'sumArray', description: 'Fix loop', startMarker: 'int sumArray', endMarker: '}' },
      { id: 'B', name: 'swap', description: 'Fix refs', startMarker: 'void swap', endMarker: '}' },
      { id: 'C', name: 'createArray', description: 'Fix ptr', startMarker: 'int* createArray', endMarker: '}' },
      { id: 'D', name: 'main', description: 'Shared', startMarker: 'int main', endMarker: '}' },
    ],
  },
  'fill-the-blank': {
    starterCode: `// 📝 Fill the Blank!
#include <iostream>
using namespace std;

class Rectangle {
    double width, height;
public:
    Rectangle(double w, double h) { ___ = w; ___ = h; }
    double getArea() { return ___; }
    double getPerimeter() { return ___; }
};

int main() {
    Rectangle r(5, 3);
    cout << r.getArea() << endl;
    return 0;
}
`,
    regions: [
      { id: 'A', name: 'Constructor', description: 'Init', startMarker: 'Rectangle(double w', endMarker: '}' },
      { id: 'B', name: 'getArea', description: 'Area', startMarker: 'double getArea', endMarker: '}' },
      { id: 'C', name: 'getPerimeter', description: 'Perim', startMarker: 'double getPerimeter', endMarker: '}' },
      { id: 'D', name: 'main', description: 'Shared', startMarker: 'int main', endMarker: '}' },
    ],
  },
  'code-review': {
    starterCode: `// 🔍 Code Review!
#include <iostream>
using namespace std;

int f(int x[], int n) { int r=0; for(int i=0;i<n;i++) if(x[i]>r) r=x[i]; return r; }

class s { public: string n; int a; void p() { cout<<n<<a<<endl; } };

void process(int* arr, int sz) { int* c = new int[sz]; cout<<"Done"<<endl; }

int main() { int nums[]={5,2,9}; cout<<f(nums,3)<<endl; return 0; }
`,
    regions: [
      { id: 'A', name: 'findMax', description: 'Rename', startMarker: 'int f(int x[]', endMarker: '}' },
      { id: 'B', name: 'Student', description: 'Names', startMarker: 'class s', endMarker: '};' },
      { id: 'C', name: 'process', description: 'Memory', startMarker: 'void process', endMarker: '}' },
      { id: 'D', name: 'main', description: 'Shared', startMarker: 'int main', endMarker: '}' },
    ],
  },
  'pair-programming': {
    starterCode: `// 👯 Linked List!
#include <iostream>
using namespace std;
struct Node { int data; Node* next; Node(int v):data(v),next(nullptr){} };
class LinkedList {
    Node* head;
public:
    LinkedList():head(nullptr){}
    void insertAtEnd(int v) { /* TODO */ }
    void insertAtBeginning(int v) { /* TODO */ }
    void print() { /* TODO */ }
    void reverse() { /* TODO */ }
};
int main() { LinkedList l; l.insertAtEnd(1); l.print(); return 0; }
`,
    regions: [
      { id: 'A', name: 'insertEnd', description: 'End', startMarker: 'void insertAtEnd', endMarker: '}' },
      { id: 'B', name: 'insertBegin', description: 'Begin', startMarker: 'void insertAtBeginning', endMarker: '}' },
      { id: 'C', name: 'print', description: 'Print', startMarker: 'void print', endMarker: '}' },
      { id: 'D', name: 'reverse', description: 'Shared', startMarker: 'void reverse', endMarker: '}' },
    ],
  },
}

const LESSONS: Record<Exclude<ChallengeType, null>, { title: string; sections: { heading: string; content: string; code?: string }[] }> = {
  'fix-the-bug': {
    title: '🐛 Debugging C++',
    sections: [
      { heading: 'Overview', content: 'Debugging is the art of finding and fixing errors in code. In C++, common bugs include boundary errors in loops, incorrect parameter passing, and memory issues. Learning to spot these patterns will make you a stronger programmer.' },
      { heading: '📍 Array Bounds', content: 'Arrays in C++ use zero-based indexing. If you create an array with 5 elements, valid indices are 0, 1, 2, 3, and 4. Accessing index 5 goes beyond the array boundary, causing undefined behavior.',
        code: '// An array of size 5\nint arr[5] = {10, 20, 30, 40, 50};\n// Valid: arr[0] through arr[4]\n// Invalid: arr[5] - this is OUT OF BOUNDS!' },
      { heading: '📍 Pass by Value vs Reference', content: 'When you pass a variable to a function, C++ makes a copy by default. Changes inside the function don\'t affect the original. To modify the original variable, you need to pass by reference using the & symbol.',
        code: '// This does NOT modify x and y:\nvoid broken(int a, int b) { ... }\n\n// This DOES modify x and y:\nvoid working(int& a, int& b) { ... }' },
      { heading: '📍 Stack vs Heap Memory', content: 'Local variables live on the "stack" and are destroyed when the function ends. If you need data to persist after a function returns, allocate it on the "heap" using the new keyword.',
        code: '// BAD: arr is destroyed when function ends\nint* broken() {\n    int arr[10];\n    return arr; // Dangling pointer!\n}\n\n// GOOD: heap memory persists\nint* working() {\n    int* arr = new int[10];\n    return arr; // Valid pointer\n}' },
    ],
  },
  'fill-the-blank': {
    title: '📝 OOP in C++',
    sections: [
      { heading: 'Overview', content: 'Object-Oriented Programming organizes code into classes that bundle data (member variables) with functions that operate on that data (methods). This challenge focuses on constructors, member functions, and templates.' },
      { heading: '📍 Constructors', content: 'A constructor is a special method called automatically when you create an object. Its job is to initialize the object\'s member variables. Inside a constructor, you assign parameter values to member variables.',
        code: 'class Circle {\n    double radius;\npublic:\n    Circle(double r) {\n        radius = r; // Initialize member\n    }\n};' },
      { heading: '📍 Member Functions', content: 'Member functions can directly access the class\'s private variables. They perform calculations or operations using the object\'s data and return results.',
        code: 'class Circle {\n    double radius;\npublic:\n    double getCircumference() {\n        return 2 * 3.14159 * radius;\n    }\n};' },
      { heading: '📍 The Ternary Operator', content: 'The ternary operator is a compact way to write simple if-else statements. The syntax is: condition ? value_if_true : value_if_false',
        code: '// Instead of:\nif (a > b) return a;\nelse return b;\n\n// You can write:\nreturn (a > b) ? a : b;' },
    ],
  },
  'code-review': {
    title: '🔍 Code Quality',
    sections: [
      { heading: 'Overview', content: 'Good code is not just about working correctly—it should be readable, maintainable, and efficient. Code review focuses on improving naming, structure, and resource management.' },
      { heading: '📍 Meaningful Names', content: 'Variable and function names should describe their purpose. Single letters (except loop counters like i, j) make code hard to understand. Compare: "int f(int x[], int n)" vs "int findMax(int numbers[], int size)"',
        code: '// Hard to understand:\nint f(int x[], int n);\nint r = 0;\n\n// Self-documenting:\nint findMaximum(int values[], int count);\nint maxValue = 0;' },
      { heading: '📍 Class Design', content: 'Class members should be private by default, with public methods to access them. This "encapsulation" protects data and lets you change implementation details without breaking other code.',
        code: 'class Student {\nprivate:  // Data is protected\n    string name;\n    int age;\npublic:   // Controlled access\n    string getName() { return name; }\n    void setName(string n) { name = n; }\n};' },
      { heading: '📍 Memory Management', content: 'Every "new" must have a matching "delete". Memory allocated with new[] must be freed with delete[]. Forgetting to free memory causes "memory leaks" where your program slowly consumes more and more RAM.',
        code: '// Memory leak - copy is never freed!\nvoid leaky() {\n    int* data = new int[100];\n    // ... use data ...\n} // Oops! Forgot delete[]\n\n// Correct:\nvoid correct() {\n    int* data = new int[100];\n    // ... use data ...\n    delete[] data; // Clean up!\n}' },
    ],
  },
  'pair-programming': {
    title: '👯 Linked Lists',
    sections: [
      { heading: 'Overview', content: 'A linked list is a dynamic data structure where elements (nodes) are connected by pointers. Unlike arrays, nodes can be anywhere in memory—they\'re linked together like a chain.' },
      { heading: '📍 Node Structure', content: 'Each node contains two things: the data it stores, and a pointer to the next node. The last node points to nullptr (nothing), marking the end of the list.',
        code: 'struct Node {\n    int data;      // The value\n    Node* next;    // Points to next node\n};\n\n// A simple list: [5] -> [10] -> [15] -> nullptr' },
      { heading: '📍 Traversing a List', content: 'To visit every node, start at the head and follow the next pointers until you reach nullptr. This is the foundation for printing, searching, and other operations.',
        code: 'Node* current = head;\nwhile (current != nullptr) {\n    // Do something with current->data\n    current = current->next;\n}' },
      { heading: '📍 Inserting Nodes', content: 'To insert at the beginning: create a new node, point it to the current head, then update head. To insert at the end: traverse to the last node, then set its next pointer to the new node.',
        code: '// Insert at beginning:\nnewNode->next = head;\nhead = newNode;\n\n// Insert at end:\nlastNode->next = newNode;\nnewNode->next = nullptr;' },
      { heading: '📍 Reversing a List', content: 'Reversing requires three pointers: previous, current, and next. At each step, save the next node, reverse the current link, then advance all pointers.',
        code: 'Node* prev = nullptr;\nNode* curr = head;\nwhile (curr != nullptr) {\n    Node* next = curr->next; // Save\n    curr->next = prev;       // Reverse\n    prev = curr;             // Advance\n    curr = next;\n}\nhead = prev;' },
    ],
  },
}

function Arena() {
  const [secondsLeft, setSecondsLeft] = useState(300)
  const [showSummary, setShowSummary] = useState(false)
  const [roomName, setRoomName] = useState<string | null | undefined>(() => rtdbEnabled ? undefined : 'Offline Demo')
  const [participants, setParticipants] = useState<{id:string;name:string}[]>([])
  const [messages, setMessages] = useState<{id:string;text:string;authorName:string;createdAt?:number}[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [collaborators, setCollaborators] = useState<Set<string>>(new Set())
  const [output, setOutput] = useState('')
  const [saveStatus, setSaveStatus] = useState<'saved'|'saving'|'unsaved'>('saved')
  const [outputType, setOutputType] = useState<'success'|'error'|'info'|null>(null)
  const [showTerminal, setShowTerminal] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timerPaused, setTimerPaused] = useState(false)
  const [showHonorCode, setShowHonorCode] = useState(true)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [contrib, setContrib] = useState<Record<string,{name?:string;hasEdited?:boolean;hasChatted?:boolean}>>({})
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeType>(null)
  const [challengeLocked, setChallengeLocked] = useState(false)
  const [isFirstUser, setIsFirstUser] = useState(!rtdbEnabled)
  const [isRoomOwner, setIsRoomOwner] = useState(!rtdbEnabled)
  const [roomLocked, setRoomLocked] = useState(false) // Lock room when challenge starts
  const [roomStartTime, setRoomStartTime] = useState<number|null>(null)
  const [timerStartTime, setTimerStartTime] = useState<number|null>(!rtdbEnabled ? Date.now() : null)
  
  // Editor state - controlled component
  const [editorCode, setEditorCode] = useState('')
  const [editorReady, setEditorReady] = useState(false)
  
  // Region state
  const [regions, setRegions] = useState<CodeRegion[]>([])
  const [myRegion, setMyRegion] = useState<string|null>(null)
  const [regionLines, setRegionLines] = useState<Record<string,{start:number;end:number}>>({})
  const [showRegionWarning, setShowRegionWarning] = useState(false)
  const [warningMessage, setWarningMessage] = useState('')

  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const ydocRef = useRef<Y.Doc|null>(null)
  const providerRef = useRef<WebrtcProvider|null>(null)
  const yTextRef = useRef<Y.Text|null>(null)
  const lastEditTimeRef = useRef(0)
  const autoSaveTimeoutRef = useRef<number|null>(null)
  const decorationsRef = useRef<string[]>([])
  const isApplyingRemoteRef = useRef(false)
  const lastCodeRef = useRef('')
  const regionsRef = useRef<CodeRegion[]>([])
  const regionLinesRef = useRef<Record<string,{start:number;end:number}>>({})
  const myRegionRef = useRef<string|null>(null)
  const activeTimeIntervalRef = useRef<number|null>(null)
  
  const { roomId: paramRoomId } = useParams<{ roomId: string }>()
  const roomId = rtdbEnabled ? paramRoomId : (paramRoomId ?? 'offline-demo')
  const identity = useMemo(() => getIdentity(), [])

  useEffect(() => { regionsRef.current = regions }, [regions])
  useEffect(() => { regionLinesRef.current = regionLines }, [regionLines])
  useEffect(() => { myRegionRef.current = myRegion }, [myRegion])

  // Track active time every minute when in Arena with a challenge selected
  useEffect(() => {
    if (!selectedChallenge || !roomId) return
    
    // Record active time every minute
    activeTimeIntervalRef.current = window.setInterval(() => {
      recordActiveTime(roomId, 1)
    }, 60000) // 60 seconds
    
    return () => {
      if (activeTimeIntervalRef.current) {
        clearInterval(activeTimeIntervalRef.current)
      }
    }
  }, [selectedChallenge, roomId])

  const selectionTimeLeft = roomStartTime ? Math.max(0, 60 - Math.floor((Date.now() - roomStartTime) / 1000)) : 60
  // Allow anyone to select challenge if not locked yet (first person to click wins)
  const canChangeChallenge = !challengeLocked && selectionTimeLeft > 0
  const hasMeaningfulContribution = (userId: string) => contrib[userId]?.hasEdited || contrib[userId]?.hasChatted
  const everyoneContributed = participants.length > 0 && participants.every(p => hasMeaningfulContribution(p.id))
  // For testing: allow 1+ participants, for production use 2-4
  const participantCountOk = participants.length >= 1 && participants.length <= 4
  const canSubmit = participantCountOk && (everyoneContributed || participants.length === 1) && !isSubmitting

  const getStarterCode = useCallback((ch: ChallengeType) => ch ? CHALLENGE_REGIONS[ch]?.starterCode || '' : '', [])

  const updateContribution = async (partial: {hasEdited?:boolean;hasChatted?:boolean}) => {
    setContrib(prev => ({ ...prev, [identity.id]: { ...prev[identity.id], name: identity.name, ...partial } }))
    if (rtdbEnabled && db && roomId) {
      try { await set(ref(db, `rooms/${roomId}/contrib/${identity.id}`), { ...contrib[identity.id], name: identity.name, ...partial }) } catch {}
    }
  }

  useEffect(() => {
    if (selectedChallenge) {
      const code = getStarterCode(selectedChallenge)
      setEditorCode(code)
      lastCodeRef.current = code
    }
  }, [selectedChallenge, getStarterCode])

  useEffect(() => {
    if (!roomStartTime || challengeLocked) return
    const t = Math.max(0, 60000 - (Date.now() - roomStartTime))
    if (t <= 0) { setChallengeLocked(true); return }
    const timeout = setTimeout(() => setChallengeLocked(true), t)
    return () => clearTimeout(timeout)
  }, [roomStartTime, challengeLocked])

  const selectChallenge = async (ch: Exclude<ChallengeType, null>) => {
    if (!isRoomOwner) return // Only room owner can select
    if (!canChangeChallenge && selectedChallenge) return
    setSelectedChallenge(ch)
    setChallengeLocked(true) // Lock immediately when selected
    setRoomLocked(true) // Lock room - no new participants
    
    // Start the timer when challenge is selected
    const now = Date.now()
    setTimerStartTime(now)
    
    const code = CHALLENGE_REGIONS[ch]?.starterCode || ''
    setEditorCode(code)
    lastCodeRef.current = code
    if (rtdbEnabled && db && roomId) {
      try {
        await set(ref(db, `rooms/${roomId}/challenge`), { type: ch, selectedAt: serverTimestamp(), selectedBy: identity.name })
        await set(ref(db, `rooms/${roomId}/locked`), true) // Lock room in Firebase
        await set(ref(db, `rooms/${roomId}/timerStartTime`), now) // Start timer in Firebase
        await set(ref(db, `rooms/${roomId}/regions`), null)
        await set(ref(db, `code/${roomId}`), { content: code, lastSaved: serverTimestamp() })
        // Initialize room stats for team leaderboard
        const participantData = participants.length > 0 ? participants : [{ id: identity.id, name: identity.name }]
        await updateRoomStats(roomId, roomName || `Room ${roomId.slice(0, 6)}`, participantData.map(p => p.id), ch)
      } catch {}
    }
  }

  // Firebase listeners
  useEffect(() => {
    if (!rtdbEnabled || !db || !roomId) return
    const unsubs: (() => void)[] = []
    unsubs.push(onValue(ref(db, `rooms/${roomId}`), s => {
      const v = s.val()
      if (v?.startTime) setRoomStartTime(v.startTime)
      if (v?.timerStartTime) setTimerStartTime(v.timerStartTime)
      if (v?.createdBy === identity.id) {
        setIsFirstUser(true)
        setIsRoomOwner(true)
      }
      if (v?.locked) setRoomLocked(true)
    }))
    unsubs.push(onValue(ref(db, `rooms/${roomId}/challenge`), s => {
      const v = s.val()
      if (v?.type && CHALLENGES[v.type as Exclude<ChallengeType,null>]) {
        setSelectedChallenge(v.type)
        setChallengeLocked(true)
        setRoomLocked(true) // If challenge is set, room is locked
      }
    }))
    unsubs.push(onValue(ref(db, `rooms/${roomId}/contrib`), s => {
      const next: Record<string,any> = {}
      s.forEach(c => { next[c.key??''] = c.val() })
      setContrib(next)
    }))
    unsubs.push(onValue(ref(db, `rooms/${roomId}/submission`), s => {
      const v = s.val()
      if (v) {
        setOutput(v.output || '')
        setOutputType(v.outputType || null)
        setShowTerminal(true)
        if (v.timerPaused) setTimerPaused(true)
        if (v.result === 'success') { setShowSuccessModal(true); playVictory() }
      }
    }))
    return () => unsubs.forEach(u => u())
  }, [roomId, rtdbEnabled, identity.id])

  // Timer
  useEffect(() => {
    if (!timerStartTime || timerPaused) return
    const update = () => {
      const elapsed = Math.floor((Date.now() - timerStartTime) / 1000)
      const remaining = Math.max(0, 300 - elapsed)
      setSecondsLeft(remaining)
      if (remaining <= 0) setShowSummary(true)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [timerStartTime, timerPaused])

  // Y.js
  useEffect(() => {
    if (!roomId) return
    const ydoc = new Y.Doc()
    const provider = new WebrtcProvider(`codetogether-arena-${roomId}`, ydoc, {})
    const yText = ydoc.getText('monaco')
    ydocRef.current = ydoc
    providerRef.current = provider
    yTextRef.current = yText
    provider.awareness.setLocalStateField('user', { name: identity.name })
    const updateCollab = () => {
      const peers = new Set<string>()
      provider.awareness.getStates().forEach((s, id) => {
        if (id !== provider.awareness.clientID) peers.add((s.user as any)?.name || 'User')
      })
      setCollaborators(peers)
    }
    provider.awareness.on('change', updateCollab)
    const handleYjs = () => {
      if (isApplyingRemoteRef.current) return
      const content = yText.toString()
      if (content && content !== lastCodeRef.current) {
        isApplyingRemoteRef.current = true
        setEditorCode(content)
        lastCodeRef.current = content
        setTimeout(() => isApplyingRemoteRef.current = false, 50)
      }
    }
    yText.observe(handleYjs)
    return () => { yText.unobserve(handleYjs); provider.destroy(); ydoc.destroy() }
  }, [roomId, identity.name])

  const autoSaveCode = async (code: string) => {
    if (!roomId || !rtdbEnabled || !db) return
    setSaveStatus('saving')
    try { await set(ref(db, `code/${roomId}`), { content: code, lastSaved: serverTimestamp() }); setSaveStatus('saved') } catch { setSaveStatus('unsaved') }
  }

  // Load from Firebase
  useEffect(() => {
    if (!rtdbEnabled || !db || !roomId || !selectedChallenge) return
    return onValue(ref(db, `code/${roomId}`), s => {
      const v = s.val()
      if (v?.content && !isApplyingRemoteRef.current && v.content !== lastCodeRef.current) {
        isApplyingRemoteRef.current = true
        setEditorCode(v.content)
        lastCodeRef.current = v.content
        setTimeout(() => isApplyingRemoteRef.current = false, 50)
      }
    })
  }, [roomId, rtdbEnabled, selectedChallenge])

  // Room & presence
  useEffect(() => {
    if (!rtdbEnabled) { setParticipants([{ id: identity.id, name: identity.name }]); setRoomName('Offline Demo'); return }
    if (!roomId || !db) return
    const unsubs: (() => void)[] = []
    unsubs.push(onValue(ref(db, `rooms/${roomId}`), s => {
      const v = s.val()
      if (v) setRoomName(v.name ?? 'Room')
      else setRoomName(null)
    }))
    const presRef = ref(db, `presence/${roomId}/${identity.id}`)
    set(presRef, { name: identity.name, joinedAt: serverTimestamp() })
    onDisconnect(presRef).remove()
    const presenceUnsub = onValue(ref(db, `presence/${roomId}`), s => {
      const next: {id:string;name:string}[] = []
      s.forEach(c => { next.push({ id: c.key??'', name: (c.val() as any)?.name ?? 'Anon' }) })
      setParticipants(next)
    })
    unsubs.push(presenceUnsub)
    return () => { unsubs.forEach(u => u()); remove(presRef) }
  }, [roomId, identity, rtdbEnabled])

  // Chat
  useEffect(() => {
    if (!rtdbEnabled || !db || !roomId || roomName === null) return
    return onValue(ref(db, `chats/${roomId}`), s => {
      const next: {id:string;text:string;authorName:string;createdAt?:number}[] = []
      s.forEach(c => {
        const v = c.val() as any
        next.push({ id: c.key??'', text: v?.text??'', authorName: v?.authorName??'Anon', createdAt: v?.createdAt })
      })
      next.sort((a, b) => (a.createdAt??0) - (b.createdAt??0))
      setMessages(next)
    })
  }, [roomId, roomName, rtdbEnabled])

  // Regions
  useEffect(() => {
    if (!selectedChallenge || !CHALLENGE_REGIONS[selectedChallenge]) return
    const initial: CodeRegion[] = CHALLENGE_REGIONS[selectedChallenge].regions.map(r => ({ ...r, assignedTo: null, assignedName: null }))
    if (!rtdbEnabled || !db || !roomId) {
      initial[0].assignedTo = identity.id
      initial[0].assignedName = identity.name
      setRegions(initial)
      setMyRegion('A')
      return
    }
    return onValue(ref(db, `rooms/${roomId}/regions`), s => {
      const v = s.val()
      if (v) {
        const updated = initial.map(r => ({ ...r, assignedTo: v[r.id]?.assignedTo || null, assignedName: v[r.id]?.assignedName || null }))
        setRegions(updated)
        setMyRegion(updated.find(r => r.assignedTo === identity.id)?.id || null)
      } else {
        setRegions(initial)
        setMyRegion(null)
      }
    })
  }, [selectedChallenge, roomId, rtdbEnabled, identity.id, identity.name])

  // Auto-assign region based on team size
  useEffect(() => {
    if (!selectedChallenge || !regions.length || myRegion || !rtdbEnabled || !db || !roomId) return
    
    // Calculate regions per person based on team size
    const totalRegions = regions.length
    const teamSize = participants.length
    
    if (teamSize === 0) return
    
    // Regions per person = floor(totalRegions / teamSize)
    // Shared regions (unassigned) = totalRegions % teamSize
    const sharedRegionCount = totalRegions % teamSize
    
    // Get regions that should be assigned (not shared)
    const assignableRegions = regions.slice(0, totalRegions - sharedRegionCount)
    
    // Find next available region for this user
    const avail = assignableRegions.find(r => !r.assignedTo)
    if (avail) {
      set(ref(db, `rooms/${roomId}/regions/${avail.id}`), { assignedTo: identity.id, assignedName: identity.name })
    }
  }, [regions, myRegion, selectedChallenge, roomId, rtdbEnabled, identity, participants.length])

  // Calculate region lines
  useEffect(() => {
    if (!selectedChallenge || !editorCode) return
    const data = CHALLENGE_REGIONS[selectedChallenge]
    if (data) {
      const lines = calculateRegionLines(editorCode, data.regions)
      setRegionLines(lines)
      regionLinesRef.current = lines
    }
  }, [editorCode, selectedChallenge])

  const sendMessage = async (e?: FormEvent) => {
    e?.preventDefault()
    const text = messageInput.trim()
    if (!roomId || !text) return
    setMessageInput('')
    if (!rtdbEnabled || !db) {
      setMessages(prev => [...prev, { id: `${Date.now()}`, text, authorName: identity.name, createdAt: Date.now() }])
      updateContribution({ hasChatted: true })
      return
    }
    try {
      await set(push(ref(db, `chats/${roomId}`)), { text, authorName: identity.name, createdAt: serverTimestamp() })
      updateContribution({ hasChatted: true })
    } catch { setMessageInput(text) }
  }

  const mmss = useMemo(() => {
    const m = Math.floor(secondsLeft/60).toString().padStart(2,'0')
    const s = (secondsLeft%60).toString().padStart(2,'0')
    return `${m}:${s}`
  }, [secondsLeft])

  const submitCode = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setShowTerminal(true)
    setOutput('🔄 Compiling and running tests...')
    setOutputType('info')
    
    setTimeout(async () => {
      const starter = selectedChallenge ? CHALLENGE_REGIONS[selectedChallenge]?.starterCode : ''
      const starterLines = starter.split('\n')
      const currentLines = editorCode.split('\n')
      
      // Check specific fixes for fix-the-bug challenge
      let fixes: { name: string; fixed: boolean; hint: string }[] = []
      
      if (selectedChallenge === 'fix-the-bug') {
        // Check if i <= size was changed to i < size in sumArray function specifically
        // Find the sumArray function and check its for loop
        let sumArrayFixed = false
        for (let i = 0; i < currentLines.length; i++) {
          const line = currentLines[i]
          // If we're in sumArray function (look for the line with "int sum = 0;")
          if (line.includes('int sum = 0')) {
            // Check the next few lines for the for loop
            for (let j = i; j < Math.min(i + 3, currentLines.length); j++) {
              const forLine = currentLines[j]
              if (forLine.includes('for') && forLine.includes('i') && forLine.includes('size')) {
                // Must have "i < size" and NOT have "<="
                sumArrayFixed = forLine.includes('i < size') && !forLine.includes('<=')
                break
              }
            }
            break
          }
        }
        fixes.push({ name: 'sumArray loop bound', fixed: sumArrayFixed, hint: 'Change i <= size to i < size (off-by-one error)' })
        
        // Check if swap uses references
        const swapFixed = currentLines.some(l => l.includes('int&') && l.includes('swap'))
        fixes.push({ name: 'swap pass-by-reference', fixed: swapFixed, hint: 'Change (int a, int b) to (int& a, int& b)' })
        
        // Check if createArray uses dynamic allocation
        const createArrayFixed = currentLines.some(l => l.includes('new int[') || l.includes('new int ['))
        fixes.push({ name: 'createArray memory allocation', fixed: createArrayFixed, hint: 'Use int* arr = new int[size] instead of local array' })
      } else {
        // Generic check for other challenges
        const changedLines = currentLines.filter((l, i) => i < starterLines.length && l.trim() !== starterLines[i]?.trim()).length
        fixes.push({ name: 'Code modifications', fixed: changedLines >= 2, hint: 'Make at least 2 meaningful changes' })
      }
      
      const passedCount = fixes.filter(f => f.fixed).length
      const totalCount = fixes.length
      const allPassed = passedCount === totalCount
      
      if (allPassed) {
        const xp = selectedChallenge ? CHALLENGES[selectedChallenge]?.xp : 100
        const successMsg = `✅ All ${totalCount} tests passed!\n\n` +
          fixes.map(f => `✓ ${f.name}`).join('\n') +
          `\n\n🎉 Excellent work! Each team member earned +${xp} XP!`
        setOutput(successMsg)
        setOutputType('success')
        setTimerPaused(true)
        setShowSuccessModal(true)
        playSuccess()
        
        // Award XP to all participants in the room
        const participantIds = participants.map(p => p.id)
        await awardXPToAll(participantIds.length > 0 ? participantIds : [identity.id], xp)
        
        // Update room stats for team leaderboard
        if (rtdbEnabled && db && roomId) {
          await updateRoomStats(roomId, roomName || 'Room', participantIds.length > 0 ? participantIds : [identity.id], selectedChallenge || undefined)
        }
        
        if (rtdbEnabled && db && roomId) {
          await set(ref(db, `rooms/${roomId}/submission`), { output: successMsg, outputType: 'success', result: 'success', timerPaused: true })
        }
      } else {
        const failMsg = `❌ ${passedCount}/${totalCount} tests passed\n\n` +
          fixes.map(f => f.fixed ? `✓ ${f.name}` : `✗ ${f.name}\n   💡 ${f.hint}`).join('\n\n') +
          `\n\n📝 Fix the remaining issues and try again!`
        setOutput(failMsg)
        setOutputType('error')
        if (rtdbEnabled && db && roomId) {
          await set(ref(db, `rooms/${roomId}/submission`), { output: failMsg, outputType: 'error', result: 'failure', timerPaused: false })
        }
      }
      setIsSubmitting(false)
    }, 1500)
  }

  const tryAgain = async () => {
    const code = getStarterCode(selectedChallenge)
    setEditorCode(code)
    lastCodeRef.current = code
    if (yTextRef.current) { yTextRef.current.delete(0, yTextRef.current.length); yTextRef.current.insert(0, code) }
    setOutput('')
    setOutputType(null)
    setTimerPaused(false)
    setTimerStartTime(Date.now())
    if (rtdbEnabled && db && roomId) {
      await set(ref(db, `rooms/${roomId}/submission`), null)
      await set(ref(db, `code/${roomId}`), { content: code })
    }
  }

  const selectNewChallenge = async () => {
    setSelectedChallenge(null)
    setChallengeLocked(false)
    setOutput('')
    setOutputType(null)
    setTimerPaused(false)
    setRegions([])
    setMyRegion(null)
    setEditorCode('')
    setRoomStartTime(Date.now())
    setTimerStartTime(Date.now())
    if (rtdbEnabled && db && roomId) {
      await set(ref(db, `rooms/${roomId}/challenge`), null)
      await set(ref(db, `rooms/${roomId}/submission`), null)
      await set(ref(db, `rooms/${roomId}/regions`), null)
    }
    setContrib({})
  }

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value || isApplyingRemoteRef.current) return
    
    // Check region restriction if we have regions assigned
    const mr = myRegionRef.current
    const rl = regionLinesRef.current
    const rs = regionsRef.current
    
    if (rs.length > 0 && mr && lastCodeRef.current !== value) {
      // Find which lines were actually changed
      const oldLines = lastCodeRef.current.split('\n')
      const newLines = value.split('\n')
      let hasUnauthorizedChange = false
      
      for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
        if (oldLines[i] !== newLines[i]) {
          const changedLine = i + 1 // Monaco uses 1-based line numbers
          const myLines = rl[mr]
          
          // Check if line is in my assigned region
          const inMyRegion = myLines && changedLine >= myLines.start && changedLine <= myLines.end
          
          // Check if line is in any unassigned (shared) region
          let inSharedRegion = false
          for (const region of rs) {
            // A region is shared if it has no assignedTo value (null or undefined)
            if (region.assignedTo === null || region.assignedTo === undefined) {
              const sharedLines = rl[region.id]
              if (sharedLines && changedLine >= sharedLines.start && changedLine <= sharedLines.end) {
                inSharedRegion = true
                break
              }
            }
          }
          
          // Allow edit if in my region OR in any shared region
          if (!inMyRegion && !inSharedRegion) {
            hasUnauthorizedChange = true
            break
          }
        }
      }
      
      if (hasUnauthorizedChange) {
        // BLOCK the edit completely - don't accept it at all
        const sharedRegions = rs.filter(r => !r.assignedTo).map(r => r.id).join(', ')
        const allowedMsg = sharedRegions 
          ? `You can only edit Region ${mr} (${rs.find(r => r.id === mr)?.name}) and shared regions: ${sharedRegions}`
          : `You can only edit Region ${mr} (${rs.find(r => r.id === mr)?.name})`
        setWarningMessage(`⚠️ ${allowedMsg}!`)
        setShowRegionWarning(true)
        setTimeout(() => setShowRegionWarning(false), 2500)
        
        // Immediately restore previous code without syncing
        isApplyingRemoteRef.current = true
        if (editorRef.current && monacoRef.current) {
          const model = editorRef.current.getModel()
          if (model) {
            const currentPosition = editorRef.current.getPosition()
            model.setValue(lastCodeRef.current)
            if (currentPosition) editorRef.current.setPosition(currentPosition)
          }
        }
        setEditorCode(lastCodeRef.current)
        setTimeout(() => { isApplyingRemoteRef.current = false }, 50)
        return // Exit immediately - don't process this change
      }
    }
    
    // Accept the change
    setEditorCode(value)
    lastCodeRef.current = value
    
    // Sync to Y.js
    if (yTextRef.current && !isApplyingRemoteRef.current) {
      const yt = yTextRef.current
      if (value !== yt.toString()) { yt.delete(0, yt.length); yt.insert(0, value) }
    }
    
    // Track contribution
    const now = Date.now()
    if (now - lastEditTimeRef.current > 3000 && roomId) {
      lastEditTimeRef.current = now
      recordCodeEdit(roomId)
      updateContribution({ hasEdited: true })
    }
    
    // Auto-save
    setSaveStatus('unsaved')
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current)
    autoSaveTimeoutRef.current = window.setTimeout(() => autoSaveCode(value), 2000)
  }, [roomId, autoSaveCode, updateContribution])

  const updateDecorations = useCallback(() => {
    if (!editorRef.current || !monacoRef.current || !selectedChallenge) return
    const data = CHALLENGE_REGIONS[selectedChallenge]
    if (!data) return
    const rs = regionsRef.current, rl = regionLinesRef.current
    if (!rs.length) return
    const monaco = monacoRef.current, editor = editorRef.current
    const decs: any[] = []
    rs.forEach(r => {
      const li = rl[r.id]
      if (!li) return
      decs.push({ range: new monaco.Range(li.start, 1, li.end, 1), options: { isWholeLine: true, linesDecorationsClassName: `region-line-${r.id}` } })
      if (r.assignedTo === identity.id) decs.push({ range: new monaco.Range(li.start, 1, li.end, 1), options: { isWholeLine: true, className: 'my-region-bg' } })
    })
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decs)
  }, [selectedChallenge, identity.id])

  useEffect(() => {
    if (!editorReady) return
    updateDecorations()
    const i = setInterval(updateDecorations, 1000)
    return () => clearInterval(i)
  }, [editorReady, updateDecorations, regions, regionLines])

  // Inject CSS for region line decorations
  useEffect(() => {
    const styleId = 'region-decoration-styles'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = `
      .my-region-bg { background-color: rgba(59, 130, 246, 0.08) !important; }
      .region-line-A { border-left: 4px solid #3b82f6 !important; margin-left: 3px; }
      .region-line-B { border-left: 4px solid #22c55e !important; margin-left: 3px; }
      .region-line-C { border-left: 4px solid #f97316 !important; margin-left: 3px; }
      .region-line-D { border-left: 4px solid #a855f7 !important; margin-left: 3px; }
    `
    return () => { if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl) }
  }, [])

  const s: Record<string, CSSProperties> = {
    container: { height: 'calc(100vh - 80px)', maxWidth: '1600px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' },
    mainGrid: { flex: 1, display: 'flex', gap: '12px', minHeight: 0, overflow: 'hidden' },
    lessonPanel: { display: 'flex', flexDirection: 'column', borderRadius: '10px', overflow: 'hidden', backgroundColor: c.card, border: `1px solid ${c.border}`, width: '400px', minWidth: '260px', flexShrink: 0 },
    editorPanel: { flex: 1, display: 'flex', flexDirection: 'column', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#1e1e1e', minWidth: '300px' },
    chatPanel: { display: 'flex', flexDirection: 'column', borderRadius: '10px', overflow: 'hidden', backgroundColor: c.card, border: `1px solid ${c.border}`, width: '320px', flexShrink: 0 },
    btn: { padding: '8px 14px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
    badge: { display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 600 },
    modal: { position: 'fixed' as const, inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)' },
    modalContent: { width: '100%', maxWidth: '360px', backgroundColor: c.card, borderRadius: '12px', overflow: 'hidden' },
  }

  if (!roomId) return <div style={{ padding: '32px' }}><h1 style={{ color: c.text }}>Arena</h1><p style={{ color: c.textMuted }}>Go to <Link to="/" style={{ color: c.blue }}>Lobby</Link></p></div>
  if (roomName === undefined) return <div style={{ padding: '32px' }}><h1 style={{ color: c.text }}>Loading...</h1></div>
  if (roomName === null) return <div style={{ padding: '32px' }}><h1 style={{ color: c.text }}>Room not found</h1></div>

  if (!selectedChallenge) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: `1px solid ${c.border}` }}>
          <div><h1 style={{ color: c.text, fontSize: '18px', margin: 0 }}>{roomName}</h1><p style={{ color: c.textDim, fontSize: '11px', margin: '2px 0 0' }}>{roomId}</p></div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isRoomOwner && <span style={{ ...s.badge, backgroundColor: 'rgba(168,85,247,0.15)', color: c.purple }}>👑 Host</span>}
            <span style={{ ...s.badge, backgroundColor: 'rgba(34,197,94,0.15)', color: c.green }}>{participants.length} online</span>
            <span style={{ fontFamily: 'monospace', color: c.textMuted, fontSize: '14px' }}>{mmss}</span>
          </div>
        </div>
        <h2 style={{ textAlign: 'center', fontSize: '24px', color: c.text, marginBottom: '8px' }}>Choose a Challenge</h2>
        <p style={{ textAlign: 'center', color: c.textMuted, fontSize: '13px', marginBottom: '20px' }}>
          {isRoomOwner ? 'Select a challenge to start. The room will lock when you begin!' : 'Waiting for the room host to select a challenge...'}
        </p>
        
        {!isRoomOwner && (
          <div style={{ padding: '16px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '10px', marginBottom: '20px', textAlign: 'center' }}>
            <p style={{ color: c.blue, fontSize: '13px', margin: 0 }}>💡 Only the room creator can select challenges. You'll join automatically when they start!</p>
          </div>
        )}
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {(Object.entries(CHALLENGES) as [Exclude<ChallengeType,null>, ChallengeInfo][]).map(([key, ch]) => {
            const colors: Record<string,string> = { red: c.red, yellow: c.yellow, green: c.green, purple: c.purple }
            const accent = colors[ch.color] || c.blue
            const canClick = isRoomOwner
            return (
              <button key={key} onClick={() => canClick && selectChallenge(key)} disabled={!canClick}
                style={{ padding: '16px', border: `2px solid ${accent}40`, borderRadius: '10px', textAlign: 'left', backgroundColor: `${accent}08`, cursor: canClick ? 'pointer' : 'not-allowed', opacity: canClick ? 1 : 0.6, transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '28px' }}>{ch.icon}</span>
                  <div><h3 style={{ color: c.text, fontSize: '16px', fontWeight: 700, margin: 0 }}>{ch.title}</h3><span style={{ ...s.badge, backgroundColor: `${accent}20`, color: accent }}>+{ch.xp} XP</span></div>
                </div>
                <p style={{ color: c.textMuted, fontSize: '12px', margin: 0 }}>{ch.description}</p>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const info = CHALLENGES[selectedChallenge]
  const colors: Record<string,string> = { red: c.red, yellow: c.yellow, green: c.green, purple: c.purple }
  const accent = colors[info.color] || c.blue

  if (showHonorCode) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
      <div style={{ width: '100%', maxWidth: '512px', backgroundColor: c.card, borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: `1px solid ${c.border}`, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(to right, #2563eb, #4f46e5)', padding: '20px 24px', color: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>📜</div>
          <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Academic Honor Code</h3>
        </div>
        
        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          <p style={{ color: c.textMuted, marginBottom: '16px', lineHeight: 1.5 }}>
            By participating in this collaborative coding session, I pledge to uphold academic integrity:
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ color: c.green, fontSize: '18px', flexShrink: 0 }}>✓</span>
              <div>
                <span style={{ fontWeight: 600, color: c.text }}>No AI Assistance: </span>
                <span style={{ color: c.textMuted }}>I will not use ChatGPT, Copilot, or any AI tools to generate code.</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ color: c.green, fontSize: '18px', flexShrink: 0 }}>✓</span>
              <div>
                <span style={{ fontWeight: 600, color: c.text }}>Original Work: </span>
                <span style={{ color: c.textMuted }}>All code I contribute is my own understanding and effort.</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ color: c.green, fontSize: '18px', flexShrink: 0 }}>✓</span>
              <div>
                <span style={{ fontWeight: 600, color: c.text }}>Collaboration Only: </span>
                <span style={{ color: c.textMuted }}>I will only discuss and work with my assigned partner(s).</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ color: c.green, fontSize: '18px', flexShrink: 0 }}>✓</span>
              <div>
                <span style={{ fontWeight: 600, color: c.text }}>Learning Focus: </span>
                <span style={{ color: c.textMuted }}>My goal is to learn and understand, not just to complete tasks.</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div style={{ borderTop: `1px solid ${c.border}`, padding: '16px 24px' }}>
          <button 
            onClick={() => setShowHonorCode(false)} 
            style={{ width: '100%', padding: '12px 24px', backgroundColor: c.blue, color: '#fff', borderRadius: '8px', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', transition: 'background-color 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = c.blueHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = c.blue}
          >
            I Agree to the Honor Code
          </button>
        </div>
      </div>
    </div>
  )

  if (showSuccessModal) return (
    <div style={s.modal}>
      <div style={{ ...s.modalContent, border: `3px solid ${c.green}` }}>
        <div style={{ background: `linear-gradient(135deg, ${c.green}, #10b981)`, padding: '28px', textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: '56px' }}>🎉</div>
          <h2 style={{ fontSize: '22px', margin: '8px 0 0' }}>Complete!</h2>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={() => { setShowSuccessModal(false); selectNewChallenge() }} style={{ ...s.btn, background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: '#fff', width: '100%', padding: '12px' }}>New Challenge</button>
          <button onClick={() => { setShowSuccessModal(false); tryAgain() }} style={{ ...s.btn, backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}`, width: '100%' }}>Try Again</button>
          <button onClick={() => setShowSuccessModal(false)} style={{ ...s.btn, backgroundColor: 'transparent', color: c.textDim, width: '100%' }}>Continue</button>
        </div>
      </div>
    </div>
  )

  if (showSummary) return (
    <div style={s.modal}>
      <div style={s.modalContent}>
        <div style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', padding: '20px', textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: '40px' }}>⏰</div>
          <h3 style={{ fontSize: '18px', margin: '8px 0 0' }}>Time's Up!</h3>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={() => { setShowSummary(false); selectNewChallenge() }} style={{ ...s.btn, backgroundColor: c.blue, color: '#fff', width: '100%' }}>New Challenge</button>
          <button onClick={() => { setShowSummary(false); setTimerPaused(true) }} style={{ ...s.btn, backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}`, width: '100%' }}>Review Code</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={s.container}>
      
      {/* Region Warning Toast */}
      {showRegionWarning && (
        <div style={{ 
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', 
          padding: '12px 24px', backgroundColor: '#dc2626', color: '#fff', 
          borderRadius: '8px', fontWeight: 600, fontSize: '14px', zIndex: 9999,
          boxShadow: '0 4px 20px rgba(220,38,38,0.4)'
        }}>
          {warningMessage}
        </div>
      )}
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: `${accent}12`, border: `2px solid ${accent}40`, borderRadius: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>{info.icon}</span>
          <div><h2 style={{ color: c.text, fontSize: '16px', margin: 0 }}>{info.title}</h2><p style={{ color: c.textMuted, fontSize: '11px', margin: 0 }}>{info.description}</p></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {timerPaused && outputType === 'success' && (
            <button onClick={selectNewChallenge} style={{ ...s.btn, background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: '#fff' }}>
              ✨ New Challenge
            </button>
          )}
          <span style={{ ...s.badge, backgroundColor: `${accent}20`, color: accent }}>+{info.xp} XP</span>
          {roomLocked && <span style={{ ...s.badge, backgroundColor: 'rgba(234,179,8,0.15)', color: c.yellow }}>🔒 Locked</span>}
          <span style={{ ...s.badge, backgroundColor: 'rgba(34,197,94,0.15)', color: c.green }}>{participants.length} online</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: timerPaused ? c.green : secondsLeft <= 60 ? c.red : c.text }}>{mmss}</span>
        </div>
      </div>

      {/* Regions */}
      {regions.length > 0 && (
        <div style={{ display: 'flex', gap: '6px' }}>
          {regions.map(r => {
            const col = getRegionColor(r.id)
            const isMe = r.assignedTo === identity.id
            const isShared = !r.assignedTo // Unassigned regions are shared
            return (
              <div key={r.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 10px', borderRadius: '8px', backgroundColor: isMe ? `${col}15` : isShared ? 'rgba(168,85,247,0.08)' : c.card, border: `2px solid ${isMe ? col : isShared ? c.purple+'40' : c.border}`, minWidth: '50px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: col, marginBottom: '3px' }} />
                <span style={{ fontWeight: 700, color: isMe ? col : c.text, fontSize: '12px' }}>{r.id}</span>
                <span style={{ fontSize: '8px', color: c.textDim, textAlign: 'center' }}>{r.name}</span>
                <span style={{ fontSize: '7px', color: isMe ? col : isShared ? c.purple : c.textDim }}>{isMe ? 'YOU' : isShared ? 'SHARED' : r.assignedName?.split(' ')[0] || '—'}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Main */}
      <div style={s.mainGrid}>
        {/* Lesson */}
        <div style={s.lessonPanel}>
          <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
            <h2 style={{ color: '#fff', fontSize: '14px', margin: 0 }}>{LESSONS[selectedChallenge]?.title}</h2>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            {LESSONS[selectedChallenge]?.sections.map((section, i) => (
              <div key={i} style={{ marginBottom: '18px' }}>
                <h3 style={{ color: i === 0 ? c.purple : c.blue, fontSize: '12px', marginBottom: '6px', fontWeight: 600 }}>{section.heading}</h3>
                <p style={{ color: c.textMuted, fontSize: '11px', lineHeight: 1.6, margin: 0 }}>{section.content}</p>
                {section.code && (
                  <pre style={{ backgroundColor: '#1e1e2e', color: '#a6e3a1', fontSize: '10px', padding: '10px', borderRadius: '6px', marginTop: '8px', overflowX: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.4 }}>{section.code}</pre>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div style={s.editorPanel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: `1px solid ${c.border}`, backgroundColor: c.card }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: c.text, fontWeight: 600, fontSize: '13px' }}>Editor</span>
              <span style={{ ...s.badge, backgroundColor: 'rgba(59,130,246,0.2)', color: c.blue }}>C++</span>
              {myRegion && <span style={{ ...s.badge, backgroundColor: `${getRegionColor(myRegion)}20`, color: getRegionColor(myRegion) }}>Region {myRegion}</span>}
              {saveStatus === 'saved' && <span style={{ fontSize: '10px', color: c.green }}>✓</span>}
            </div>
            <button onClick={submitCode} disabled={!canSubmit} style={{ ...s.btn, backgroundColor: !canSubmit ? c.border : c.green, color: !canSubmit ? c.textDim : '#fff', cursor: !canSubmit ? 'not-allowed' : 'pointer' }}>
              {isSubmitting ? '...' : '📤 Submit'}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Editor
              height="100%"
              language="cpp"
              value={editorCode}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', automaticLayout: true }}
              onMount={(ed, mon) => { editorRef.current = ed; monacoRef.current = mon; setEditorReady(true) }}
              onChange={handleEditorChange}
            />
          </div>
          {showTerminal && (
            <div style={{ borderTop: `1px solid ${c.border}`, height: '120px', backgroundColor: outputType === 'error' ? 'rgba(239,68,68,0.08)' : outputType === 'success' ? 'rgba(34,197,94,0.08)' : c.card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: '11px', color: c.textMuted }}>Terminal</span>
                <button onClick={() => setShowTerminal(false)} style={{ fontSize: '10px', color: c.textDim, background: 'none', border: 'none', cursor: 'pointer' }}>▼</button>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '11px', padding: '10px', overflowY: 'auto', height: 'calc(100% - 28px)', color: outputType === 'error' ? '#fca5a5' : outputType === 'success' ? '#86efac' : c.textMuted }}>
                {output || <span style={{ fontStyle: 'italic' }}>Submit to grade</span>}
              </div>
            </div>
          )}
          {!showTerminal && <button onClick={() => setShowTerminal(true)} style={{ padding: '8px', borderTop: `1px solid ${c.border}`, backgroundColor: c.card, color: c.textDim, fontSize: '11px', border: 'none', cursor: 'pointer' }}>▲ Terminal</button>}
        </div>

        {/* Chat */}
        <div style={s.chatPanel}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${c.border}`, backgroundColor: c.bg }}>
            <h2 style={{ fontSize: '12px', color: c.text, margin: '0 0 6px' }}>👥 Team ({participants.length})</h2>
            <div style={{ maxHeight: '60px', overflowY: 'auto' }}>
              {participants.map(p => {
                const isYou = p.id === identity.id
                const reg = regions.find(r => r.assignedTo === p.id)
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 6px', borderRadius: '4px', border: `1px solid ${isYou ? c.blue+'40' : c.border}`, marginBottom: '3px', backgroundColor: c.card }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: c.green }} />
                    <span style={{ flex: 1, fontSize: '11px', color: hasMeaningfulContribution(p.id) ? c.green : c.text }}>{p.name}{isYou ? ' (You)' : ''}</span>
                    {reg && <span style={{ fontSize: '9px', color: getRegionColor(reg.id), fontWeight: 700 }}>{reg.id}</span>}
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ padding: '6px 12px', borderBottom: `1px solid ${c.border}`, backgroundColor: c.card }}>
            <span style={{ fontSize: '11px', color: c.textMuted }}>💬 Chat</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
            {messages.map(m => (
              <div key={m.id} style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '10px', color: c.textDim, margin: '0 0 1px' }}>{m.authorName}</p>
                <p style={{ fontSize: '12px', color: c.text, margin: 0 }}>{m.text}</p>
              </div>
            ))}
            {messages.length === 0 && <p style={{ color: c.textDim, fontSize: '11px', textAlign: 'center' }}>Say hi! 👋</p>}
          </div>
          <div style={{ padding: '10px 14px', borderTop: `1px solid ${c.border}`, backgroundColor: c.bg }}>
            <form onSubmit={sendMessage} style={{ display: 'flex', gap: '6px' }}>
              <input value={messageInput} onChange={e => setMessageInput(e.target.value)} placeholder="Message..." style={{ flex: 1, padding: '8px 10px', backgroundColor: c.bg, border: `1px solid ${c.border}`, borderRadius: '6px', color: c.text, fontSize: '12px', outline: 'none' }} />
              <button type="submit" disabled={!messageInput.trim()} style={{ ...s.btn, backgroundColor: c.blue, color: '#fff', opacity: messageInput.trim() ? 1 : 0.5 }}>→</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Arena