# Goal Planner

A personal goal tracking application with support for one-time goal lists and daily routine goals with date ranges.

## Features

- **Goal Lists**: Create multiple goal lists to organize your goals
  - Completion goals (checkbox-style)
  - Incremental goals (progress toward a target number)
  - Red-to-green color system based on completion percentage

- **Daily Routine Calendar**: Track recurring daily goals
  - Monthly calendar view with color-coded completion
  - Date range support for each routine
  - Daily progress tracking

- **PWA Support**: Install on your phone for offline access

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once created, go to **Settings > API** and copy:
   - Project URL
   - anon/public key

### 2. Set Up the Database

1. In your Supabase dashboard, go to **SQL Editor**
2. Copy the contents of `supabase-schema.sql` and run it
3. This creates all necessary tables with Row Level Security policies

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
PUBLIC_SUPABASE_URL=your-project-url
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 6. Deploy

Build and deploy to your preferred platform:

```bash
npm run build
```

Recommended platforms:
- [Vercel](https://vercel.com) - Zero config deployment
- [Netlify](https://netlify.com)
- [Cloudflare Pages](https://pages.cloudflare.com)

## Usage

### Goal Lists

1. Navigate to **Goal Lists** from the navigation
2. Click **+ New List** to create a goal list
3. Click on a list to add goals
4. Choose between:
   - **Completion**: Simple checkbox goal
   - **Incremental**: Track progress toward a number (e.g., "Read 30 pages")

### Daily Routines

1. Navigate to **Routines** to manage your daily routine goals
2. Create routines with:
   - Name
   - Type (completion or incremental)
   - Start date and optional end date
3. Navigate to **Calendar** to see your monthly progress
4. Click any day to view and update progress for that day
5. Past days show color-coded completion (red = 0%, green = 100%)

### Mobile Access

1. Open the app in your phone's browser
2. Use "Add to Home Screen" (iOS) or "Install" (Android)
3. The app will work like a native app with offline support

## PWA Icons

Replace the placeholder icons in `/static/`:
- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)
- `favicon.png` (32x32 or 64x64 pixels)

You can use the `icon.svg` as a template.

## Tech Stack

- **Frontend**: SvelteKit 2, Svelte 5, TypeScript
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Custom CSS with CSS variables
- **Date handling**: date-fns
