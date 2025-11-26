import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
			manifest: {
				name: 'CodeTogether',
				short_name: 'CodeTogether',
				description: 'Collaborative, course-aligned, gamified coding practice',
				theme_color: '#0f172a',
				background_color: '#0b1220',
				display: 'standalone',
				icons: [
					{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
				],
			},
		}),
	],
})
