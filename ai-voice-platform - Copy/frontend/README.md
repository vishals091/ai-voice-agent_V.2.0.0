# VoiceAI Enterprise Frontend

Modern React frontend for the AI Voice Platform with Enterprise SaaS features.

## Features

- 🎨 **Modern Enterprise UI** - Deep indigo glassmorphism aesthetic
- 🔐 **Multi-tenant Auth** - JWT-based with organization context
- 🎙️ **Voice Testing** - WebSocket-based real-time voice interaction
- 📊 **Command Center** - Live call monitoring with sentiment analysis
- 💰 **Cost Savings Widget** - Real-time ROI visualization
- 📅 **Office Hours Scheduler** - Visual weekly scheduler
- 📚 **Knowledge Base 2.0** - Hybrid search with query testing
- 👥 **Team Management** - Invite, roles, and API keys
- 📱 **Fully Responsive** - Mobile-first design

## Tech Stack

- **React 18** - UI framework
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Recharts** - Charts
- **Lucide React** - Icons
- **React Hot Toast** - Notifications
- **Axios** - HTTP client

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Layout.js        # Main dashboard layout with sidebar
│   ├── LoadingScreen.js # Full-screen loading state
│   ├── LiveMonitor.js   # Live call monitoring cards
│   └── OfficeHoursScheduler.js
├── pages/               # Route pages
│   ├── Dashboard.js     # Command Center with live calls
│   ├── VoiceChat.js     # Voice agent testing
│   ├── Analytics.js     # Call analytics & reports
│   ├── KnowledgeBase.js # Document management + test queries
│   ├── Settings.js      # AI providers, telephony, hours
│   ├── Team.js          # Team & API key management
│   ├── Login.js         # Auth with forgot password
│   ├── Register.js      # New organization signup
│   ├── ForgotPassword.js
│   ├── ResetPassword.js
│   └── NotFound.js
├── stores/              # Zustand state stores
│   ├── authStore.js     # Authentication & org context
│   ├── settingsStore.js # AI settings & business hours
│   ├── voiceStore.js    # WebSocket voice session
│   ├── analyticsStore.js # Metrics & live calls
│   └── knowledgeStore.js # Knowledge base CRUD
├── services/
│   └── api.js           # Axios instance with interceptors
└── styles/
    └── globals.css      # Tailwind + custom components
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Backend running on port 5000

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The app will run on `http://localhost:3000` and proxy API requests to `http://localhost:5000`.

### Environment Variables

Create a `.env` file for production:

```env
REACT_APP_API_URL=https://your-api-domain.com
REACT_APP_WS_HOST=your-api-domain.com
```

## Key Features

### 1. Command Center Dashboard
- Real-time live call monitoring with pulsing cards
- Live sentiment indicators (Happy, Frustrated, Neutral)
- Cost savings counter vs human agent costs
- Quick action cards for navigation

### 2. Voice Agent Testing
- WebSocket connection to `/ws/voice`
- Real-time transcript display
- Streaming AI response
- Sound wave visualization
- Text input fallback

### 3. Settings Panel
- **AI Agent Tab**: Provider selection, voice settings, system prompt
- **Telephony Tab**: Transfer number with 🇮🇳 prefix, owner title dropdown with custom option
- **Office Hours Tab**: Visual weekly scheduler with drag/click toggles
- **Escalation Tab**: Keyword tags, feature toggles

### 4. Knowledge Base 2.0
- Document CRUD with categories
- **Test Query Box**: Type questions to see which chunks are retrieved
- Hybrid search toggle (semantic + keyword)
- Bulk import support

### 5. Team Management
- Invite members with email
- Role management (Owner, Admin, Member, Viewer)
- API key generation and revocation

## Design System

### Colors
- **Primary**: Indigo (#6366F1)
- **Accent**: Emerald, Amber, Rose, Cyan
- **Background**: Slate-950 (#0B1120)

### Components
- `.glass-card` - Glassmorphism panels
- `.btn-primary` - Gradient primary buttons
- `.btn-secondary` - Outlined secondary buttons
- `.input-field` - Styled form inputs
- `.badge-*` - Status badges

### Animations
- `fade-in-up` - Page transitions
- `pulse-ring` - Live indicators
- `sound-wave` - Voice activity
- `shimmer` - Loading states

## API Integration

The frontend expects these backend endpoints:

```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/auth/me

GET  /api/settings
PUT  /api/settings

GET  /api/knowledge
POST /api/knowledge
POST /api/knowledge/search

GET  /api/analytics/overview
GET  /api/analytics/daily
GET  /api/analytics/calls
GET  /api/analytics/live
GET  /api/analytics/cost-savings

GET  /api/organization
GET  /api/organization/team
POST /api/organization/team/invite

WebSocket: /ws/voice
```

## Build & Deploy

```bash
# Production build
npm run build

# The build folder can be deployed to any static host
```

### Docker

```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## Contributing

1. Follow the existing code style
2. Use Tailwind utility classes
3. Keep components small and focused
4. Add proper TypeScript types if converting

## License

MIT
