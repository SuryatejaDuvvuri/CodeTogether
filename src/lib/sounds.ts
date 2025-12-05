// Sound effects for CodeTogether
// Uses Web Audio API for low-latency, lightweight sounds

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
	if (!audioContext) {
		audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
	}
	return audioContext
}

function isSoundEnabled(): boolean {
	const stored = localStorage.getItem('codetogether:sound')
	return stored !== 'false'
}

// Play a simple tone
function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
	if (!isSoundEnabled()) return
	
	try {
		const ctx = getAudioContext()
		const oscillator = ctx.createOscillator()
		const gainNode = ctx.createGain()
		
		oscillator.type = type
		oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)
		
		gainNode.gain.setValueAtTime(volume, ctx.currentTime)
		gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
		
		oscillator.connect(gainNode)
		gainNode.connect(ctx.destination)
		
		oscillator.start(ctx.currentTime)
		oscillator.stop(ctx.currentTime + duration)
	} catch (error) {
		console.warn('Audio playback failed:', error)
	}
}

// Success sound - pleasant ascending tone
export function playSuccess() {
	if (!isSoundEnabled()) return
	
	try {
		const ctx = getAudioContext()
		
		// Play two quick ascending notes
		const now = ctx.currentTime
		
		// First note
		const osc1 = ctx.createOscillator()
		const gain1 = ctx.createGain()
		osc1.type = 'sine'
		osc1.frequency.setValueAtTime(523.25, now) // C5
		gain1.gain.setValueAtTime(0.2, now)
		gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
		osc1.connect(gain1)
		gain1.connect(ctx.destination)
		osc1.start(now)
		osc1.stop(now + 0.15)
		
		// Second note (higher)
		const osc2 = ctx.createOscillator()
		const gain2 = ctx.createGain()
		osc2.type = 'sine'
		osc2.frequency.setValueAtTime(659.25, now + 0.08) // E5
		gain2.gain.setValueAtTime(0.25, now + 0.08)
		gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
		osc2.connect(gain2)
		gain2.connect(ctx.destination)
		osc2.start(now + 0.08)
		osc2.stop(now + 0.25)
	} catch (error) {
		console.warn('Audio playback failed:', error)
	}
}

// Fail sound - descending buzz
export function playFail() {
	if (!isSoundEnabled()) return
	
	playTone(200, 0.2, 'sawtooth', 0.15)
}

// Streak sound - triumphant chord
export function playStreak() {
	if (!isSoundEnabled()) return
	
	try {
		const ctx = getAudioContext()
		const now = ctx.currentTime
		
		// Play a quick major chord arpeggio
		const notes = [523.25, 659.25, 783.99] // C5, E5, G5
		
		notes.forEach((freq, i) => {
			const osc = ctx.createOscillator()
			const gain = ctx.createGain()
			
			osc.type = 'triangle'
			osc.frequency.setValueAtTime(freq, now + i * 0.05)
			
			gain.gain.setValueAtTime(0.2, now + i * 0.05)
			gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
			
			osc.connect(gain)
			gain.connect(ctx.destination)
			
			osc.start(now + i * 0.05)
			osc.stop(now + 0.4)
		})
	} catch (error) {
		console.warn('Audio playback failed:', error)
	}
}

// Click sound - subtle feedback
export function playClick() {
	if (!isSoundEnabled()) return
	playTone(800, 0.05, 'sine', 0.1)
}

// Timer warning sound
export function playWarning() {
	if (!isSoundEnabled()) return
	playTone(400, 0.1, 'square', 0.15)
}

// Level up / achievement sound
export function playLevelUp() {
	if (!isSoundEnabled()) return
	
	try {
		const ctx = getAudioContext()
		const now = ctx.currentTime
		
		// Ascending fanfare
		const notes = [392, 523.25, 659.25, 783.99] // G4, C5, E5, G5
		
		notes.forEach((freq, i) => {
			const osc = ctx.createOscillator()
			const gain = ctx.createGain()
			
			osc.type = 'sine'
			osc.frequency.setValueAtTime(freq, now + i * 0.1)
			
			gain.gain.setValueAtTime(0.25, now + i * 0.1)
			gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5)
			
			osc.connect(gain)
			gain.connect(ctx.destination)
			
			osc.start(now + i * 0.1)
			osc.stop(now + 0.5)
		})
	} catch (error) {
		console.warn('Audio playback failed:', error)
	}
}

// Collaboration notification sound
export function playNotification() {
	if (!isSoundEnabled()) return
	
	try {
		const ctx = getAudioContext()
		const now = ctx.currentTime
		
		// Two-tone notification
		const osc = ctx.createOscillator()
		const gain = ctx.createGain()
		
		osc.type = 'sine'
		osc.frequency.setValueAtTime(880, now) // A5
		osc.frequency.setValueAtTime(1046.5, now + 0.1) // C6
		
		gain.gain.setValueAtTime(0.15, now)
		gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
		
		osc.connect(gain)
		gain.connect(ctx.destination)
		
		osc.start(now)
		osc.stop(now + 0.2)
	} catch (error) {
		console.warn('Audio playback failed:', error)
	}
}
