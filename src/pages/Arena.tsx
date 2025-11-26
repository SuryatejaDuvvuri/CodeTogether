import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Editor from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { Link, useParams } from 'react-router-dom'
import { db, rtdbEnabled } from '../lib/firebase.ts'
import { getIdentity } from '../lib/identity.ts'
import { recordCollaboration, recordCodeEdit, recordChatMessage, recordActiveTime, updateRoomStats, incrementRoomMessages, getCurrentUserStats } from '../lib/stats.ts'
import { onDisconnect, onValue, push, ref, remove, serverTimestamp, set } from 'firebase/database'

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
	const [isRunning, setIsRunning] = useState(false)
	const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
	const [outputType, setOutputType] = useState<'success' | 'error' | 'info' | null>(null)
	const [showTerminal, setShowTerminal] = useState(true)
	const [userStats, setUserStats] = useState<ReturnType<typeof getCurrentUserStats> | null>(null)
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

	useEffect(() => {
		if (!roomId) return
		const id = setInterval(() => {
			setSecondsLeft((s) => {
				if (s <= 1) {
					clearInterval(id)
					setShowSummary(true)
					return 0
				}
				return s - 1
			})
		}, 1000)
		return () => clearInterval(id)
	}, [roomId])

	useEffect(() => {
		setSecondsLeft(5 * 60)
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
	set(presenceRef, {
		name: identity.name,
		joinedAt: serverTimestamp(),
	})
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
	
	return () => {
		unsubscribe()
		if (activeTimeIntervalRef.current) {
			clearInterval(activeTimeIntervalRef.current)
			activeTimeIntervalRef.current = null
		}
		remove(presenceRef).catch(() => {
			// ignore if already removed
		})
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
			setUserStats(getCurrentUserStats()) // Update stats display
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

	// Check syntax before running
	const checkSyntax = (code: string): { valid: boolean; error?: string } => {
		try {
			// Try to parse the code
			new Function(code)
			return { valid: true }
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}

	// Run JavaScript code
	const runCode = () => {
		if (!editorRef.current || isRunning) return
		
		setIsRunning(true)
		setShowTerminal(true)
		setOutput('')
		setOutputType(null)
		
		const code = editorRef.current.getValue()
		
		// Check syntax first
		const syntaxCheck = checkSyntax(code)
		if (!syntaxCheck.valid) {
			setOutput(`Syntax Error: ${syntaxCheck.error}`)
			setOutputType('error')
			setIsRunning(false)
			return
		}
		
		try {
			// Capture console.log, console.error, console.warn output
			const logs: string[] = []
			const errors: string[] = []
			const warnings: string[] = []
			
			const originalLog = console.log
			const originalError = console.error
			const originalWarn = console.warn
			
			console.log = (...args: any[]) => {
				logs.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '))
				originalLog(...args)
			}
			
			console.error = (...args: any[]) => {
				errors.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '))
				originalError(...args)
			}
			
			console.warn = (...args: any[]) => {
				warnings.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '))
				originalWarn(...args)
			}
			
			// Execute code in a try-catch to handle errors
			try {
				// Use Function constructor for safer execution
				const result = new Function(code)()
				
				// Restore console methods
				console.log = originalLog
				console.error = originalError
				console.warn = originalWarn
				
				// Build output
				let outputText = ''
				let hasOutput = false
				
				if (errors.length > 0) {
					outputText += `❌ Errors:\n${errors.join('\n')}\n\n`
					setOutputType('error')
					hasOutput = true
				}
				
				if (warnings.length > 0) {
					outputText += `⚠️  Warnings:\n${warnings.join('\n')}\n\n`
					if (!hasOutput) setOutputType('info')
					hasOutput = true
				}
				
				if (logs.length > 0) {
					outputText += logs.join('\n')
					if (!hasOutput) setOutputType('success')
					hasOutput = true
				} else if (result !== undefined) {
					outputText += String(result)
					if (!hasOutput) setOutputType('success')
					hasOutput = true
				}
				
				if (!hasOutput) {
					outputText = '✓ Code compiled and executed successfully (no output)'
					setOutputType('success')
				}
				
				setOutput(outputText)
			} catch (error) {
				// Restore console methods
				console.log = originalLog
				console.error = originalError
				console.warn = originalWarn
				
				setOutput(`❌ Runtime Error: ${error instanceof Error ? error.message : String(error)}`)
				setOutputType('error')
			}
		} catch (error) {
			setOutput(`❌ Execution Error: ${error instanceof Error ? error.message : String(error)}`)
			setOutputType('error')
		} finally {
			setIsRunning(false)
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

	return (
		<div className="h-[calc(100vh-120px)] mx-auto max-w-6xl p-4 space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between bg-white dark:bg-neutral-900 rounded-lg border px-4 py-3 shadow-sm">
				<div>
					<h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{roomName}</h1>
					<p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Room ID: {roomId.slice(0, 20)}...</p>
				</div>
				<div className="flex items-center gap-3">
					{collaborators.size > 0 && (
						<span className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold flex items-center gap-1.5">
							<span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
							{collaborators.size} {collaborators.size === 1 ? 'peer' : 'peers'} editing
						</span>
					)}
					<div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full">
						<span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{participants.length} online</span>
					</div>
					<div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full">
						<span className="text-xs text-neutral-600 dark:text-neutral-400">Timer:</span>
						<span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{mmss}</span>
					</div>
					{saveStatus === 'saving' && (
						<span className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
							⏳ Saving...
						</span>
					)}
					{saveStatus === 'saved' && (
						<span className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
							✓ Saved
						</span>
					)}
					{saveStatus === 'unsaved' && (
						<span className="px-3 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-medium">
							● Unsaved
						</span>
					)}
				</div>
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-4 h-full">
				<div className="flex flex-col border-2 border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden h-full bg-white dark:bg-neutral-900 shadow-lg">
					<div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-gradient-to-r from-neutral-50 to-white dark:from-neutral-800 dark:to-neutral-900 flex-shrink-0">
						<span className="text-base font-bold text-neutral-900 dark:text-neutral-100">Code Editor</span>
						<button
							type="button"
							onClick={runCode}
							disabled={isRunning}
							className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-neutral-400 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer touch-manipulation disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-95 flex items-center gap-2"
						>
							{isRunning ? (
								<>
									<span className="animate-spin">⏳</span>
									<span>Running...</span>
								</>
							) : (
								<>
									<span>▶</span>
									<span>Run Code</span>
								</>
							)}
						</button>
					</div>
					<div className="flex-1 min-h-0 relative" style={{ minHeight: '300px' }}>
						<Editor
						height="100%"
						defaultLanguage="javascript"
						defaultValue={'// Work together here!\nfunction add(a, b) {\n  return a + b;\n}\n'}
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
							
							// Initialize editor with Yjs content
							const initialText = yText.toString()
							if (initialText) {
								editor.setValue(initialText)
							}
							
							// Track our own cursor position
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
										setUserStats(getCurrentUserStats()) // Update stats display
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
					{showTerminal && (
						<div className={`border-t flex flex-col flex-shrink-0 ${
							outputType === 'error' 
								? 'bg-red-950/50' 
								: outputType === 'success' 
								? 'bg-green-950/30' 
								: 'bg-neutral-900'
						}`} style={{ minHeight: '200px', maxHeight: '400px' }}>
							<div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-700 bg-neutral-800/50">
								<div className="flex items-center gap-2">
									<span className="text-sm font-semibold text-neutral-300">Terminal</span>
									{outputType === 'error' && (
										<span className="text-xs px-2 py-1 bg-red-900/50 text-red-300 rounded font-medium">Error</span>
									)}
									{outputType === 'success' && (
										<span className="text-xs px-2 py-1 bg-green-900/50 text-green-300 rounded font-medium">Success</span>
									)}
									{isRunning && (
										<span className="text-xs px-2 py-1 bg-blue-900/50 text-blue-300 rounded font-medium animate-pulse">Running...</span>
									)}
								</div>
								<button
									type="button"
									onClick={() => setShowTerminal(!showTerminal)}
									className="text-sm text-neutral-400 hover:text-neutral-200 px-3 py-1.5 hover:bg-neutral-700/50 rounded transition-colors"
									title={showTerminal ? 'Collapse terminal' : 'Expand terminal'}
								>
									{showTerminal ? '▼ Collapse' : '▲ Expand'}
								</button>
							</div>
							<div className={`font-mono text-sm p-4 flex-1 overflow-y-auto ${
								outputType === 'error' 
									? 'text-red-300' 
									: outputType === 'success' 
									? 'text-green-300' 
									: 'text-neutral-300'
							}`}>
								{output ? (
									<pre className="whitespace-pre-wrap leading-relaxed">{output}</pre>
								) : (
									<div className="text-neutral-500 italic py-4">
										Click "Run" to execute your code. Output will appear here.
									</div>
								)}
							</div>
						</div>
					)}
				</div>
				<div className="flex flex-col border-2 border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden h-full bg-white dark:bg-neutral-900 shadow-lg">
					{/* Participants */}
					<div className="border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 flex-shrink-0 bg-gradient-to-r from-neutral-50 to-white dark:from-neutral-800 dark:to-neutral-900" style={{ maxHeight: '200px', overflowY: 'auto' }}>
						<h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mb-3">👥 Participants</h2>
						<ul className="space-y-2">
							{participants.map((p) => {
								const remoteUser = Array.from(remoteUsers.values()).find(u => u.name === p.name)
								const color = remoteUser?.color || '#3b82f6'
								const isYou = p.id === identity.id
								return (
									<li 
										key={p.id} 
										className={`flex items-center gap-3 p-2 rounded-lg ${
											isYou 
												? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' 
												: 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
										}`}
									>
										<span 
											className="w-4 h-4 rounded-full flex-shrink-0 border-2 border-white dark:border-neutral-700 shadow-sm" 
											style={{ backgroundColor: color }}
											title={remoteUser ? `Editing at line ${remoteUser.line}` : 'Not currently editing'}
										/>
										<span className={`flex-1 text-sm ${isYou ? 'font-semibold text-blue-900 dark:text-blue-100' : 'text-neutral-700 dark:text-neutral-300'}`}>
											{p.name}{isYou && <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(You)</span>}
										</span>
										{remoteUser && (
											<span className="text-xs font-medium px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded">
												L{remoteUser.line}
											</span>
										)}
									</li>
								)
							})}
						</ul>
					</div>
					{/* Collaboration Stats */}
					{userStats && (
						<div className="border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
							<h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
								<span>📊</span>
								<span>Your Collaboration Stats</span>
							</h3>
							<div className="grid grid-cols-3 gap-3">
								<div className="text-center p-2 bg-white/60 dark:bg-neutral-800/60 rounded-lg">
									<div className="text-lg font-bold text-blue-700 dark:text-blue-300">{userStats.codeEdits || 0}</div>
									<div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Edits</div>
								</div>
								<div className="text-center p-2 bg-white/60 dark:bg-neutral-800/60 rounded-lg">
									<div className="text-lg font-bold text-blue-700 dark:text-blue-300">{userStats.chatMessages || 0}</div>
									<div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Messages</div>
								</div>
								<div className="text-center p-2 bg-white/60 dark:bg-neutral-800/60 rounded-lg">
									<div className="text-lg font-bold text-blue-700 dark:text-blue-300">{userStats.collaboration || 0}</div>
									<div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Score</div>
								</div>
							</div>
						</div>
					)}
					{/* Chat */}
					<div className="flex-1 flex flex-col min-h-0 relative border-t border-neutral-200 dark:border-neutral-700" style={{ minHeight: '200px', maxHeight: '400px' }}>
						<div className="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-700 bg-gradient-to-r from-neutral-50 to-white dark:from-neutral-800 dark:to-neutral-900 flex-shrink-0">
							<h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">💬 Chat</h3>
						</div>
						<div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 text-sm min-h-0" style={{ maxHeight: 'calc(400px - 120px)' }}>
							{messages.map((msg) => (
								<div key={msg.id} className="space-y-1">
									<p className="font-semibold text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">{msg.authorName}</p>
									<div className="bg-neutral-100 dark:bg-neutral-800/70 rounded-lg px-3 py-2 shadow-sm">
										<p className="text-neutral-900 dark:text-neutral-100 leading-relaxed text-sm">{msg.text}</p>
									</div>
								</div>
							))}
							{messages.length === 0 && (
								<div className="flex items-center justify-center h-full py-8">
									<p className="text-neutral-400 dark:text-neutral-500 text-xs italic">No messages yet. Say hello! 👋</p>
								</div>
							)}
						</div>
						<div className="border-t border-neutral-200 dark:border-neutral-700 px-4 py-3 bg-white dark:bg-neutral-900 flex-shrink-0 z-10 relative">
							<form 
								onSubmit={(e) => {
									e.preventDefault()
									e.stopPropagation()
									console.log('Form submitted')
									sendMessage(e)
								}}
								className="flex gap-2 w-full"
								noValidate
								style={{ pointerEvents: 'auto', zIndex: 100 }}
							>
								<input
									id="chat-input"
									type="text"
									autoComplete="off"
									className="flex-1 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
									value={messageInput}
									onChange={(e) => {
										setMessageInput(e.target.value)
									}}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault()
											e.stopPropagation()
											sendMessage(e as unknown as FormEvent<HTMLFormElement>)
										}
									}}
									onMouseDown={(e) => {
										e.stopPropagation()
									}}
									onClick={(e) => {
										e.stopPropagation()
										const input = e.currentTarget
										setTimeout(() => {
											input.focus()
										}, 0)
									}}
									placeholder="Type a message..."
									tabIndex={0}
									style={{ pointerEvents: 'auto', zIndex: 101 }}
								/>
								<button 
									type="submit" 
									disabled={!messageInput.trim()}
									onMouseDown={(e) => {
										e.stopPropagation()
									}}
									onClick={(e) => {
										e.preventDefault()
										e.stopPropagation()
										sendMessage(e as unknown as FormEvent<HTMLFormElement>)
									}}
									className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-neutral-300 disabled:dark:bg-neutral-700 text-white rounded-lg text-sm font-semibold transition-all cursor-pointer touch-manipulation disabled:cursor-not-allowed shadow-sm hover:shadow-md active:scale-95"
									style={{ pointerEvents: 'auto', zIndex: 101 }}
								>
									Send
								</button>
							</form>
						</div>
					</div>
				</div>
			</div>
			{showSummary && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center">
					<div className="bg-white dark:bg-neutral-900 border rounded-lg p-6 w-[480px]">
						<h2 className="text-lg font-semibold mb-2">Session Summary</h2>
						<p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">
							Mock grading: 7/10 tests passed. Great teamwork!
						</p>
						<button 
							type="button"
							onClick={() => setShowSummary(false)} 
							className="px-3 py-2 border rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-800 active:scale-95 transition-transform cursor-pointer touch-manipulation"
						>
							Close
						</button>
					</div>
				</div>
			)}
		</div>
	)
}

export default Arena


