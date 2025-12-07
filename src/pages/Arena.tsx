import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, CSSProperties } from 'react'
import Editor from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { Link, useParams } from 'react-router-dom'
import { db, rtdbEnabled } from '../lib/firebase.ts'
import { getIdentity } from '../lib/identity.ts'
import { recordCollaboration, recordCodeEdit, recordChatMessage, recordActiveTime, updateRoomStats, incrementRoomMessages } from '../lib/stats.ts'
import { onDisconnect, onValue, push, ref, remove, serverTimestamp, set } from 'firebase/database'
import { playVictory } from '../lib/sounds.ts'

// Color palette
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
  yellow: '#eab308',
}

// Challenge type definitions
type ChallengeType = 'fix-the-bug' | 'fill-the-blank' | 'code-review' | 'pair-programming' | null

interface ChallengeInfo {
  icon: string
  title: string
  description: string
  xp: number
  color: string
  starterCode: string
  variants?: string[]
}

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

int sumArray(int arr[], int size) {
    int sum = 0;
    for (int i = 0; i <= size; i++) {
        sum += arr[i];
    }
    return sum;
}

void swap(int a, int b) {
    int temp = a;
    a = b;
    b = temp;
}

int* createArray(int size) {
    int arr[size];
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
    variants: []
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
    Rectangle(double w, double h) {
        ___ = w;
        ___ = h;
    }

    double getArea() {
        return ___;
    }

    double getPerimeter() {
        return ___;
    }
};

template <typename T>
T findMax(T a, T b) {
    return ___;
}

int main() {
    Rectangle rect(5.0, 3.0);
    cout << "Area: " << rect.getArea() << endl;
    cout << "Perimeter: " << rect.getPerimeter() << endl;
    cout << "Max of 10 and 20: " << findMax(10, 20) << endl;
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

#include <iostream>
using namespace std;

int f(int x[], int n) {
    int r = 0;
    for (int i = 0; i < n; i++) {
        if (x[i] > r) {
            r = x[i];
        }
    }
    return r;
}

class s {
public:
    string n;
    int a;
    float g;
    
    void p() {
        cout << n << " " << a << " " << g << endl;
    }
};

void process(int* arr, int size) {
    int* copy = new int[size];
    for (int i = 0; i < size; i++) {
        copy[i] = arr[i] * 2;
    }
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
// Implement a simple linked list together

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
    
    void insertAtEnd(int value) {
        // Your code here
    }
    
    void insertAtBeginning(int value) {
        // Your code here
    }
    
    void print() {
        // Your code here
    }
    
    void reverse() {
        // Your code here
    }
    
    ~LinkedList() {
        // Your code here
    }
};

int main() {
    LinkedList list;
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
    title: 'Lesson: Debugging C++ Code',
    subtitle: 'Master the art of finding and fixing common programming errors.',
    sections: [
      { heading: '🎯 What is Debugging?', content: 'Debugging is the systematic process of finding and resolving bugs in code.', bullets: ['Read error messages carefully', 'Use print statements to trace flow', 'Check boundary conditions'] },
      { heading: 'Common C++ Bugs', content: 'Most bugs fall into predictable categories:', bullets: ['Off-by-one errors in loops', 'Pass-by-value vs pass-by-reference', 'Memory management problems'] },
    ],
  },
  'fill-the-blank': {
    title: 'Lesson: Object-Oriented Programming',
    subtitle: 'Master classes, constructors, and templates in C++.',
    sections: [
      { heading: '🎯 What is OOP?', content: 'Object-Oriented Programming organizes code around objects that combine data and behavior.', bullets: ['Encapsulation', 'Abstraction', 'Inheritance', 'Polymorphism'] },
    ],
  },
  'code-review': {
    title: 'Lesson: Code Quality & Best Practices',
    subtitle: 'Write clean, maintainable, and efficient C++ code.',
    sections: [
      { heading: '🎯 What Makes Good Code?', content: 'Good code is readable, maintainable, and efficient.', bullets: ['Use descriptive names', 'Follow naming conventions', 'Avoid memory leaks'] },
    ],
  },
  'pair-programming': {
    title: 'Lesson: Linked Lists',
    subtitle: 'Master this fundamental dynamic data structure.',
    sections: [
      { heading: '🎯 What is a Linked List?', content: 'A linked list is a linear data structure where elements are stored in nodes.', bullets: ['Dynamic size', 'O(1) insertion/deletion', 'O(n) access time'] },
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
  const [output, setOutput] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [outputType, setOutputType] = useState<'success' | 'error' | 'info' | null>(null)
  const [showTerminal, setShowTerminal] = useState(true)
  const [submissionResult, setSubmissionResult] = useState<'success' | 'failure' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timerPaused, setTimerPaused] = useState(false)
  const [showHonorCode, setShowHonorCode] = useState(true)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [contrib, setContrib] = useState<Record<string, { name?: string; hasEdited?: boolean; hasChatted?: boolean }>>({})
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeType>(null)
  const [challengeLocked, setChallengeLocked] = useState(false)
  const [isFirstUser, setIsFirstUser] = useState(!rtdbEnabled)
  const [roomStartTime, setRoomStartTime] = useState<number | null>(!rtdbEnabled ? Date.now() : null)
  const [timerStartTime, setTimerStartTime] = useState<number | null>(!rtdbEnabled ? Date.now() : null)

  const editorRef = useRef<any>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<WebrtcProvider | null>(null)
  const yTextRef = useRef<Y.Text | null>(null)
  const collaborationRecordedRef = useRef<string | null>(null)
  const activeTimeIntervalRef = useRef<number | null>(null)
  const lastEditTimeRef = useRef<number>(0)
  const autoSaveTimeoutRef = useRef<number | null>(null)
  const { roomId: paramRoomId } = useParams<{ roomId: string }>()
  const roomId = rtdbEnabled ? paramRoomId : (paramRoomId ?? 'offline-demo')
  const identity = useMemo(() => getIdentity(), [])

  const selectionTimeLeft = roomStartTime ? Math.max(0, 60 - Math.floor((Date.now() - roomStartTime) / 1000)) : 60
  const canChangeChallenge = isFirstUser && !challengeLocked && selectionTimeLeft > 0

  const hasMeaningfulContribution = (userId: string) => {
    const ct = contrib[userId]
    return ct?.hasEdited || ct?.hasChatted
  }
  const everyoneContributed = participants.length > 0 && participants.every((p) => hasMeaningfulContribution(p.id))
  const participantCountOk = participants.length >= 2 && participants.length <= 4
  const canSubmit = participantCountOk && everyoneContributed && !isSubmitting

  const getStarterCode = (challenge: ChallengeType) => {
    if (challenge && CHALLENGES[challenge]) {
      const challengeData = CHALLENGES[challenge]
      if (challengeData.variants && challengeData.variants.length > 0) {
        return getRandomVariant(challengeData.variants, challengeData.starterCode)
      }
      return challengeData.starterCode
    }
    return `// Work together here!\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n`
  }

  const updateContribution = async (partial: { hasEdited?: boolean; hasChatted?: boolean }) => {
    setContrib((prev) => ({
      ...prev,
      [identity.id]: { ...prev[identity.id], name: identity.name, ...partial },
    }))
    if (rtdbEnabled && db && roomId) {
      try {
        const existing = contrib[identity.id] || {}
        await set(ref(db, `rooms/${roomId}/contrib/${identity.id}`), { ...existing, name: identity.name, ...partial })
      } catch (error) {
        console.error('Failed to update contribution', error)
      }
    }
  }

  useEffect(() => {
    if (!roomStartTime || challengeLocked) return
    const timeUntilLock = Math.max(0, 60000 - (Date.now() - roomStartTime))
    if (timeUntilLock <= 0) {
      setChallengeLocked(true)
      return
    }
    const timeout = setTimeout(() => setChallengeLocked(true), timeUntilLock)
    return () => clearTimeout(timeout)
  }, [roomStartTime, challengeLocked])

  const selectChallenge = async (challenge: Exclude<ChallengeType, null>) => {
    if (participants.length < 2) return
    if (!canChangeChallenge && selectedChallenge) return
    setSelectedChallenge(challenge)
    if (editorRef.current && yTextRef.current) {
      const starterCode = getStarterCode(challenge)
      yTextRef.current.delete(0, yTextRef.current.length)
      yTextRef.current.insert(0, starterCode)
      editorRef.current.setValue(starterCode)
    }
    if (rtdbEnabled && db && roomId) {
      try {
        await set(ref(db, `rooms/${roomId}/challenge`), { type: challenge, selectedAt: serverTimestamp(), selectedBy: identity.name })
      } catch (error) {
        console.error('Failed to save challenge:', error)
      }
    }
  }

  useEffect(() => {
    if (!rtdbEnabled || !db || !roomId) return
    const roomRef = ref(db, `rooms/${roomId}`)
    const roomUnsub = onValue(roomRef, (snapshot) => {
      const val = snapshot.val()
      if (val?.startTime) setRoomStartTime(val.startTime)
      if (val?.timerStartTime) setTimerStartTime(val.timerStartTime)
      else if (val?.startTime) setTimerStartTime(val.startTime)
      if (val?.createdBy === identity.id) setIsFirstUser(true)
    })
    const challengeRef = ref(db, `rooms/${roomId}/challenge`)
    const challengeUnsub = onValue(challengeRef, (snapshot) => {
      const val = snapshot.val()
      if (val?.type && CHALLENGES[val.type as Exclude<ChallengeType, null>]) {
        setSelectedChallenge(val.type as ChallengeType)
      }
    })
    const contribRef = ref(db, `rooms/${roomId}/contrib`)
    const contribUnsub = onValue(contribRef, (snapshot) => {
      const next: Record<string, any> = {}
      snapshot.forEach((child) => { next[child.key ?? ''] = child.val() })
      setContrib(next)
    })
    const submissionRef = ref(db, `rooms/${roomId}/submission`)
    const submissionUnsub = onValue(submissionRef, (snapshot) => {
      const val = snapshot.val()
      if (val) {
        setOutput(val.output || '')
        setOutputType(val.outputType || null)
        setSubmissionResult(val.result || null)
        setShowTerminal(true)
        if (val.timerPaused) setTimerPaused(true)
        if (val.result === 'success') { setShowSuccessModal(true); playVictory() }
      }
    })
    return () => { roomUnsub(); challengeUnsub(); contribUnsub(); submissionUnsub() }
  }, [roomId, rtdbEnabled, identity.id])

  useEffect(() => {
    if (!roomId || !timerStartTime || timerPaused) return
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - timerStartTime) / 1000)
      const remaining = Math.max(0, 5 * 60 - elapsed)
      setSecondsLeft(remaining)
      if (remaining <= 0) setShowSummary(true)
    }
    updateTimer()
    const id = setInterval(updateTimer, 1000)
    return () => clearInterval(id)
  }, [roomId, timerStartTime, timerPaused])

  useEffect(() => { setShowSummary(false) }, [roomId])

  useEffect(() => {
    if (!roomId) return
    const ydoc = new Y.Doc()
    const room = `codetogether-arena-${roomId}`
    const provider = new WebrtcProvider(room, ydoc, {})
    const yText = ydoc.getText('monaco')
    ydocRef.current = ydoc
    providerRef.current = provider
    yTextRef.current = yText
    provider.awareness.setLocalStateField('user', { name: identity.name, color: `hsl(${identity.id.charCodeAt(0) * 137.5 % 360}, 70%, 50%)` })
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
    return () => { provider.awareness.off('change', updateCollaborators); provider.destroy(); ydoc.destroy() }
  }, [roomId])

  const autoSaveCode = async (code: string) => {
    if (!roomId || !rtdbEnabled || !db) return
    setSaveStatus('saving')
    try {
      await set(ref(db, `code/${roomId}`), { content: code, lastSaved: serverTimestamp(), savedBy: identity.name })
      setSaveStatus('saved')
    } catch (error) {
      console.error('Failed to save code:', error)
      setSaveStatus('unsaved')
    }
  }

  useEffect(() => {
    if (!rtdbEnabled || !db || !roomId) return
    const codeRef = ref(db, `code/${roomId}`)
    const unsubscribe = onValue(codeRef, (snapshot) => {
      const val = snapshot.val()
      if (val?.content && editorRef.current && yTextRef.current) {
        const savedCode = val.content as string
        const currentCode = editorRef.current.getValue()
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
    if (!roomId || !db) return
    setRoomName(undefined)
    const roomRef = ref(db, `rooms/${roomId}`)
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const val = snapshot.val()
      if (val) setRoomName(val.name ?? 'Untitled Room')
      else setRoomName(null)
    })
    return () => unsubscribe()
  }, [roomId, identity, rtdbEnabled])

  useEffect(() => {
    if (!rtdbEnabled) {
      if (roomId && collaborationRecordedRef.current !== roomId) {
        collaborationRecordedRef.current = roomId
        recordCollaboration()
      }
      return
    }
    if (!db || !roomId || roomName === undefined || roomName === null) return
    if (collaborationRecordedRef.current !== roomId) {
      collaborationRecordedRef.current = roomId
      recordCollaboration()
    }
    const presenceRef = ref(db, `presence/${roomId}/${identity.id}`)
    set(presenceRef, { name: identity.name, joinedAt: serverTimestamp() })
    onDisconnect(presenceRef).remove()
    const listRef = ref(db, `presence/${roomId}`)
    const unsubscribe = onValue(listRef, (snapshot) => {
      const next: Array<{ id: string; name: string }> = []
      snapshot.forEach((child) => {
        const val = child.val() as { name?: string }
        next.push({ id: child.key ?? '', name: val?.name ?? 'Anonymous' })
      })
      setParticipants(next)
      if (roomName && next.length > 0) updateRoomStats(roomId, roomName, next.map(p => p.id))
    })
    activeTimeIntervalRef.current = window.setInterval(() => {
      if (roomId && roomName) recordActiveTime(roomId, 1)
    }, 60000)
    return () => {
      unsubscribe()
      if (activeTimeIntervalRef.current) clearInterval(activeTimeIntervalRef.current)
      remove(presenceRef)
    }
  }, [roomId, identity, roomName, rtdbEnabled])

  useEffect(() => {
    if (!rtdbEnabled || !db || !roomId || roomName === null) return
    const chatRef = ref(db, `chats/${roomId}`)
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const next: Array<{ id: string; text: string; authorName: string; createdAt?: number }> = []
      snapshot.forEach((child) => {
        const val = child.val() as { text?: string; authorName?: string; createdAt?: number }
        next.push({ id: child.key ?? '', text: val?.text ?? '', authorName: val?.authorName ?? 'Anonymous', createdAt: val?.createdAt })
      })
      next.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      setMessages(next)
    })
    return () => unsubscribe()
  }, [roomId, roomName, rtdbEnabled])

  const sendMessage = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const textToSend = messageInput.trim()
    if (!roomId || !textToSend) return
    setMessageInput('')
    if (roomId) { recordChatMessage(roomId); if (rtdbEnabled) incrementRoomMessages(roomId) }
    if (!rtdbEnabled || !db) {
      setMessages((prev) => [...prev, { id: `offline-${Date.now()}`, text: textToSend, authorName: identity.name, createdAt: Date.now() }])
      updateContribution({ hasChatted: true })
      return
    }
    try {
      const messagesRef = push(ref(db, `chats/${roomId}`))
      await set(messagesRef, { text: textToSend, authorId: identity.id, authorName: identity.name, createdAt: serverTimestamp() })
      updateContribution({ hasChatted: true })
    } catch (error) {
      console.error('Failed to send message:', error)
      setMessageInput(textToSend)
    }
  }

  const mmss = useMemo(() => {
    const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
    const s = (secondsLeft % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }, [secondsLeft])

  const saveSubmissionToFirebase = async (outputText: string, type: 'success' | 'error' | 'info', result: 'success' | 'failure' | null, pauseTimer: boolean) => {
    if (rtdbEnabled && db && roomId) {
      try {
        await set(ref(db, `rooms/${roomId}/submission`), { output: outputText, outputType: type, result, timerPaused: pauseTimer, submittedBy: identity.name, submittedAt: serverTimestamp() })
      } catch (error) {
        console.error('Failed to save submission:', error)
      }
    }
  }

  const submitCode = () => {
    if (!editorRef.current || isSubmitting) return
    if (!participantCountOk) { setOutput('🚫 Need 2-4 participants to submit.'); setOutputType('error'); setShowTerminal(true); return }
    if (!everyoneContributed) { setOutput('🚫 Everyone must contribute before submitting.'); setOutputType('error'); setShowTerminal(true); return }
    setIsSubmitting(true)
    setShowTerminal(true)
    const loadingOutput = '🔄 Submitting code for grading...\n\nRunning test cases...'
    setOutput(loadingOutput)
    setOutputType('info')
    setSubmissionResult(null)
    saveSubmissionToFirebase(loadingOutput, 'info', null, false)
    const code = editorRef.current.getValue()
    setTimeout(async () => {
      const testsTotal = 5
      const testsPassed = Math.random() > 0.3 ? testsTotal : Math.floor(Math.random() * 4) + 1
      const isSuccess = testsPassed === testsTotal
      if (isSuccess) {
        const xpEarned = selectedChallenge ? CHALLENGES[selectedChallenge]?.xp || 100 : 100
        const successOutput = `✅ SUCCESS! All tests passed!\n\n📊 Test Results: ${testsPassed}/${testsTotal} passed\n\n🎉 Congratulations! You earned +${xpEarned} XP!\n⏱️ Timer stopped! Great teamwork!`
        setOutput(successOutput); setOutputType('success'); setSubmissionResult('success'); setTimerPaused(true); setShowSuccessModal(true)
        await saveSubmissionToFirebase(successOutput, 'success', 'success', true)
      } else {
        const failOutput = `❌ FAILED - Some tests did not pass\n\n📊 Test Results: ${testsPassed}/${testsTotal} passed\n\n💡 Hint: Review your logic for edge cases.`
        setOutput(failOutput); setOutputType('error'); setSubmissionResult('failure')
        await saveSubmissionToFirebase(failOutput, 'error', 'failure', false)
      }
      setIsSubmitting(false)
    }, 1500)
  }

  const tryAgain = async () => {
    if (!editorRef.current || !yTextRef.current) return
    const starterCode = getStarterCode(selectedChallenge)
    yTextRef.current.delete(0, yTextRef.current.length)
    yTextRef.current.insert(0, starterCode)
    editorRef.current.setValue(starterCode)
    setSubmissionResult(null); setOutput(''); setOutputType(null); setTimerPaused(false); setShowTerminal(true)
    const newTimerStart = Date.now()
    setTimerStartTime(newTimerStart)
    if (rtdbEnabled && db && roomId) {
      try {
        await set(ref(db, `rooms/${roomId}/submission`), null)
        await set(ref(db, `rooms/${roomId}/timerStartTime`), newTimerStart)
      } catch (error) { console.error('Failed to reset:', error) }
    }
  }

  const selectNewChallenge = async () => {
    setSelectedChallenge(null); setChallengeLocked(false); setSubmissionResult(null); setOutput(''); setOutputType(null); setTimerPaused(false)
    if (editorRef.current && yTextRef.current) {
      const placeholder = '// Waiting for the next challenge...\n'
      yTextRef.current.delete(0, yTextRef.current.length)
      yTextRef.current.insert(0, placeholder)
      editorRef.current.setValue(placeholder)
    }
    const newStartTime = Date.now()
    setRoomStartTime(newStartTime); setTimerStartTime(newStartTime)
    if (rtdbEnabled && db && roomId) {
      try {
        await set(ref(db, `rooms/${roomId}/challenge`), null)
        await set(ref(db, `rooms/${roomId}/submission`), null)
        await set(ref(db, `rooms/${roomId}/timerStartTime`), newStartTime)
        await set(ref(db, `rooms/${roomId}/startTime`), newStartTime)
      } catch (error) { console.error('Failed to reset:', error) }
    }
    setContrib({})
  }

  // Styles
  const s: Record<string, CSSProperties> = {
    container: { height: 'calc(100vh - 120px)', maxWidth: '1400px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
    challengeHeader: { padding: '12px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
    roomInfo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
    mainGrid: { flex: 1, display: 'flex', gap: '12px', minHeight: 0, overflow: 'hidden' },
    lessonPanel: { display: 'flex', flexDirection: 'column', borderRadius: '8px', overflow: 'hidden', backgroundColor: c.card, border: `1px solid ${c.border}`, width: '300px', minWidth: '250px', maxWidth: '400px' },
    lessonHeader: { padding: '16px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', flexShrink: 0 },
    lessonContent: { flex: 1, overflowY: 'auto', padding: '16px' },
    editorPanel: { flex: 1, display: 'flex', flexDirection: 'column', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#1e1e1e', minWidth: '400px' },
    editorHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${c.border}`, backgroundColor: c.card, flexShrink: 0 },
    terminal: { borderTop: `1px solid ${c.border}`, flexShrink: 0, height: '160px' },
    chatPanel: { display: 'flex', flexDirection: 'column', borderRadius: '8px', overflow: 'hidden', backgroundColor: c.card, border: `1px solid ${c.border}`, width: '280px', minWidth: '250px', maxWidth: '350px' },
    participantsSection: { padding: '12px', borderBottom: `1px solid ${c.border}`, backgroundColor: c.bg, flexShrink: 0 },
    chatMessages: { flex: 1, overflowY: 'auto', padding: '12px' },
    chatInput: { padding: '12px', borderTop: `1px solid ${c.border}`, backgroundColor: c.bg, flexShrink: 0 },
    btn: { padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
    btnPrimary: { backgroundColor: c.blue, color: '#fff' },
    btnSuccess: { backgroundColor: c.green, color: '#fff' },
    input: { width: '100%', padding: '10px 12px', backgroundColor: c.bg, border: `1px solid ${c.border}`, borderRadius: '8px', color: c.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const },
    modal: { position: 'fixed' as const, inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' },
    modalContent: { width: '100%', maxWidth: '500px', backgroundColor: c.card, borderRadius: '16px', overflow: 'hidden', border: `1px solid ${c.border}` },
    badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 },
  }

  // Loading states
  if (!roomId) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '12px' }}>Collaborative Arena</h1>
        <p style={{ color: c.textMuted }}>Choose a room from the <Link to="/" style={{ color: c.blue }}>Lobby</Link> or create a new one.</p>
      </div>
    )
  }

  if (roomName === undefined) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600 }}>Loading room…</h1>
        <p style={{ color: c.textMuted }}>Preparing your collaborative space.</p>
      </div>
    )
  }

  if (roomName === null) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600 }}>Room not found</h1>
        <p style={{ color: c.textMuted }}>Return to the <Link to="/" style={{ color: c.blue }}>Lobby</Link> to join an active room.</p>
      </div>
    )
  }

  // Challenge selector
  if (!selectedChallenge) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: `1px solid ${c.border}`, marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>{roomName}</h1>
            <p style={{ fontSize: '12px', color: c.textDim, margin: '4px 0 0' }}>Room ID: {roomId}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ ...s.badge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: c.green }}>{participants.length} online</span>
            <span style={{ fontFamily: 'monospace', color: c.textMuted }}>{mmss}</span>
          </div>
        </div>

        {participants.length < 2 && (
          <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(234, 179, 8, 0.1)', border: `1px solid rgba(234, 179, 8, 0.3)`, color: '#fbbf24', marginBottom: '16px', fontSize: '14px' }}>
            Need at least 2 participants to start. Invite a teammate!
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 700, background: 'linear-gradient(135deg, #3b82f6, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 8px' }}>Choose a Collaborative Activity</h2>
          <p style={{ color: c.textMuted }}>{isFirstUser ? `Select an activity. You have ${selectionTimeLeft}s to decide!` : 'Waiting for host to select...'}</p>
          {isFirstUser && selectionTimeLeft > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
              <div style={{ width: '120px', height: '8px', backgroundColor: c.border, borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #a855f7)', borderRadius: '4px', transition: 'width 1s', width: `${(selectionTimeLeft / 60) * 100}%` }} />
              </div>
              <span style={{ fontSize: '12px', color: c.textDim }}>{selectionTimeLeft}s</span>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {(Object.entries(CHALLENGES) as [Exclude<ChallengeType, null>, ChallengeInfo][]).map(([key, challenge]) => {
            const colorMap: Record<string, string> = { red: c.red, yellow: c.yellow, green: c.green, purple: c.purple }
            const accentColor = colorMap[challenge.color] || c.blue
            return (
              <button
                key={key}
                type="button"
                onClick={() => isFirstUser && participantCountOk && selectChallenge(key)}
                disabled={!isFirstUser || !participantCountOk}
                style={{
                  padding: '20px',
                  border: `2px solid ${accentColor}40`,
                  borderRadius: '12px',
                  textAlign: 'left',
                  backgroundColor: `${accentColor}10`,
                  cursor: isFirstUser && participantCountOk ? 'pointer' : 'not-allowed',
                  opacity: isFirstUser && participantCountOk ? 1 : 0.6,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '32px' }}>{challenge.icon}</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontWeight: 700, fontSize: '18px', color: c.text, margin: 0 }}>{challenge.title}</h3>
                    <span style={{ ...s.badge, backgroundColor: `${accentColor}20`, color: accentColor, marginTop: '4px' }}>+{challenge.xp} XP</span>
                  </div>
                </div>
                <p style={{ fontSize: '14px', color: c.textMuted, margin: 0 }}>{challenge.description}</p>
              </button>
            )
          })}
        </div>

        {!isFirstUser && (
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', marginTop: '24px' }}>
            <p style={{ fontSize: '14px', color: '#60a5fa', margin: 0 }}>💡 The room host will select an activity. You'll automatically join!</p>
          </div>
        )}
      </div>
    )
  }

  const challengeInfo = CHALLENGES[selectedChallenge]
  const colorMap: Record<string, string> = { red: c.red, yellow: c.yellow, green: c.green, purple: c.purple }
  const accentColor = colorMap[challengeInfo.color] || c.blue

  // Honor Code Modal
  if (showHonorCode) {
    return (
      <div style={s.modal}>
        <div style={s.modalContent}>
          <div style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', padding: '24px', textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>📜</div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Academic Honor Code</h3>
          </div>
          <div style={{ padding: '24px' }}>
            <p style={{ color: c.textMuted, marginBottom: '16px' }}>By participating, I pledge to uphold academic integrity:</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {['No AI Assistance', 'Original Work', 'Collaboration Only', 'Learning Focus'].map((item, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ color: c.green, fontSize: '18px' }}>✓</span>
                  <span style={{ color: c.text, fontWeight: 500 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${c.border}` }}>
            <button type="button" onClick={() => setShowHonorCode(false)} style={{ ...s.btn, ...s.btnPrimary, width: '100%', padding: '12px' }}>
              I Agree to the Honor Code
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Success Modal
  if (showSuccessModal) {
    const xpEarned = challengeInfo?.xp || 100
    return (
      <div style={s.modal}>
        <div style={{ ...s.modalContent, border: `4px solid ${c.green}` }}>
          <div style={{ background: `linear-gradient(135deg, ${c.green}, #10b981)`, padding: '32px', textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: '72px', marginBottom: '12px' }}>🎉</div>
            <h2 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 8px' }}>Challenge Complete!</h2>
            <p style={{ opacity: 0.9 }}>All tests passed! Amazing teamwork!</p>
          </div>
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginBottom: '16px' }}>
              <div><div style={{ fontSize: '32px', fontWeight: 700, color: c.green }}>+{xpEarned}</div><div style={{ fontSize: '12px', color: c.textDim }}>XP Earned</div></div>
              <div><div style={{ fontSize: '32px', fontWeight: 700, color: c.blue }}>⏱️ {mmss}</div><div style={{ fontSize: '12px', color: c.textDim }}>Time Left</div></div>
            </div>
            <p style={{ color: c.textMuted, fontWeight: 500 }}>What would you like to do next?</p>
          </div>
          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button type="button" onClick={() => { setShowSuccessModal(false); selectNewChallenge() }} style={{ ...s.btn, width: '100%', padding: '14px', background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: '#fff', fontWeight: 700 }}>🎯 Try a New Challenge</button>
            <button type="button" onClick={() => { setShowSuccessModal(false); tryAgain() }} style={{ ...s.btn, width: '100%', padding: '14px', backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>🔄 Practice Again</button>
            <button type="button" onClick={() => setShowSuccessModal(false)} style={{ ...s.btn, width: '100%', padding: '12px', backgroundColor: 'transparent', color: c.textDim }}>Continue in session</button>
          </div>
        </div>
      </div>
    )
  }

  // Summary Modal
  if (showSummary) {
    return (
      <div style={s.modal}>
        <div style={s.modalContent}>
          <div style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', padding: '24px', textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>⏰</div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Time's Up!</h3>
          </div>
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ color: c.textMuted, fontSize: '18px' }}>Great effort! Your session has ended.</p>
          </div>
          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button type="button" onClick={() => { setShowSummary(false); selectNewChallenge() }} style={{ ...s.btn, ...s.btnPrimary, width: '100%', padding: '14px' }}>🎯 Try Another Challenge</button>
            <Link to="/flashcards" style={{ ...s.btn, width: '100%', padding: '14px', backgroundColor: 'rgba(168, 85, 247, 0.15)', color: c.purple, textAlign: 'center', textDecoration: 'none', display: 'block', borderRadius: '8px' }}>📚 Review Flashcards</Link>
            <button type="button" onClick={() => setShowSummary(false)} style={{ ...s.btn, width: '100%', padding: '14px', backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>Review Code</button>
          </div>
        </div>
      </div>
    )
  }

  // Main Arena UI
  return (
    <div style={s.container}>
      {/* Challenge Header */}
      <div style={{ ...s.challengeHeader, backgroundColor: `${accentColor}15`, border: `2px solid ${accentColor}40` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '28px' }}>{challengeInfo.icon}</span>
          <div>
            <h2 style={{ fontWeight: 700, color: c.text, margin: 0 }}>{challengeInfo.title}</h2>
            <p style={{ fontSize: '12px', color: c.textMuted, margin: '2px 0 0' }}>{challengeInfo.description}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ ...s.badge, backgroundColor: `${accentColor}20`, color: accentColor, fontWeight: 700 }}>+{challengeInfo.xp} XP</span>
          {challengeLocked && <span style={{ ...s.badge, backgroundColor: c.bg, color: c.textDim }}>🔒 Locked</span>}
        </div>
      </div>

      {/* Room Info Bar */}
      <div style={s.roomInfo}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>{roomName}</h1>
          <p style={{ fontSize: '12px', color: c.textDim, margin: '2px 0 0' }}>Room ID: {roomId}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
          <span style={{ ...s.badge, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: c.green }}>👥 {participants.length} online</span>
          {collaborators.size > 0 && <span style={{ ...s.badge, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: c.blue }}>✏️ {collaborators.size} editing</span>}
          <span style={{ ...s.badge, backgroundColor: everyoneContributed ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)', color: everyoneContributed ? c.green : c.yellow }}>
            Contrib: {participants.filter(p => hasMeaningfulContribution(p.id)).length}/{participants.length || 1}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '100px', height: '8px', backgroundColor: c.border, borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', backgroundColor: timerPaused ? c.green : secondsLeft <= 60 ? c.red : c.blue, borderRadius: '4px', transition: 'width 1s', width: `${(secondsLeft / 300) * 100}%` }} />
            </div>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: timerPaused ? c.green : secondsLeft <= 60 ? c.red : c.text }}>{mmss}</span>
            {timerPaused && <span style={{ color: c.green }}>✓</span>}
          </div>
          {saveStatus === 'saving' && <span style={{ fontSize: '12px', color: c.blue }}>Saving...</span>}
          {saveStatus === 'saved' && <span style={{ fontSize: '12px', color: c.green }}>✓ Saved</span>}
        </div>
      </div>

      {/* Main Content */}
      <div style={s.mainGrid}>
        {/* Lesson Panel */}
        <div style={s.lessonPanel}>
          <div style={s.lessonHeader}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: 0 }}>{LESSONS[selectedChallenge]?.title || 'Lesson'}</h2>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', margin: '4px 0 0' }}>{LESSONS[selectedChallenge]?.subtitle}</p>
          </div>
          <div style={s.lessonContent}>
            {LESSONS[selectedChallenge]?.sections.map((section, idx) => (
              <div key={idx} style={{ marginBottom: '20px' }}>
                <h3 style={{ fontWeight: 600, color: c.text, marginBottom: '8px' }}>{section.heading}</h3>
                <p style={{ fontSize: '14px', color: c.textMuted, marginBottom: '8px' }}>{section.content}</p>
                {section.bullets && (
                  <ul style={{ listStyle: 'disc', paddingLeft: '20px', margin: 0 }}>
                    {section.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} style={{ fontSize: '13px', color: c.textMuted, marginBottom: '4px' }}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {section.code && (
                  <pre style={{ backgroundColor: '#0d0d0d', color: c.green, fontSize: '12px', padding: '12px', borderRadius: '8px', overflow: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{section.code}</pre>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Editor Panel */}
        <div style={s.editorPanel}>
          <div style={s.editorHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, color: c.text }}>Code Editor</span>
              <span style={{ ...s.badge, backgroundColor: 'rgba(59, 130, 246, 0.2)', color: c.blue }}>C++</span>
            </div>
            <button
              type="button"
              onClick={submitCode}
              disabled={!canSubmit}
              style={{ ...s.btn, ...(canSubmit ? s.btnSuccess : {}), backgroundColor: canSubmit ? c.green : c.border, color: canSubmit ? '#fff' : c.textDim, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            >
              {isSubmitting ? '⏳ Grading...' : '📤 Submit Code'}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Editor
              height="100%"
              defaultLanguage="cpp"
              defaultValue={getStarterCode(selectedChallenge)}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: 'on' }}
              onMount={(editor) => {
                editorRef.current = editor
                const yText = yTextRef.current
                if (!yText) return
                const initialText = yText.toString()
                if (initialText) editor.setValue(initialText)
                else {
                  const starterCode = getStarterCode(selectedChallenge)
                  editor.setValue(starterCode)
                  yText.insert(0, starterCode)
                }
                let isApplyingRemote = false
                const applyFromY = () => {
                  isApplyingRemote = true
                  const text = yText.toString()
                  if (text !== editor.getValue()) editor.setValue(text)
                  isApplyingRemote = false
                }
                yText.observe(applyFromY)
                editor.onDidChangeModelContent(() => {
                  if (isApplyingRemote) return
                  const currentValue = editor.getValue()
                  if (currentValue !== yText.toString()) {
                    yText.delete(0, yText.length)
                    if (currentValue) yText.insert(0, currentValue)
                    const now = Date.now()
                    if (now - lastEditTimeRef.current > 3000 && roomId) {
                      lastEditTimeRef.current = now
                      recordCodeEdit(roomId)
                      updateContribution({ hasEdited: true })
                    }
                    setSaveStatus('unsaved')
                    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current)
                    autoSaveTimeoutRef.current = window.setTimeout(() => autoSaveCode(currentValue), 2000)
                  }
                })
              }}
            />
          </div>
          {showTerminal && (
            <div style={{ ...s.terminal, backgroundColor: outputType === 'error' ? 'rgba(239, 68, 68, 0.1)' : outputType === 'success' ? 'rgba(34, 197, 94, 0.1)' : c.card }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: `1px solid ${c.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, color: c.textMuted, fontSize: '14px' }}>📟 Terminal</span>
                  {outputType === 'error' && <span style={{ ...s.badge, backgroundColor: 'rgba(239, 68, 68, 0.2)', color: c.red }}>❌ Failed</span>}
                  {outputType === 'success' && <span style={{ ...s.badge, backgroundColor: 'rgba(34, 197, 94, 0.2)', color: c.green }}>✅ Passed</span>}
                </div>
                <button type="button" onClick={() => setShowTerminal(false)} style={{ fontSize: '12px', color: c.textDim, background: 'none', border: 'none', cursor: 'pointer' }}>▼ Collapse</button>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', padding: '12px', overflowY: 'auto', height: 'calc(100% - 40px)', color: outputType === 'error' ? '#fca5a5' : outputType === 'success' ? '#86efac' : c.textMuted }}>
                {output ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{output}</pre> : <span style={{ fontStyle: 'italic' }}>Click "Submit Code" to grade your solution.</span>}
              </div>
            </div>
          )}
          {!showTerminal && (
            <button type="button" onClick={() => setShowTerminal(true)} style={{ padding: '10px 16px', borderTop: `1px solid ${c.border}`, backgroundColor: c.card, color: c.textDim, fontSize: '14px', border: 'none', cursor: 'pointer', textAlign: 'left' }}>▲ Show Terminal</button>
          )}
        </div>

        {/* Chat Panel */}
        <div style={s.chatPanel}>
          <div style={s.participantsSection}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Participants ({participants.length})</h2>
            <div style={{ maxHeight: '80px', overflowY: 'auto' }}>
              {participants.map((p) => {
                const isYou = p.id === identity.id
                const hasContrib = hasMeaningfulContribution(p.id)
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', border: `1px solid ${isYou ? c.blue + '40' : c.border}`, marginBottom: '4px', backgroundColor: c.card }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: c.green }} />
                    <span style={{ flex: 1, fontSize: '13px', color: hasContrib ? c.green : c.text, fontWeight: hasContrib ? 600 : 400 }}>{p.name}{isYou ? ' (You)' : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.border}`, backgroundColor: c.card }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: c.textDim }}>💬 Team Chat</span>
          </div>
          <div style={s.chatMessages}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ marginBottom: '12px' }}>
                <p style={{ fontWeight: 600, fontSize: '12px', color: c.textDim, margin: '0 0 2px' }}>{msg.authorName}</p>
                <p style={{ fontSize: '14px', color: c.text, margin: 0 }}>{msg.text}</p>
              </div>
            ))}
            {messages.length === 0 && <p style={{ color: c.textDim, fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>No messages yet</p>}
          </div>
          <div style={s.chatInput}>
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(e) }} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message..."
                style={{ ...s.input, flex: 1 }}
              />
              <button type="submit" disabled={!messageInput.trim()} style={{ ...s.btn, ...s.btnPrimary, opacity: messageInput.trim() ? 1 : 0.5 }}>Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Arena