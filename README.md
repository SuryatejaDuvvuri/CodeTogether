# CodeTogether

**A collaborative coding platform for students to practice C++ together in real-time.**  
*UCR CS175 – Team 01*

CodeTogether gamifies learning through team challenges, adaptive quizzes, and interactive flashcards while tracking progress with a comprehensive leaderboard system.

---

Click to watch the Demo
[![Demo Video](https://github.com/user-attachments/assets/a11cd862-28f1-469d-87f2-db69a6f65bcd)](https://youtu.be/vt5fpE0bzSY)

## ✨ Features

### 🎯 Arena - Collaborative Coding Challenges
- **Real-time collaboration** with region-based editing system
- **4 challenge types**: Fix the Bug, Fill the Blank, Code Review, and Pair Programming
- **Team-based XP rewards** - everyone earns points together (20-35 XP per challenge)
- **Live chat and presence tracking**
- **Region assignments** prevent editing conflicts
- **Honor code enforcement** for academic integrity

### ⚡ Speedrun - Timed Quiz Mode
- **Two difficulty modes**:
  - Quick Mode (5s per question, 10 XP each)
  - Deep Think Mode (15s per question, 25 XP each)
- **Adaptive question selection**:
  - Difficulty scales with streak (easy → medium → hard)
  - Wrong answer? Get related questions to reinforce learning
- **No repeated questions** within a session
- **Real-time streak tracking** and audio feedback

### 📚 Flashcards - Spaced Repetition Learning
- **Two study modes**:
  - Study Mode: Traditional flashcards with spaced repetition (5 XP per correct)
  - MCQ Mode: Multiple choice questions (2 XP per correct)
- **20+ C++ concept cards** covering OOP, pointers, memory management, and more
- **Spaced repetition algorithm** schedules reviews based on performance
- **Category-based concept explanations**

### 🏆 Leaderboard - Competitive Rankings
- **Individual leaderboard** with comprehensive scoring
- **Team leaderboard** tracking collaborative sessions
- **Time filters**: Today, This Week, All Time
- **Smart scoring formula**: 35% Collaboration + 35% Accuracy + 20% Consistency + 10% Streak
- **Detailed stats**: XP, accuracy, streak, collaboration score, active time

### 🎮 Gamification Features
- **XP system** with multiple earning methods
- **Streak tracking** for consecutive correct answers
- **Achievement badges** and rank indicators (🥇🥈🥉)
- **Progress visualization** with animated feedback
- **Sound effects** for success, failure, streaks, and celebrations

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Firebase account (for real-time features)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SuryatejaDuvvuri/CodeTogether.git
   cd CodeTogether
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Firebase:**
   
   Create a `.env` file in the root directory:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_DATABASE_URL=your_database_url
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
   
   **Note:** `VITE_FIREBASE_DATABASE_URL` is optional. Without it, the app runs in **offline demo mode** where rooms are stored locally. To enable shared rooms, presence tracking, and chat:
   - Go to Firebase Console → Realtime Database
   - Create a database (start in test mode for development)
   - Copy the database URL (format: `https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com/`)
   - Add it to your `.env` file

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   ```
   http://localhost:5173
   ```

### Building for Production

```bash
npm run build
```

The optimized production build will be in the `dist/` directory.

---

## 📁 Project Structure

```
CodeTogether/
├── src/
│   ├── assets/          # Static assets
│   ├── lib/             # Core utilities
│   │   ├── firebase.ts  # Firebase configuration
│   │   ├── identity.ts  # User identity management
│   │   ├── sounds.ts    # Audio feedback system
│   │   └── stats.ts     # Statistics and scoring logic
│   ├── pages/           # Main application pages
│   │   ├── Arena.tsx    # Collaborative coding challenges
│   │   ├── Flashcards.tsx # Flashcard study mode
│   │   ├── Leaderboard.tsx # Rankings and stats
│   │   ├── Lobby.tsx    # Main landing page
│   │   └── Speedrun.tsx # Timed quiz mode
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # Application entry point
│   └── index.css        # Global styles
├── public/              # Public assets
│   └── sounds/          # Audio files
├── .env                 # Environment variables (not in git)
├── package.json         # Dependencies and scripts
├── vite.config.ts       # Vite configuration
└── tailwind.config.js   # Tailwind CSS configuration
```

---

## 🎯 How It Works

### Scoring System

**Individual Score Formula:**
```
Total Score = (Collaboration × 0.35) + (Accuracy × 0.35) + (Consistency × 0.20) + (Streak × 0.10)
```

- **Collaboration (0-85)**: Code edits, chat messages, and active time across all Arena sessions
- **Accuracy (0-100%)**: Percentage of correct answers in Speedrun/Flashcards
- **Consistency (0-100+)**: Your best-ever daily practice streak
- **Streak (0-50)**: Current or best consecutive correct answers (capped at 50)

### XP Earning

| Activity | XP Earned |
|----------|-----------|
| Arena - Fix the Bug | 30 XP (team) |
| Arena - Fill the Blank | 25 XP (team) |
| Arena - Code Review | 20 XP (team) |
| Arena - Pair Programming | 35 XP (team) |
| Speedrun Quick Mode | 10 XP per correct |
| Speedrun Deep Mode | 25 XP per correct |
| Flashcards Study Mode | 5 XP per correct |
| Flashcards MCQ Mode | 2 XP per correct |

### Adaptive Learning

Speedrun mode intelligently adapts questions based on your performance:
- **Difficulty scaling**: Easy → Medium (3+ streak) → Hard (5+ streak)
- **Topic reinforcement**: Wrong answers trigger related questions
- **No repeats**: Questions aren't repeated within a session

### Active Time Tracking

The system automatically tracks active time in Arena sessions:
- Recorded every minute while in a challenge
- Contributes to collaboration score
- Displayed on leaderboard

---

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Real-time Collaboration**: Yjs + WebRTC
- **Backend**: Firebase Realtime Database
- **Code Editor**: Monaco Editor
- **Styling**: Tailwind CSS v4 (PostCSS)
- **State Management**: React Hooks
- **PWA**: vite-plugin-pwa (enabled on production build)

---

## 📊 Firebase Database Structure

```
/rooms/{roomId}
  ├── challenge: Challenge info
  ├── locked: Room lock status
  ├── timerStartTime: Timer start timestamp
  ├── contrib/{userId}: User contributions
  ├── presence/{userId}: Online presence
  ├── messages/{messageId}: Chat messages
  └── regions/{regionId}: Region assignments

/stats/{userId}
  ├── name: Display name
  ├── xp: Total experience points
  ├── accuracy: Answer accuracy percentage
  ├── streak: Best streak
  ├── collaboration: Collaboration score
  ├── consistency: Daily streak record
  ├── totalQuestions: Questions attempted
  ├── correctAnswers: Correct answer count
  ├── codeEdits: Total code edits
  ├── chatMessages: Total messages sent
  ├── activeTime: Minutes of active coding
  └── dailyStreak: Current daily streak

/roomStats/{roomId}
  ├── roomName: Room display name
  ├── challenge: Challenge type
  ├── participants: Array of participants
  ├── totalEdits: Total edits in session
  ├── totalMessages: Total messages
  ├── totalActiveTime: Total active time
  └── teamKey: Unique team identifier

/code/{roomId}
  ├── content: Code content
  └── lastSaved: Last save timestamp
```

---

## 🎨 Features in Detail

### Region-Based Editing

In Arena mode, code is divided into regions (A, B, C, D):
- Each user gets one assigned region
- Users can edit their region + shared regions only
- Visual indicators show region boundaries and ownership
- Real-time enforcement prevents editing conflicts

### Real-time Collaboration

Using Yjs and WebRTC for peer-to-peer synchronization:
- **Code sync**: Changes propagate instantly
- **Presence tracking**: See who's online
- **Chat system**: Communicate with teammates
- **Live updates**: Real-time stats and contributions

### Spaced Repetition Algorithm

Flashcards use a spaced repetition system:
- **Quality ratings**: Again, Hard, Good, Easy
- **Dynamic intervals**: Time between reviews adjusts
- **Ease factor**: Cards get easier/harder based on history
- **Optimal scheduling**: Smart review timing

---

## 📝 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Inspired by competitive programming platforms and collaborative learning tools
- Sound effects and animations enhance the learning experience

---

**Happy Coding Together! 🚀**

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
