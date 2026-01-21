# Stellar Frameworks & Dependencies Guide

This document explains all the frameworks and third-party tools used in the Stellar codebase. It's designed for developers who may not be familiar with these technologies.

---

## Table of Contents

1. [SvelteKit & Svelte](#sveltekit--svelte)
2. [TypeScript](#typescript)
3. [Supabase](#supabase)
4. [Dexie.js (IndexedDB)](#dexiejs-indexeddb)
5. [date-fns](#date-fns)
6. [Vite](#vite)
7. [Architectural Patterns](#architectural-patterns)

---

## SvelteKit & Svelte

**What is it?**

Svelte is a UI framework (like React or Vue) for building interactive web interfaces. SvelteKit is a full-stack framework built on top of Svelte (similar to how Next.js builds on React).

**Why is it different from React/Vue?**

Unlike React or Vue, Svelte compiles your code at build time into efficient vanilla JavaScript. There's no virtual DOM or runtime framework code - just optimized JavaScript that directly updates the DOM.

### Key Svelte Concepts Used in This Codebase

#### Components (`.svelte` files)

Every `.svelte` file is a component containing three sections:

```svelte
<script>
  // JavaScript/TypeScript logic
  let count = 0;
</script>

<!-- HTML template -->
<button on:click={() => count++}>
  Clicked {count} times
</button>

<style>
  /* Scoped CSS - only applies to this component */
  button { background: purple; }
</style>
```

#### Svelte 5 Runes (Reactivity System)

This codebase uses Svelte 5's new "runes" syntax for reactivity:

```svelte
<script>
  // $state - creates reactive state
  let count = $state(0);

  // $derived - computed values that auto-update
  let doubled = $derived(count * 2);

  // $effect - runs side effects when dependencies change
  $effect(() => {
    console.log('Count changed:', count);
  });

  // $props - receive props from parent component
  let { title, onSave } = $props();
</script>
```

#### Stores (Global State)

Svelte stores are objects that hold values and notify subscribers when values change:

```typescript
// Creating a store
import { writable } from 'svelte/store';
export const count = writable(0);

// Using in a component
<script>
  import { count } from '$lib/stores/count';
</script>

<!-- $ prefix auto-subscribes and gets current value -->
<p>Count: {$count}</p>
```

**Where to find stores:** `/src/lib/stores/`

### Key SvelteKit Concepts

#### File-Based Routing

The folder structure in `src/routes/` defines your URLs:

```
src/routes/
├── +page.svelte          → /
├── login/+page.svelte    → /login
├── tasks/+page.svelte    → /tasks
├── lists/
│   ├── +page.svelte      → /lists
│   └── [id]/+page.svelte → /lists/123 (dynamic route)
```

#### Special Files

| File | Purpose |
|------|---------|
| `+page.svelte` | The UI for a route |
| `+layout.svelte` | Shared wrapper (nav, sidebar) for child routes |
| `+page.ts` | Load data before rendering (runs on client) |
| `+layout.ts` | Load data for layout and all child routes |
| `+error.svelte` | Error page for this route |

#### Route Groups

Parentheses create "groups" that don't affect the URL:

```
src/routes/
├── (protected)/
│   ├── +layout.ts     → Auth check for all routes below
│   ├── tasks/         → /tasks (not /(protected)/tasks)
│   └── calendar/      → /calendar
```

#### Load Functions

Data loading happens in `+page.ts` or `+layout.ts`:

```typescript
// src/routes/lists/[id]/+page.ts
export async function load({ params }) {
  // params.id comes from [id] in the folder name
  const list = await fetchList(params.id);
  return { list };
}
```

The returned data is available in the corresponding `.svelte` file via `$page.data`.

#### Navigation

```typescript
import { goto } from '$app/navigation';

// Navigate programmatically
goto('/tasks');

// With options
goto('/login', { replaceState: true });
```

#### Environment Variables

```typescript
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
// Only variables starting with PUBLIC_ are exposed to the browser
```

### Where to Look in This Codebase

- **Components:** `/src/lib/components/`
- **Routes/Pages:** `/src/routes/`
- **Stores:** `/src/lib/stores/`
- **Root layout:** `/src/routes/+layout.svelte`

---

## TypeScript

**What is it?**

TypeScript is JavaScript with static types. It catches errors at compile time instead of runtime.

### Key Concepts Used

#### Type Annotations

```typescript
// Variable types
let name: string = 'Alice';
let age: number = 30;
let isActive: boolean = true;

// Function types
function greet(name: string): string {
  return `Hello, ${name}`;
}

// Optional properties
interface User {
  id: string;
  name: string;
  email?: string; // ? means optional
}
```

#### Interfaces & Types

```typescript
// Interface - defines object shape
interface Goal {
  id: string;
  title: string;
  completed: boolean;
  created_at: Date;
}

// Type alias - can also define primitives, unions
type Status = 'pending' | 'in_progress' | 'completed';
```

#### Generics

```typescript
// Function that works with any type
function firstItem<T>(arr: T[]): T | undefined {
  return arr[0];
}

const num = firstItem([1, 2, 3]);     // type: number
const str = firstItem(['a', 'b']);   // type: string
```

### Where to Look in This Codebase

- **Type definitions:** `/src/app.d.ts`
- **Config:** `/tsconfig.json`
- All `.ts` files use TypeScript

---

## Supabase

**What is it?**

Supabase is an open-source Firebase alternative. It provides:
- **PostgreSQL Database** - SQL database in the cloud
- **Authentication** - User signup/login
- **Realtime** - WebSocket subscriptions for live updates
- **Storage** - File storage (not used in this app)

### How It's Used in Stellar

#### Authentication

```typescript
import { supabase } from '$lib/supabase/client';

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: { data: { name: 'John Doe' } }
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

// Get current session
const { data: { session } } = await supabase.auth.getSession();

// Listen to auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') { /* ... */ }
  if (event === 'SIGNED_OUT') { /* ... */ }
});
```

#### Database Queries

```typescript
// SELECT - fetch data
const { data, error } = await supabase
  .from('goals')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });

// INSERT - create data
const { data, error } = await supabase
  .from('goals')
  .insert({ title: 'New Goal', user_id: userId })
  .select()
  .single();

// UPDATE - modify data
const { data, error } = await supabase
  .from('goals')
  .update({ completed: true })
  .eq('id', goalId);

// DELETE - remove data
const { error } = await supabase
  .from('goals')
  .delete()
  .eq('id', goalId);
```

#### Realtime Subscriptions

```typescript
// Subscribe to changes on a table
const channel = supabase
  .channel('goals-changes')
  .on(
    'postgres_changes',
    {
      event: '*',  // INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'goals',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      console.log('Change:', payload.eventType, payload.new);
    }
  )
  .subscribe();

// Unsubscribe when done
channel.unsubscribe();
```

### Important: Stellar Uses Local-First Architecture

In this codebase, **you don't query Supabase directly for most operations**. Instead:

1. **Reads** come from local IndexedDB (via Dexie)
2. **Writes** go to local IndexedDB first, then sync to Supabase in background
3. The sync engine handles pushing local changes to Supabase

This means the app works offline and feels instant.

### Where to Look in This Codebase

- **Supabase client:** `/src/lib/supabase/client.ts`
- **Auth functions:** `/src/lib/supabase/auth.ts`
- **Sync engine:** `/src/lib/sync/engine.ts`

---

## Dexie.js (IndexedDB)

**What is it?**

Dexie is a wrapper around IndexedDB, the browser's built-in database. It makes the complex IndexedDB API simple to use.

**Why use it?**

IndexedDB allows storing large amounts of structured data in the browser. Combined with Supabase, it enables offline-first functionality.

### Key Concepts

#### Defining a Database Schema

```typescript
// /src/lib/db/schema.ts
import Dexie from 'dexie';

class GoalPlannerDB extends Dexie {
  goals!: Table<Goal>;
  tasks!: Table<Task>;

  constructor() {
    super('GoalPlannerDB');

    // Define tables and indexes
    this.version(1).stores({
      goals: 'id, user_id, created_at',  // id is primary key
      tasks: 'id, goal_id, order'
    });
  }
}

export const db = new GoalPlannerDB();
```

#### CRUD Operations

```typescript
import { db } from '$lib/db/client';

// Create
await db.goals.add({ id: '123', title: 'New Goal', user_id: 'user1' });

// Read one
const goal = await db.goals.get('123');

// Read many with filter
const userGoals = await db.goals
  .where('user_id')
  .equals(userId)
  .toArray();

// Update
await db.goals.update('123', { title: 'Updated Title' });

// Delete
await db.goals.delete('123');
```

#### Transactions

```typescript
// Multiple operations in one atomic transaction
await db.transaction('rw', [db.goals, db.tasks], async () => {
  await db.goals.add(newGoal);
  await db.tasks.bulkAdd(newTasks);
  // If any fails, all are rolled back
});
```

### Where to Look in This Codebase

- **Database schema:** `/src/lib/db/schema.ts`
- **Database client:** `/src/lib/db/client.ts`
- **Repositories (data access):** `/src/lib/db/repositories/`

---

## date-fns

**What is it?**

date-fns is a modern JavaScript date utility library. It's like Lodash but for dates.

### Key Functions Used

```typescript
import {
  format,
  addDays,
  startOfWeek,
  isToday,
  differenceInDays
} from 'date-fns';

// Format dates
format(new Date(), 'yyyy-MM-dd');  // "2024-01-15"
format(new Date(), 'MMMM d, yyyy');  // "January 15, 2024"

// Date math
addDays(new Date(), 7);  // 7 days from now
startOfWeek(new Date()); // Beginning of current week

// Comparisons
isToday(someDate);  // true/false
differenceInDays(date1, date2);  // number of days between
```

### Where It's Used

- Calendar views
- Routine scheduling
- Date range calculations
- Displaying relative dates

---

## Vite

**What is it?**

Vite is a modern build tool and development server. It's what bundles all your code for production and provides hot module replacement during development.

### What You Need to Know

For most development, you won't interact with Vite directly. Just know:

- `npm run dev` - Starts development server with hot reload
- `npm run build` - Creates production build in `/build`
- `npm run preview` - Preview production build locally

### Configuration

The config lives in `/vite.config.ts`. Key things configured:
- SvelteKit plugin integration
- Chunk splitting for better caching (Supabase, date-fns, Dexie in separate bundles)
- Service worker version injection

---

## Architectural Patterns

### Local-First Data Architecture

This is the most important pattern to understand in this codebase.

**Traditional approach:**
```
User Action → API Call → Wait → Update UI
```

**Local-first approach (used here):**
```
User Action → Update Local DB → Update UI (instant!)
                    ↓
              Background Sync → Remote DB
```

**Benefits:**
- App works offline
- UI updates are instant (no loading states for most actions)
- Network issues don't block the user

**How it works in code:**

```typescript
// Stores read from local DB
export async function loadGoals(userId: string) {
  // This reads from IndexedDB, not Supabase
  return await GoalRepository.findByUserId(userId);
}

// Writes go to local DB and queue for sync
export async function createGoal(goal: Goal) {
  // 1. Save to local IndexedDB
  await GoalRepository.create(goal);

  // 2. Queue for background sync
  await SyncQueue.add('create', 'goals', goal.id);

  // 3. UI updates immediately from local DB
}
```

### Repository Pattern

Data access is abstracted through repositories:

```
UI Component
     ↓
   Store (manages state)
     ↓
  Repository (data access)
     ↓
   Dexie (IndexedDB)
```

Each entity has a repository file in `/src/lib/db/repositories/`:

```typescript
// Example: GoalRepository
export const GoalRepository = {
  async findById(id: string): Promise<Goal | undefined> {
    return db.goals.get(id);
  },

  async findByUserId(userId: string): Promise<Goal[]> {
    return db.goals.where('user_id').equals(userId).toArray();
  },

  async create(goal: Goal): Promise<void> {
    await db.goals.add(goal);
  },
  // ... more methods
};
```

### Store Pattern

Svelte stores manage application state and connect to repositories:

```typescript
// /src/lib/stores/data.ts
function createGoalsStore() {
  const { subscribe, set, update } = writable<Goal[]>([]);

  return {
    subscribe,

    async load(userId: string) {
      const goals = await GoalRepository.findByUserId(userId);
      set(goals);
    },

    async create(goal: Partial<Goal>) {
      const newGoal = { ...goal, id: crypto.randomUUID() };
      await GoalRepository.create(newGoal);
      update(goals => [...goals, newGoal]);
    }
  };
}

export const goalsStore = createGoalsStore();
```

---

## Quick Reference: File Locations

| What | Where |
|------|-------|
| Pages/Routes | `/src/routes/` |
| Components | `/src/lib/components/` |
| Stores | `/src/lib/stores/` |
| Database | `/src/lib/db/` |
| Supabase | `/src/lib/supabase/` |
| Sync Engine | `/src/lib/sync/` |
| Global Styles | `/src/app.css` |
| Type Definitions | `/src/app.d.ts` |

---

## Running the App

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type check
npm run check
```

---

## Environment Variables

Create a `.env` file with:

```
PUBLIC_SUPABASE_URL=your-supabase-project-url
PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```

These connect the app to your Supabase backend.
