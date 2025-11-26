const STORAGE_KEY = 'codetogether:identity'
const SESSION_KEY = 'codetogether:session-id'

type Identity = {
	id: string
	name: string
}

function choose<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)]
}

function generateName() {
	const adjectives = ['Agile', 'Brave', 'Curious', 'Dynamic', 'Eager', 'Fearless', 'Gritty', 'Helpful', 'Inventive', 'Joyful', 'Keen', 'Lively', 'Nimble', 'Optimistic', 'Playful', 'Quick', 'Radiant', 'Swift', 'Vibrant', 'Witty']
	const animals = ['Badger', 'Coyote', 'Dolphin', 'Falcon', 'Gopher', 'Jaguar', 'Koala', 'Otter', 'Phoenix', 'Quokka', 'Raccoon', 'Squirrel', 'Tiger', 'Unicorn', 'Vulture', 'Wolf', 'Yak', 'Zebra']
	return `${choose(adjectives)} ${choose(animals)}`
}

export function getIdentity(): Identity {
	if (typeof window === 'undefined') {
		return { id: 'server', name: 'Server' }
	}
	
	// Use sessionStorage to ensure each tab/window has a unique identity
	// Check if we already have a session ID for this tab
	let sessionId = window.sessionStorage.getItem(SESSION_KEY)
	if (!sessionId) {
		// Generate a unique session ID for this tab
		sessionId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
		window.sessionStorage.setItem(SESSION_KEY, sessionId)
	}
	
	// Check if we have an identity for this session
	const sessionIdentityKey = `${STORAGE_KEY}-${sessionId}`
	const existing = window.sessionStorage.getItem(sessionIdentityKey)
	if (existing) {
		return JSON.parse(existing) as Identity
	}

	// Generate a new unique identity for this tab
	const identity: Identity = {
		id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		name: generateName(),
	}
	window.sessionStorage.setItem(sessionIdentityKey, JSON.stringify(identity))
	return identity
}


