# Stellar Test Plan

Comprehensive test plan covering features, edge cases, offline behavior, synchronization, authentication, and PWA scenarios.

---

## Table of Contents

1. [Authentication Tests](#1-authentication-tests)
2. [Goal Lists Tests](#2-goal-lists-tests)
3. [Goals Tests](#3-goals-tests)
   - [Goal Overflow and Celebration Effects](#35-goal-overflow-and-celebration-effects)
4. [Daily Routines Tests](#4-daily-routines-tests)
5. [Daily Progress Tests](#5-daily-progress-tests)
   - [Daily Progress Overflow](#54-daily-progress-overflow)
6. [Calendar Tests](#6-calendar-tests)
7. [Task Categories Tests](#7-task-categories-tests)
8. [Commitments Tests](#8-commitments-tests)
9. [Daily Tasks Tests](#9-daily-tasks-tests)
10. [Long-Term Tasks Tests](#10-long-term-tasks-tests)
11. [Focus Timer Tests](#11-focus-timer-tests)
12. [Block Lists Tests](#12-block-lists-tests)
13. [Synchronization Tests](#13-synchronization-tests)
14. [Offline Behavior Tests](#14-offline-behavior-tests)
15. [PWA Tests](#15-pwa-tests)
16. [Real-time Tests](#16-real-time-tests)
17. [Error Handling Tests](#17-error-handling-tests)
18. [Performance Tests](#18-performance-tests)

---

## 1. Authentication Tests

### 1.1 Sign Up

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Successful sign up | Enter valid email, password, first/last name; submit | Account created, redirected to app, credentials cached |
| Weak password | Enter password < 6 characters | Error message displayed |
| Invalid email format | Enter malformed email | Validation error displayed |
| Duplicate email | Sign up with existing email | Error: "User already registered" |
| Empty required fields | Submit with empty fields | Validation errors on empty fields |
| Network failure during sign up | Disable network before submit | Error displayed, form remains |
| Offline sign up attempt | Go offline, attempt sign up | "Internet required" message |

### 1.2 Sign In

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Successful sign in | Enter valid credentials | Logged in, redirected to app |
| Wrong password | Enter incorrect password | Error: "Invalid login credentials" |
| Non-existent email | Enter unregistered email | Error: "Invalid login credentials" |
| Empty fields | Submit with empty email/password | Validation errors |
| Case sensitivity | Sign in with different email case | Should succeed (email case-insensitive) |
| After sign up | Sign up, sign out, sign in | Should succeed with same credentials |

### 1.3 Offline Sign In

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Successful offline login | Sign in online, go offline, re-enter password | Access granted via cached credentials |
| Wrong password offline | Go offline, enter wrong password | Error: "Incorrect password" |
| No cached credentials | Clear data, go offline, attempt login | "Internet required" message |
| Expired offline session | Wait 1+ hour offline without activity | Session expires, must re-enter password |
| Session extension | Use app periodically while offline | Session extended, doesn't expire |
| Credentials after password change | Change password online, go offline | New password works offline |

### 1.4 Sign Out

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Successful sign out | Click sign out | Redirected to login, local data cleared |
| Sign out while offline | Go offline, sign out | Local data cleared, redirected to login |
| Sign out with pending sync | Make changes offline, sign out | Warning about unsynced data (if applicable) |

### 1.5 Profile Management

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Update name | Change first/last name, save | Name updated, displayed correctly |
| Change password | Enter current + new password | Password changed, offline cache updated |
| Wrong current password | Enter incorrect current password | Error displayed |
| Password too short | Enter new password < 6 chars | Validation error |

### 1.6 Session Management

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Token refresh | Stay logged in past token expiry | Token auto-refreshed, no logout |
| Session persistence | Close browser, reopen | Still logged in |
| Multiple tabs | Open app in multiple tabs | All tabs share session state |
| Force sign out from server | Invalidate session server-side | User logged out on next sync |

### 1.7 Email Confirmation

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Successful confirmation | Click email link with valid token | Email verified, success message shown |
| Invalid token | Visit confirm page with bad token | Error message displayed |
| Expired token | Click link after 24 hours | Error: token expired |
| Return to existing tab | Sign up in tab A, click email link | Tab A focuses, verifies auth, navigates to home |
| No existing tab | Close all Stellar tabs, click email link | Confirm page redirects to home |
| Confirmation email design | Receive signup email | Email shows logo, stars background, styled button |
| Email link target | Inspect link in email | Link opens in new tab (target="_blank") |
| BroadcastChannel not supported | Test in old browser/IE | Falls back to redirect |
| Manual close fallback | If window.close() blocked | Shows "You can close this tab" message |
| Auth state on original tab | Confirm email, check original tab | Original tab shows home page (not login) |
| Session available after confirm | After confirmation, check getSession() | Valid session returned |

### 1.8 Email Confirmation - Inter-Tab Communication

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Channel message sent | Sign up, click confirm link | FOCUS_REQUEST message broadcast |
| Channel response received | Have Stellar tab open, click link | TAB_PRESENT response sent back |
| Multiple tabs open | Have 3 Stellar tabs, click confirm | One tab responds, focuses |
| Tab focus | Confirm with existing tab in background | Existing tab brought to focus |
| Login page auth verification | Confirm email with login page open | Login page independently calls getSession() |
| Navigation to home | Confirm email with login page open | Login page navigates to home via goto() |
| Non-login page reload | Confirm email with protected page open | Protected page reloads |
| Channel cleanup | Close tabs normally | No dangling channel listeners |
| Timeout handling | No Stellar tab open | 500ms timeout, then redirect |
| Security - don't trust message | Manually broadcast authConfirmed: true | Login page verifies with getSession(), doesn't auto-navigate |

### 1.9 Resend Confirmation Email

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Resend button appears | Sign up with valid email | Success message shows resend button |
| Resend email success | Click resend button | Email sent, cooldown starts |
| 30-second cooldown | Click resend, observe button | Button disabled, shows countdown |
| Cooldown countdown | Wait and observe | Countdown decrements every second |
| Cooldown expires | Wait 30 seconds | Button re-enabled, says "Resend email" |
| Resend during cooldown | Try clicking disabled button | Nothing happens, button stays disabled |
| Loading state | Click resend button | Button shows spinner and "Sending..." |
| Resend error | Resend with invalid email | Error message displayed |
| Multiple resends | Resend, wait 30s, resend again | Both emails sent successfully |
| Resend after page reload | Sign up, reload page, try resend | Resend button not shown (email state lost) |
| Email stored for resend | Sign up, observe state | Email address saved for resend function |

---

## 2. Goal Lists Tests

### 2.1 Create Goal List

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create with valid name | Enter name, submit | List created, appears in list |
| Create with empty name | Submit without name | Validation error |
| Create with very long name | Enter 500+ character name | Accepts or truncates appropriately |
| Create while offline | Go offline, create list | Created locally, syncs when online |
| Create multiple lists | Create 10+ lists | All lists display correctly |

### 2.2 Update Goal List

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Rename list | Edit name, save | Name updated in list view |
| Rename to empty | Clear name, save | Validation error or reverts |
| Concurrent rename | Rename on two devices simultaneously | Last write wins, both see final state |

### 2.3 Delete Goal List

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Delete empty list | Delete list with no goals | List removed from view |
| Delete list with goals | Delete list containing goals | List and all goals soft-deleted |
| Delete while offline | Go offline, delete | Deleted locally, tombstone syncs |
| Undo delete | Delete, then undo (if available) | List restored |

### 2.4 Goal List Progress

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Empty list progress | View list with no goals | Shows 0% or "No goals" |
| Partial completion | Complete some goals | Progress reflects completion percentage |
| Full completion | Complete all goals | Shows 100%, green color |
| Progress after adding goal | Add new goal to list | Progress recalculated |

---

## 3. Goals Tests

### 3.1 Create Goal

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create completion goal | Select completion type, enter name | Goal created, checkbox visible |
| Create incremental goal | Select incremental, enter name + target | Goal created, counter visible |
| Empty name | Submit without name | Validation error |
| Zero target value | Create incremental with target 0 | Error or auto-sets to 1 |
| Negative target | Enter negative target value | Error or converts to positive |

### 3.2 Update Goal

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Toggle completion goal | Click checkbox | Completed status toggles |
| Increment incremental | Click + button | Value increases by 1 |
| Decrement incremental | Click - button | Value decreases (min 0) |
| Reach target | Increment to target value | Auto-marks as completed |
| Exceed target | Increment past target | Stays completed, value increases |
| Edit goal name | Change name, save | Name updated |
| Change goal type | Switch from completion to incremental | Type changes, values reset |
| Direct input overflow | Click value, type number above target | Accepts value, shows overflow |
| Decrement from overflow | At 15/10, click - | Value decreases to 14/10 |

### 3.5 Goal Overflow and Celebration Effects

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Increment past 100% | Increment 10/10 goal | Becomes 11/10 (110%), subtle celebration |
| Display shows overflow | Set goal to 15/10 | Displays "15/10" and "150%" |
| Color at 110% | Set to 110% | Color slightly shifted toward cyan |
| Color at 150% | Set to 150% | Full cyan color |
| Color at 200%+ | Set to 200%+ | Purple color |
| Progress bar width | Set to 150% | Bar fills 100% width (capped visually) |
| Overflow star indicator | Exceed 100% | Star (✦) appears next to mini-progress |
| Glow intensity scaling | Increase from 100% to 200% | Glow progressively intensifies |
| Orbiting stars appear | Set to 170%+ | Orbiting star particles visible |
| List total stays capped | Have 1 goal at 200% | List progress shows 100%, not 200% |
| Reduced motion | Enable prefers-reduced-motion | All animations disabled |
| Decrement removes effects | Go from 110% to 100% | Celebration effects disappear |
| Persistence after refresh | Set overflow, refresh page | Overflow value persists |
| Sync overflow value | Set overflow, sync to server | Value syncs correctly |

### 3.3 Reorder Goals

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Drag first to last | Drag top goal to bottom | Order persists after refresh |
| Drag last to first | Drag bottom goal to top | Order persists |
| Reorder while offline | Reorder goals offline | Order syncs correctly |
| Concurrent reorder | Reorder on two devices | Both reorders reflected somehow |

### 3.4 Delete Goal

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Delete completion goal | Delete goal | Removed from list, list progress updates |
| Delete incremental goal | Delete goal | Removed from list, list progress updates |
| Delete only goal in list | Delete the single goal | List shows empty state |

---

## 4. Daily Routines Tests

### 4.1 Create Routine

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create completion routine | Enter name, select completion type | Routine created |
| Create incremental routine | Enter name, set target value | Routine created with target |
| Set start date | Select start date | Routine starts on that date |
| Set end date | Select end date | Routine ends on that date |
| No end date | Leave end date empty | Routine runs indefinitely |
| End date before start | Set end < start | Error or auto-corrects |
| Set active days subset | Select Mon-Fri only | Routine only appears on weekdays |
| Select all days | Select all 7 days | Stored as null (every day) |
| Empty name | Submit without name | Validation error |

### 4.2 Update Routine

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Change name | Edit name, save | Name updated |
| Change target value | Modify target | New target applies to future days |
| Change active days | Toggle days off | Routine stops appearing on those days |
| Extend end date | Push end date further | Routine continues longer |
| Shorten end date | Pull end date earlier | Routine ends sooner |
| Change to past end date | Set end date in past | Routine no longer appears |

### 4.3 Reorder Routines

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Drag to reorder | Drag routine to new position | Order persists |
| Reorder with many routines | Reorder in list of 20+ | Handles gracefully |

### 4.4 Delete Routine

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Delete active routine | Delete routine | Removed from list, progress data retained |
| Delete routine with progress | Delete routine that has progress records | Routine removed, progress orphaned (acceptable) |

---

## 5. Daily Progress Tests

### 5.1 Track Completion Progress

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Mark complete | Check completion checkbox | Progress saved for today |
| Mark incomplete | Uncheck previously checked | Reverts to incomplete |
| Progress on past date | Navigate to yesterday, check | Saves progress for that date |
| Progress on future date | Navigate to tomorrow | May or may not allow (design choice) |

### 5.2 Track Incremental Progress

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Increment value | Click + on incremental routine | Value increases, saves |
| Decrement value | Click - | Value decreases (min 0) |
| Set exact value | Enter value directly | Saves exact value |
| Reach target | Increment to target | Auto-marks completed |
| Exceed target | Set value above target | Remains completed, shows overflow |

### 5.4 Daily Progress Overflow

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Increment past target | Increment 5/5 routine | Becomes 6/5 (120%) |
| Direct input overflow | Type value > target | Accepts, shows celebration |
| Day total capped | Single routine at 200% | Day total shows 100%, not 200% |
| Multiple routines overflow | 2 routines both at 150% | Day average = 100% (each capped) |
| Calendar color capped | Day with overflow routines | Calendar cell shows green (100%) |
| Celebration effects | Exceed target on routine | Space-themed visuals appear |
| Navigate away and back | Set overflow, leave day, return | Overflow preserved |
| Overflow syncs | Set overflow, sync | Value syncs to server correctly |

### 5.3 Progress Persistence

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Navigate away and back | Track progress, leave, return | Progress retained |
| Refresh page | Track progress, refresh | Progress retained |
| Offline progress | Go offline, track progress | Saves locally, syncs when online |

---

## 6. Calendar Tests

### 6.1 Month Navigation

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Navigate to next month | Click next arrow | Shows next month |
| Navigate to previous month | Click prev arrow | Shows previous month |
| Jump multiple months | Click many times quickly | Handles rapid navigation |
| Navigate to year boundary | Go from Dec to Jan | Year increments correctly |

### 6.2 Day Display

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Today highlighting | View current month | Today visually distinct |
| Day progress colors | Complete some routines | Day shows color based on % |
| Empty days | Days with no active routines | Show neutral/gray color |
| Past days | View past month | Past days display correctly |

### 6.3 Day Selection

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Click day | Click on a day | Navigates to day detail view |
| Click empty day | Click day with no routines | Shows "no routines" message |

---

## 7. Task Categories Tests

### 7.1 Create Category

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create with name and color | Enter name, pick color | Category created |
| Create with default color | Enter name only | Uses default purple color |
| Empty name | Submit without name | Validation error |
| Duplicate name | Create two with same name | Allowed (names not unique) |

### 7.2 Update Category

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Change name | Edit name, save | Name updated everywhere |
| Change color | Pick new color | Color updates on category and tasks |

### 7.3 Delete Category

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Delete unused category | Delete category with no tasks | Category removed |
| Delete category with tasks | Delete category used by tasks | Category removed, tasks lose category reference |

---

## 8. Commitments Tests

### 8.1 Create Commitment

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create in Career | Add commitment to Career section | Appears in Career column |
| Create in Social | Add to Social | Appears in Social column |
| Create in Personal | Add to Personal | Appears in Personal column |
| Empty name | Submit empty | Validation error |

### 8.2 Update Commitment

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Edit name | Change name, save | Name updates |
| Move between sections | (If supported) move to different section | Updates section |

### 8.3 Reorder Commitments

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Reorder within section | Drag within Career | Order persists |
| Reorder across sections | (If supported) | Commitment moves |

### 8.4 Delete Commitment

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Delete commitment | Delete item | Removed from section |

---

## 9. Daily Tasks Tests

### 9.1 Create Daily Task

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create task | Enter name, add | Task appears in list unchecked |
| Empty name | Submit empty | Validation error or no-op |
| Create many tasks | Add 50+ tasks | All display, scrollable |

### 9.2 Complete Daily Task

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Check task | Click checkbox | Task marked complete |
| Uncheck task | Click again | Task unmarked |
| Visual distinction | Complete task | Strikethrough or dimmed |

### 9.3 Reorder Daily Tasks

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Drag to reorder | Drag task | Order persists |
| Reorder completed tasks | Drag completed task | Works same as incomplete |

### 9.4 Delete Daily Task

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Delete single task | Delete one task | Task removed |
| Clear completed | Click "Clear completed" | All completed tasks removed |
| Clear when none completed | Click clear with none complete | No change |

---

## 10. Long-Term Tasks Tests

### 10.1 Create Long-Term Task

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create with due date | Enter name + due date | Task created, shows in calendar |
| Create with category | Select category | Task shows category color |
| Create without category | No category selected | Task created without category badge |
| Due date in past | Select past date | Allowed (for backfilling) |
| Empty name | Submit empty | Validation error |

### 10.2 Update Long-Term Task

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Change due date | Edit due date | Calendar view updates |
| Change category | Select different category | Category badge updates |
| Toggle completion | Mark complete/incomplete | Status updates |

### 10.3 Calendar View

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Tasks grouped by date | View calendar | Tasks appear on correct dates |
| Click date in calendar | Click date | Shows tasks for that date |
| Category filter | Click category | Shows only tasks in that category |

### 10.4 Delete Long-Term Task

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Delete task | Delete long-term task | Removed from list and calendar |

### 10.5 Task Tags Modal

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Open modal | Click "View Tags" button | Modal opens showing all tags |
| Tags displayed | Open modal with tasks | Each tag shows as a section |
| Tasks grouped by tag | View modal content | Tasks appear under their tag |
| Tasks sorted by date | View tasks in tag | Soonest due date first |
| Incomplete tasks only | View modal | Only incomplete tasks shown |
| Toggle task complete | Check checkbox in modal | Task marked complete, disappears |
| Delete task | Click delete on task | Task removed |
| Click to edit | Click task text | Opens edit modal, returns to Tags modal on close |
| Return navigation | Edit task from Tags modal, close edit | Returns to Tags modal |
| Edit tag name | Click on tag name | Inline input appears, saves on Enter/blur |
| Change tag color | Click color swatch | Color picker appears with options |
| Select new color | Click color in picker | Tag color updates immediately |
| Delete tag | Click delete on tag header | Tag removed, tasks become untagged |
| Delete tag with tasks | Delete tag that has tasks | Tasks move to "Untagged" section |
| Untagged section | Have tasks without tags | "Untagged" section appears |
| Responsive button text | View on small screen | Button shows "Tags" instead of "View Tags" |
| Modal scroll | Many tags/tasks | Modal content scrolls, header fixed |
| Close modal | Click outside or X | Modal closes |
| Escape key behavior | Press Escape while editing | Cancels edit, doesn't close modal |

---

## 11. Focus Timer Tests

### 11.1 Start Session

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Start from idle | Click Start | Timer begins, shows focus phase |
| Start with custom settings | Change durations, start | Uses custom durations |
| Start while session exists | (Edge case) | Continues existing or starts new |

### 11.2 Timer Countdown

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Countdown accuracy | Let timer run | Counts down in real-time |
| Display format | Observe timer | Shows MM:SS format |
| Long duration | Set 4-hour focus | Handles correctly |

### 11.3 Pause and Resume

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Pause timer | Click Pause | Timer freezes, remaining time preserved |
| Resume timer | Click Resume | Continues from paused time |
| Pause and leave | Pause, close tab, return | Still paused at same time |

### 11.4 Phase Transitions

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Focus to break | Complete focus phase | Automatically transitions to break |
| Break to focus | Complete break | Transitions to next focus cycle |
| Long break trigger | Complete enough cycles | Long break occurs at configured interval |
| Auto-start break | Enable auto-start, complete focus | Break starts automatically |
| Manual start break | Disable auto-start | Waits for user action |

### 11.5 Skip Phase

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Skip focus | Click Skip during focus | Records partial time, goes to break |
| Skip break | Click Skip during break | Goes to next focus immediately |

### 11.6 Stop Session

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Stop during focus | Click Stop | Session ends, focus time recorded |
| Stop during break | Click Stop | Session ends |
| Stop when paused | Stop while paused | Session ends correctly |

### 11.7 Session Completion

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Complete all cycles | Finish all configured cycles | Session ends, returns to idle |
| Focus time tracking | Complete session | Today's focus time increases |

### 11.8 Settings

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Change focus duration | Set to 45 min | New sessions use 45 min |
| Change break duration | Set to 10 min | New sessions use 10 min breaks |
| Change long break | Set to 30 min | Long breaks are 30 min |
| Change cycles count | Set to 6 | Long break after 6 cycles |
| Settings mid-session | Change during session | Applies to next session (not current) |

### 11.9 Persistence

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Refresh during session | Start session, refresh page | Session continues |
| Close and reopen | Start session, close browser, reopen | Session state preserved |
| Session survives offline | Start session, go offline | Timer continues locally |

---

## 12. Block Lists Tests

### 12.1 Create Block List

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create with name | Enter name, create | List created, enabled by default |
| Create with active days | Select specific days | List only active on those days |
| Create with all days | Select all days | Stored as null (every day) |
| Empty name | Submit empty | Validation error |

### 12.2 Update Block List

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Toggle enabled | Click enable/disable | State toggles |
| Change active days | Add/remove days | Schedule updates |
| Rename list | Change name | Name updates |

### 12.3 Add Blocked Websites

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Add valid domain | Enter "youtube.com" | Domain added to list |
| Add subdomain | Enter "mail.google.com" | Added (blocks subdomain) |
| Add with protocol | Enter "https://example.com" | Strips protocol, adds domain |
| Add with path | Enter "example.com/path" | Strips path, adds domain |
| Duplicate domain | Add same domain twice | Error or no-op |
| Empty domain | Submit empty | Validation error |

### 12.4 Remove Blocked Websites

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Remove domain | Click remove on domain | Domain removed from list |
| Remove all domains | Remove all | List empty, still exists |

### 12.5 Delete Block List

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Delete list | Delete block list | List and websites removed |
| Delete while focus active | Delete during focus session | Blocking updates immediately |

### 12.6 Block List Scheduling

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Active only weekdays | Set Mon-Fri | Blocks only on weekdays |
| Inactive on weekend | Test on Saturday | Sites not blocked |
| Multiple lists active | Two lists for same day | All domains from both blocked |
| No lists active | Disable all lists | No blocking occurs |

---

## 13. Synchronization Tests

### 13.1 Push Sync

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create entity online | Create goal list online | Synced to server within 2s |
| Update entity online | Update goal online | Synced to server |
| Delete entity online | Delete goal online | Tombstone synced |
| Multiple rapid changes | Make 10 changes quickly | All eventually sync |
| Sync indicator | Make change | Indicator shows syncing → synced |

### 13.2 Pull Sync

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Changes from other device | Make change on device B | Device A sees change after sync |
| Periodic sync | Wait 5 minutes idle | Sync occurs automatically |
| Tab visibility sync | Switch away and back | Sync triggered on return |
| Reconnect sync | Go offline, come online | Sync triggered immediately |

### 13.3 Conflict Resolution

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Same entity both devices | Edit same goal on A and B | Last write wins |
| Delete on A, update on B | Delete on A, update on B | Depends on timing |
| Pending local change | Make change offline, then sync pulls | Local change protected |
| Recently modified | Make change, immediate pull | Local change protected (5s) |

### 13.4 Sync Queue

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Queue persistence | Make change offline, close browser | Queue survives restart |
| Queue processing order | Make multiple changes | FIFO order maintained |
| Retry with backoff | Cause sync failure | Retries with exponential backoff |
| Max retry exhaustion | Fail 5+ times | Item removed, error shown |

### 13.5 Cursor-Based Sync

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Incremental pull | Sync, make remote change, sync again | Only new changes pulled |
| Large initial sync | New device with lots of data | All data pulled efficiently |
| Cursor persistence | Sync, restart app, sync | Only new changes pulled |

---

## 14. Offline Behavior Tests

### 14.1 Offline Detection

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Go offline | Disable network | App detects offline state |
| Come online | Re-enable network | App detects online state |
| Flaky connection | Toggle network rapidly | Handles gracefully |
| Airplane mode | Enable airplane mode | Detected as offline |

### 14.2 Offline Reads

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| View goal lists offline | Go offline, view lists | All data visible |
| View calendar offline | Go offline, navigate calendar | Calendar works |
| View focus page offline | Go offline, view focus | Timer UI works |
| Navigate all pages offline | Visit every page offline | All pages load from cache |

### 14.3 Offline Writes

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Create goal offline | Go offline, create goal | Created locally |
| Update goal offline | Go offline, update goal | Updated locally |
| Delete goal offline | Go offline, delete goal | Deleted locally (tombstone) |
| Track progress offline | Go offline, track progress | Progress saved locally |
| Focus session offline | Start/pause/stop offline | Session managed locally |

### 14.4 Offline to Online Transition

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Sync after reconnect | Make offline changes, reconnect | Changes pushed to server |
| Multiple offline changes | Make many changes offline | All eventually sync |
| Offline for extended period | Stay offline 1+ hours | Everything syncs on reconnect |

### 14.5 Offline Indicators

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Offline status shown | Go offline | Sync indicator shows offline |
| Pending count | Make changes offline | Pending count badge shows |
| Manual sync attempt | Try sync while offline | Appropriate error/message |

---

## 15. PWA Tests

### 15.1 Installation

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Install prompt | Visit site | Browser shows install option |
| Install on mobile | Click install on mobile | App added to home screen |
| Install on desktop | Click install on desktop | App installed as desktop app |
| Launch installed | Open installed PWA | Opens in standalone window |

### 15.2 Offline Availability

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Load cached app | Install, go offline, open | App loads from cache |
| Navigate offline | Go offline, navigate within app | All routes work |
| Refresh offline | Go offline, refresh | Page reloads from cache |

### 15.3 Service Worker

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Initial cache | First install | Critical assets precached |
| Cache-first assets | Load immutable asset | Served from cache instantly |
| Network-first HTML | Load page online | Fresh HTML, cached fallback |
| Stale-while-revalidate | Load static asset | Cached version, background update |

### 15.4 Updates

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Update detection | Deploy new version | Update prompt appears |
| Apply update | Click "Refresh" | New version loads |
| Dismiss update | Click "Later" | Prompt dismissed |
| Background update check | Wait with app open | Periodic update check |

### 15.5 Cache Invalidation

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Old cache cleanup | Install update | Old version cache deleted |
| Cache versioning | Check cache names | Version in cache name |

### 15.6 Manifest

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| App name | Check installed app | Shows "Stellar" |
| Theme color | Check browser chrome | Correct theme color |
| Icons | Check app icon | Correct icons displayed |
| Orientation | Rotate device | Respects portrait preference |

---

## 16. Real-time Tests

### 16.1 Focus Session Updates

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Start session on web | Start focus in web app | Extension sees active session |
| Pause on web | Pause in web app | Extension sees paused state |
| Stop on web | Stop in web app | Extension sees idle state |
| Phase transition | Focus → break | Extension updates phase |

### 16.2 Block List Updates

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Add domain | Add domain in web app | Extension blocks domain |
| Remove domain | Remove domain | Extension stops blocking |
| Toggle list | Disable block list | Extension respects disabled state |

### 16.3 Subscription Recovery

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Connection drop | Websocket disconnects | Automatic reconnect |
| Token refresh | Token expires | Subscription re-established |

---

## 17. Error Handling Tests

### 17.1 Network Errors

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Request timeout | Slow network | Timeout handled gracefully |
| Server error 500 | Trigger server error | Error message displayed |
| Rate limiting 429 | Exceed rate limit | Backoff and retry |
| Connection refused | Server down | Offline behavior activated |

### 17.2 Auth Errors

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Expired token | Let token expire | Auto-refresh or re-login prompt |
| Invalid token | Corrupt token | Logged out, redirect to login |
| Session revoked | Revoke session server-side | Logged out on next request |

### 17.3 Data Errors

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Invalid data format | Receive malformed data | Error handled, app continues |
| Missing required field | Data missing field | Graceful degradation |
| IndexedDB error | Corrupt IndexedDB | Clear and re-sync |

### 17.4 User Feedback

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Error messages | Trigger various errors | User-friendly messages |
| Loading states | Slow operations | Loading indicators shown |
| Success feedback | Complete operations | Appropriate confirmation |

---

## 18. Performance Tests

### 18.1 Large Data Sets

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| 100 goal lists | Create 100 lists | Page loads < 2s |
| 1000 goals | Create 1000 goals | Scrolling smooth |
| 365 days progress | Year of progress data | Calendar loads < 1s |
| 50 block lists | Create 50 lists | Loads quickly |

### 18.2 Sync Performance

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Large initial sync | New device, lots of data | Completes in reasonable time |
| Many pending items | 100 items in queue | Processed efficiently |
| Parallel queries | Pull sync | All tables queried in parallel |

### 18.3 Timer Performance

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Long running timer | 4-hour focus session | No drift or performance issues |
| Timer accuracy | Compare to real clock | Within 1 second accuracy |
| Background timer | Tab in background | Timer continues accurately |

### 18.4 Memory

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Extended use | Use app for hours | No memory leaks |
| Multiple syncs | Trigger many sync cycles | Memory stable |
| Large cache | Lots of cached data | Memory usage reasonable |

---

## Edge Case Matrix

### Timing-Sensitive Scenarios

| Scenario | Test |
|----------|------|
| Sleep during focus | Close laptop during focus, wake up |
| Tab suspension | Leave tab inactive, browser suspends it |
| System clock change | Change system time during session |
| DST transition | Cross daylight saving time boundary |
| Midnight crossing | Progress tracking across midnight |

### Multi-Device Scenarios

| Scenario | Test |
|----------|------|
| Login on second device | Log in while first device online |
| Offline on both | Both devices offline, then online |
| Concurrent editing | Edit same item on two devices |
| Delete/edit race | Delete on A, edit on B simultaneously |

### Browser-Specific Scenarios

| Scenario | Test |
|----------|------|
| Safari IndexedDB | Test on Safari (known issues) |
| Firefox private mode | Test in private browsing |
| Chrome incognito | Test in incognito mode |
| Mobile browsers | Test on iOS Safari, Android Chrome |

### Network Edge Cases

| Scenario | Test |
|----------|------|
| Very slow network | 2G-speed throttling |
| Intermittent connection | Packet loss simulation |
| Proxy/firewall | Corporate network restrictions |
| VPN connection | Connect/disconnect VPN |

### Overflow Celebration Edge Cases

| Scenario | Test |
|----------|------|
| Extreme overflow | Set goal to 1000% (100/10) |
| Rapid increment | Quickly click + many times past 100% |
| Animation performance | Many goals at various overflow levels |
| Mobile touch | Celebration effects on touch devices |
| Small screen | Overflow effects on narrow viewport |
| Target value change | Change target while at overflow (e.g., 15/10 → 15/20) |
| Zero target | Incremental with target 0 (edge case) |
| Negative after overflow | At overflow, try to decrement below 0 |
