import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getDatabase, type Database } from 'firebase/database'

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
	databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '',
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
	appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

// Firebase is enabled if we have the core config (databaseURL is optional for RTDB)
const hasCoreConfig = firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
const hasDatabaseURL = !!firebaseConfig.databaseURL

let app: FirebaseApp | undefined
let auth: Auth | undefined
let db: Database | undefined

if (hasCoreConfig) {
	try {
		const existing = getApps()[0]
		app = existing ?? initializeApp(firebaseConfig)
		auth = getAuth(app)
		
		// Only initialize RTDB if databaseURL is provided
		if (hasDatabaseURL) {
			db = getDatabase(app)
		} else {
			console.warn('[CodeTogether] Firebase databaseURL not provided. RTDB features (rooms, presence, chat) will use offline mode.')
		}
	} catch (error) {
		console.error('[CodeTogether] Failed to initialize Firebase:', error)
	}
} else {
	console.warn('[CodeTogether] Firebase env vars missing. Running in offline demo mode.')
}

// Export whether Firebase is enabled (for auth/other features) and whether RTDB is available
export const firebaseEnabled = hasCoreConfig
export const rtdbEnabled = hasCoreConfig && hasDatabaseURL

export { app, auth, db }


