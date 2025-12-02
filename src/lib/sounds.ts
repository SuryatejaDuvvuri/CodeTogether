/**
 * Sound effects utility for CodeTogether
 * Plays audio feedback for user actions (success, failure, streak, messages)
 */

// Sound file paths (will be added to /public/sounds/)
const SOUNDS = {
	success: '/sounds/success.mp3',
	fail: '/sounds/fail.mp3',
	streak: '/sounds/streak.mp3',
	message: '/sounds/message.mp3',
} as const

let soundEnabled = true

/**
 * Enable or disable sound effects
 */
export function setSoundEnabled(enabled: boolean) {
	soundEnabled = enabled
}

/**
 * Check if sounds are enabled
 */
export function isSoundEnabled(): boolean {
	return soundEnabled
}

/**
 * Play a sound effect
 * @param sound - The sound to play (success, fail, streak, message)
 * @param volume - Volume level (0.0 to 1.0, default 0.3)
 */
export function playSound(sound: keyof typeof SOUNDS, volume: number = 0.3): void {
	if (!soundEnabled) return
	
	try {
		const audio = new Audio(SOUNDS[sound])
		audio.volume = Math.max(0, Math.min(1, volume))
		audio.play().catch((error) => {
			// Silently fail if audio can't play (e.g., user hasn't interacted with page)
			console.debug('Could not play sound:', error)
		})
	} catch (error) {
		console.debug('Sound error:', error)
	}
}

/**
 * Play success sound (test passed, correct answer)
 */
export function playSuccess(): void {
	playSound('success', 0.3)
}

/**
 * Play failure sound (test failed, wrong answer)
 */
export function playFail(): void {
	playSound('fail', 0.3)
}

/**
 * Play streak sound (streak milestone reached)
 */
export function playStreak(): void {
	playSound('streak', 0.4)
}

/**
 * Play message sound (chat message sent)
 */
export function playMessage(): void {
	playSound('message', 0.2)
}

