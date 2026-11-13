# Performance audit — 2026-10-10

Done while the app was healthy in production, so nothing here is a live fire.
Findings are ordered by measured impact. Items 1–2 are fixed; the rest are
written down with enough detail to act on without re-deriving them.

The backend came out of this well and is deliberately not in the list: the
chat fan-out was rebuilt onto batched `getAll` + `FieldValue.increment`
earlier, functions carry a global `maxInstances` ceiling with per-function
memory overrides, and the composite indexes are declared. The cost work has
been done. What was left is all on the device.

---

## 1. Date formatting in render paths — FIXED

`toLocaleDateString` / `toLocaleTimeString` build a **fresh Intl formatter on
every call**, and that construction is nearly all of the cost. Measured on
Node's V8 (Hermes on a mid-range Android is slower again):

```
toLocale* per call:            108.4 µs
reused Intl.DateTimeFormat:      2.3 µs   → 46x faster
```

Every chat bubble formatted its own timestamp, on every render of the screen.
There were **27 `toLocale*` call sites** across the app.

Fixed by building the three formatters once at module load in `src/ui/format.ts`
and exposing `formatDate`, `formatTime` and a new `formatMessageTime`. Club chat
and DMs now use them.

**Still worth doing:** the other ~20 call sites (`club/event/[id].tsx`,
`(tabs)/club.tsx`, `club/events.tsx`, `club/gallery.tsx`, the admin screens)
should move onto `@/ui/format` too. They are in less hot paths — lists that
render once rather than on every keystroke — so the win is smaller, but it is
free and it stops the pattern spreading.

## 2. Every keystroke re-rendered every chat bubble — FIXED

The composer's `text` lives on the screen component, so each keystroke
re-rendered the screen, and nothing downstream was memoised — **there was no
`React.memo` anywhere in the codebase.** Each visible bubble then re-ran a
regex scan over its content (`extractImageUrls`), rebuilt its reaction list,
and formatted its timestamp (item 1), for rows whose data had not changed.

It is worse than once per keystroke: `onChangeText` and `onSelectionChange` are
separate native events, so a single keypress produces **two** render passes.

Fixed by memoising `MessageBubble` (club chat) and `Bubble` (DMs). That alone
does nothing unless the props are stable, so the row callbacks moved to
`useCallback` and the rows now receive the message as an argument
(`onLongPress(message)`) instead of closing over it in an inline arrow.

**Follow-up (same day): the composer now owns its own draft.** Memoising the
rows stopped them re-rendering, but the 1,400-line screen still re-rendered on
every keystroke because that is where the draft lived. `ChatComposer` and
`DmComposer` hold the text (and, in club chat, the caret and the @-mention
picker) themselves, so a keystroke re-renders the composer and nothing else.
They are memoised too, so messages arriving don't re-render the composer either.
The parent hands them `onSend(content) => accepted` and
`onPickMedia(draft) => staged`; the draft is cleared only on acceptance. The
mention caret logic moved across unchanged.

---

## 3. Images use React Native's `Image` — FIXED in 1.0.9 (native build)

RN's `Image` on Android has **no disk cache** and **no downsampling**: a
full-resolution Firebase photo was decoded at full size into a 220×160
bubble, and re-downloaded next launch.

1.0.9 switches every remote image (avatars, chat and DM photos, gallery,
feed posts, club logos, the zoom viewer) and the photo-picker previews to
`expo-image` (`~58.0.16`, the SDK 58 matrix version), with
`cachePolicy="memory-disk"`, a short `transition`, and `recyclingKey` on
list items so recycled rows never flash the previous photo. The bundled
splash/logo art and the AdMob icon stay on RN `Image`.

Uploads are shrunk first (`src/services/imageResize.ts`, using
`expo-image-manipulator`): photos over 2048 px (1024 px for avatars and club
logos) are resized and saved as JPEG at 0.82. Videos, GIFs and anything
already screen-sized go up untouched, and any failure falls back to the
original. This also stops large photos failing the ~7 MB base64 callables
(posts, DMs, avatars).

Both are native modules: JS that imports them must only reach 1.0.9+
binaries, which the 1.0.9 runtime version guarantees.

## 4. FlatList windowing is untuned

The message lists set no `windowSize`, `maxToRenderPerBatch`,
`initialNumToRender` or `removeClippedSubviews`. Defaults render a window of 21
screens' worth of rows. With 60 messages that is most of the list mounted at
once, which is also what made item 2 expensive.

`getItemLayout` is set only on the full-screen photo viewers, and can't easily
be added to the message lists (bubbles are variable height), but the batch
props can be, and `removeClippedSubviews` is a real win on Android.

Worth doing with a profiler open rather than blind — mis-tuned windowing shows
up as blank rows while scrolling fast, which is worse than the problem.

## 5. Mention matching runs on every render — FIXED

`app/club/chat/[channelId].tsx`:

```ts
const mentionQuery = mentionQueryAt(text, Math.min(cursor, text.length));
const mentionCandidates = mentionQuery ? matchMentionCandidates(...roster) : [];
```

Was unmemoised, scanning the whole roster twice per keystroke. Now a `useMemo`
inside `ChatComposer`, keyed on the draft, caret and roster.

## 6. Cold starts on the push trigger

Functions run with no `minInstances`, so `onChannelMessageCreate` cold-starts
after any idle period and that latency lands directly on notification delivery
— the first message after a quiet spell is the slow one. `minInstances: 1` on
that one trigger would fix it for roughly a few dollars a month. A cost
decision, not a bug; noted so it is a choice rather than an accident.

## 7. Unused `ChannelIcon` / `useRef` / `Text` imports

Three dead imports flagged by eslint (`club/chat`, `(tabs)/club`,
`ui/AnimatedSplash`). No runtime cost worth measuring — Metro tree-shakes — but
they are noise in a lint run that otherwise has to be read carefully.

---

# Follow-up — 2026-11-10: "things stall, then load"

Reported on iPhone: taps and screens lag, sometimes stall for seconds, then
load. Found by reading the code, not by profiling on a device. Firestore
itself is not the problem; how the app uses it was.

## 8. Nothing was cached between screens or launches — FIXED (JS, OTA)

The Firebase JS SDK has no persistent cache on React Native (it needs
IndexedDB), and most screens use one-shot reads, so every screen opened blank
and waited on the network. `services/localCache.ts` now keeps last-known data
in AsyncStorage (per account, wiped on sign-out, ignored after 14 days) and
screens paint it first, then refresh:

- club store (`club`, `role`, `members`, `userClubs`, `myClubs`): launch no
  longer waits on three sequential round trips; a failed refresh with cached
  data on screen stays quiet instead of showing the error screen
- club feed (posts + upcoming events) and the Events list

Display only: rules still enforce everything, so a stale cached role can show
a button but not make the write succeed.

## 9. Taps waited for the server — FIXED (JS, OTA)

RSVP, add/remove guest, seat assignment and add-boat each did read → write →
re-read before the screen moved. They now update immediately
(`applyOptimistic` in `app/club/event/[id].tsx`, using the shared
`withRsvp` / `withGuestAdded`), save underneath, then take the server's copy;
a failed save puts the screen back with an alert. Likes do the same
(`toggleLike(..., want)` sets rather than flips, so a double tap can't drift
the count).

## 10. Cold starts on calls people wait on — FIXED (server, costs money)

`KEEP_WARM` (`minInstances: 1`) on `openDmThread`, `createChannelUploadUrl`
and `finalizeChannelMedia`. Each warm instance bills while idle; check the
Cloud Run line in billing after a month and trim the list if it isn't worth
it. Still cold: `uploadDmMedia`, `uploadPostMedia`, `uploadAvatar`,
`createGroupChat`, and the push triggers (item 6).

## Still open

- Item 3 (expo-image + resize-on-upload): the cause of slow pictures. Native,
  planned for 1.0.9.
- Other one-shot screens (gallery, members' profiles, surveys list) could take
  the same cache-first treatment.
