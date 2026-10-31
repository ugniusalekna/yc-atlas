# YC Atlas

YC Atlas is a macOS/Linux Electron desktop app for exploring the public Y Combinator directory. It uses a shared HTML/JavaScript renderer and keeps an optional browser companion. The desktop app starts directly without a web server.

## Open the Mac app

The latest local Apple Silicon build is `release/openai-usage/mac-arm64/YC Atlas.app`. Open it in Finder. A portable Mac application archive is supplied alongside it as `release/YC-Atlas-mac-arm64.zip`.

From source, install Node.js 24 and run:

```sh
npm ci
npm start
```

`npm run dev` also starts Electron. For the browser companion, use `npm run web` and open http://127.0.0.1:4173. Live website rendering and automatic snapshot updates require the desktop app.

## Desktop features

The Mac shell uses native traffic-light window controls, a draggable toolbar, system typography, native application menus, and file dialogs. Linux uses its own window decorations. Search is Cmd/Ctrl+F. Cmd/Ctrl+1 through 5 open Explore, Reels, Summary, Saved, and Liked.

Reels displays the actual company website in an isolated Chromium `WebContentsView`. JavaScript, normal page animations, and scroll-triggered effects remain live. It holds the top of the page briefly, scrolls at an adjustable constant pixel speed, pauses at the bottom, and repeats. Reels uses Electron’s existing Chromium engine with a bounded pool of three reusable page views. The next recommendation loads in the background, the previous page can be revisited without reloading, and an isolated persistent session caches website assets. Pages become visible at DOM readiness instead of waiting for all assets to finish. Leaving Reels closes the pool. Scroll or press Up/Down to move between companies. Reel navigation uses a vertical slide: transient viewport frames animate inside the preview area, then hand back to the live Chromium view. These frames are discarded, not stored as a screenshot database. Animations respect reduced-motion settings. The website domain, icon-only pause/play control and an overflow menu share the bottom bar. In paused Browse mode, stemless back/forward chevrons appear immediately to the left of play; they navigate only within the current company’s website history and disable unavailable directions. The browsing hint and visible Pause/Resume text are removed; accessible labels and shortcut tooltips remain. Pause enters browsing: wheel/trackpad and arrow keys belong to the website, normal HTTP(S) links navigate within the preview, and Esc, Space or Resume returns to watching from the current position. The overflow menu contains Auto-next and scroll speed, with no Previous/Next-company or Restart controls. Auto-next and speed persist locally. With Auto-next off (the default), reaching the bottom repeats the website; with it on, reaching the bottom after the hold advances once to another company. Paused browsing and open playback menus suspend automatic actions. Playback menus and filter dropdowns retain a frozen image of the website while open, with a decode/paint acknowledgement before the native Chromium view yields. Closing them restores the live view at the current position; stale captures are discarded. The domain link follows the actual navigated page. Changing reels automatically resumes scrolling. Dragging the website scrollbar pauses it; Resume continues from the current scroll position, including any movement made while paused. Space pauses watching from the app or the live website; while browsing, arrow keys scroll the website, while Space or Esc resumes watching; spaces typed in website text fields retain normal behavior; typing in search and editing filters retain their normal keyboard behavior. Reduced-motion settings initially pause auto-scrolling. Some websites use custom scrolling, show cookie dialogs, or block loading; Visit opens them in the system browser.

Heart and bookmark are separate actions. Liked companies have their own tab. With likes, the recommender selects roughly 70% of new suggestions using YC-tag overlap, description neighbors, and description groups; the other 30% are random exploration. Without likes it starts randomly. Recently viewed companies are avoided where possible. Previous/Next preserves session history. Recommendations run locally and do not use an external model service.

Reels opens in **For you**, keeping the same mix of personalized recommendations and random discovery. The feed label, eligible count, and Filters share the Reels heading row, with no duplicate directory total. Company descriptions open by default; a subtle YC profile link opens the source company page. **Filters** optionally narrows the feed using Explore’s topics, broad geographic regions, batches, status, YC tags, years, and description groups. Topics, regions, batches, and status accept multiple selections: OR within each field, AND across fields. Draft selections show a matching count; **Apply** changes the feed and **Cancel** keeps it. Search in Reels stays within Reels. Recommendations, random picks, preloaded websites, and Previous navigation all respect the applied scope. **Back to For you** clears the scope. Reel filters have separate URL parameters and do not silently change the default feed.

Summary accepts any two available batch years, supports swapping them, and shows cohort totals, tagging coverage, and changes in tag share. Both years' tag counts can open their company lists. These compare current snapshot tags across cohorts, not historical measurements of those companies.

Update snapshot fetches YC's public directory configuration, gathers each batch, verifies reported coverage, and stages a replacement dataset. It reuses semantic maps when descriptions/memberships are unchanged, otherwise rebuilds them in an Electron utility process. The checked-in MiniLM model can be bundled at packaging time from `.cache/models`; if absent, refresh downloads it into the user's semantic cache. Maps and source hashes are verified before an atomic active-snapshot pointer is changed. A failed refresh preserves the previous snapshot. Progress is visible, and browsing can continue during the job. Updated snapshots live under Electron's application-data directory, separately from the installed app.

## Internal assistant

Open **Chat** beside Explore, Reels, and Summary (Cmd/Ctrl+6). It is a full-height chat workspace, with a collapsible conversation rail, searchable history grouped by recency, a central reading column and a bottom composer. Active replies show an animated activity indicator, the current stage (thinking, tool use, or writing), and elapsed time; completed replies retain their duration. New chat creates a separate conversation; each has its own draft and selected-text attachment. Chats are saved locally across restarts in `yc-atlas-chats-v1`; API keys remain separately encrypted in the main process. Use a chat’s ⋯ menu to rename or delete it; Delete offers Undo for eight seconds, with a dismiss button; the notice expires even after the app has been in the background. Enter sends and Shift+Enter adds a line. A reply stays attached to its original conversation when you switch chats or navigate elsewhere. Each conversation remembers its reading position across tab changes, chat switches and app restarts. Streaming follows new text while you are at the bottom and preserves your place when you scroll up. Temporary chat notices appear in the conversation sidebar; shared app notifications appear in the upper-right corner, away from the composer.

Company references are validated local IDs: clicking one switches to Explore and centers its highlighted logo. Return to Chat to continue the conversation. Right-click highlighted text in Atlas or a live Reels website and choose **Ask in Chat** to open a new conversation with the selection attached and an empty composer. The message remains a draft until you type and send a question. Sent selections appear as collapsible quote cards above the message; their text is included in model context separately. Within an existing chat, select text in a completed message and click **Ask follow-up** (or use right-click → Ask in Chat). This keeps the current conversation and draft. The quote records its source message ID and index, exact UTF-16 offsets in the rendered message, and a surrounding passage with the selected occurrence marked for the agent. Repeated words therefore retain their specific original context, including after native context compaction. The source attachment persists with drafts, sent messages and edited branches. Earlier chats with embedded selections migrate to cards. External Ask in Chat selections freeze their original source view, company, filters and capture time when invoked. Reels source state includes its own applied feed filters. Selections from a live rendered website are explicitly labeled as website selections, with the actual page URL, frame URL and title captured when its native selection menu opens. This source context is stored on the quote and sent with the question, even after switching tabs or changing filters before sending. It is also included as quoted background context in the message history for subsequent native-thread imports and edited branches.

Chat is powered by the bundled **Codex App Server 0.164.0**, with persistent Codex threads, native tool execution, automatic context compaction, and optional research delegation. The previous custom Responses/Messages loop and its fixed character/step limits have been removed. Claude is no longer offered for new requests; older local conversations and usage records remain readable.

In **Chat → gear → Authentication**, choose either:

- **ChatGPT account**: click **Continue with ChatGPT** and finish Codex-managed sign-in in your browser. Your available Codex account access and plan limits apply. Sign out and Cancel sign-in are available here too. Codex keeps account credentials in the operating system credential store under Atlas's own profile.
- **OpenAI API key**: enter a key and optionally remember it using Electron safeStorage. API usage is billed to that API account independently of any ChatGPT subscription. Keys remain in the main process and are never returned to the renderer or exposed to Reels websites. On Linux, insecure basic_text storage is refused; session-only keys remain available.

Choose a model ID and reasoning effort. **Load available models** loads the Codex catalogue; a catalogue entry does not guarantee your account has access. Model IDs can also be typed manually, with provider errors shown directly. Authentication and model changes do not silently replace the selected model. API and ChatGPT authentication use separate Atlas Codex homes, independent of an existing `~/.codex` installation. No separate Codex installation is required by the packaged app.

Capabilities include public directory search and description neighbors, native web search, workspace commands, research delegation, reading likes/folders, optional private notes, map navigation, and creating folders/saving/moving companies when requested. Search, web, workspace commands, delegation and navigation default to enabled; private library, notes and organization default to disabled. Changes to capability scope create separate native thread contexts. Switching authentication or revoking library/notes access also prevents reusing earlier private conversation context under the new scope.

Each conversation has a protected research workspace under app userData. With directory search enabled, Atlas exports the current public snapshot as `companies.jsonl` and `directory-info.json`, refreshing those exports on subsequent turns. Codex can inspect the directory in batches, keep research notes, and continue after its native context compaction. This supports whole-directory research without inserting thousands of descriptions into a single chat message. The dataset is available locally to command tools; relevant excerpts and tool results can enter remote model context. Library data and notes are supplied only through enabled Atlas tools. Source content is treated as evidence rather than instructions.

Command tools default to read/write access in that conversation's research workspace, plus Codex's minimal system access. Shell commands start with a restricted environment without the API credential. Network access from commands and additional filesystem access require a visible native approval request. Atlas shows commands, requested permissions, and file-change details for review. Approvals do not silently grant permanent rules. Codex's provider-backed web search is separately controlled by the web capability. Stop interrupts the native turn, including pending approval requests; completed folder changes are not undone.

The engine owns context management and tool rounds. Atlas has no fixed conversation character budget or model-round cap; native model context, account quotas, tool/runtime failures and cancellation still apply. Old Atlas chats import their visible transcript into a fresh Codex thread on first reply. Further replies resume the native thread and send the new question, retaining Codex tool/research history. Editing branches into a separate native thread and preserves the original.

Replies support sanitized Markdown, tables, code blocks, external source links, and validated `[[company:ID]]` links into Explore. Context compaction, commands, search, and writing are reflected in the activity indicator. Titles are generated by a separate ephemeral, tool-free Codex thread after the first successful exchange and selected later milestones, using the selected model; title usage is included in tracking. Manual names are preserved.

The chart icon opens the existing daily usage heatmap. It combines native token reports from conversations, attributed delegated research, and background titles. Cumulative counters are differenced and deduplicated; native activity reports can cover several model requests, so their count is labeled **Usage reports**. Input/output, cached tokens, background tokens and model breakdown remain available. API costs use the dated local rate table where accounting is sufficient; unknown models, tiers or cache-write durations stay unpriced. ChatGPT plan tokens are labeled **ChatGPT plan**, not assigned API dollar charges. Available account rate-limit windows are shown when Codex supplies them. These are local estimates, not an invoice or a complete account-wide billing export. Earlier usage and reports without token counts cannot be recovered.

Settings, encrypted keys, Codex authentication, native thread history, research files and usage records live in app userData and are not included in the application archive or library export. Native threads can contain tool results, selected quotations and model context, in addition to the renderer's locally saved visible chats. Deleting a chat removes its visible Atlas history; it is not a secure erase of native runtime files or research notes.

Automated checks cover fragmented Codex transport, secret/environment isolation, native tool dispatch, capability enforcement, approvals/questions, resume and interruption, usage deduplication, authentication separation, background titles and Chat UI flows. The real bundled binary has been checked for initialization, isolated signed-out authentication, model listing and protected thread/tool creation. **Live browser authentication, authenticated model inference and native GUI rendering remain unverified in this environment.** No existing personal Codex credentials were used.

Implementation references: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference), and [Sign in with ChatGPT with Codex App Server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

## Bring your saved companies into desktop

Browser storage and desktop storage are separate. In the updated browser companion, click **Export library**. In the desktop app, use **File → Import library** or the footer Import library button. The JSON backup includes saved companies, folders, notes, original save dates, and likes. Import merges with the current library rather than replacing existing saved records. The browser companion retains your earlier ID-only bookmarks through migration. CSV remains available for exporting a selected folder's company data.

## Build and verify

```sh
npm run check
npm test
npm run smoke:desktop
npm run package:mac
npm run dist:mac
```

`package:mac` produces a `.app` for the Mac's architecture; `dist:mac` additionally builds ZIP/DMG installers. The current local artifact targets Apple Silicon. For Ubuntu, build on Linux with `npm run dist:linux` to produce AppImage and Debian packages. `.github/workflows/desktop.yml` supplies manual/tag-triggered macOS and Ubuntu packaging jobs. Linux binaries have not been built or GUI-tested in the local Mac environment.

The local Mac build is ad-hoc signed, not Apple-notarized. Public distribution can use an Apple Developer signing identity and notarization configuration.

Automated tests cover data provenance, semantic source consistency, explorer interactions, folders and context menus, recommendations and separate likes, arbitrary-year comparisons, protocol/IPC validation, constant-speed scroll arithmetic, and atomic snapshot refresh/reuse/rollback. Additional controller tests verify DOM-ready display, bounded view reuse, preloading, cached back navigation, late-load cancellation and transition handoff; timed D3 tests verify camera motion and restoration. The desktop smoke test opens a real Electron window and an animated scrolling fixture without visiting third-party sites, using isolated test storage.

GUI verification is currently blocked in this execution environment: Electron aborts in macOS application registration (`_RegisterApplication`) before app JavaScript executes. Earlier Chrome/Brave launches also failed here. No successful desktop GUI or live-site playback test is claimed. The `.app` package and automated non-GUI checks are verified. In addition, the packaged Electron executable successfully loaded the bundled MiniLM model and native ONNX runtime in Node mode and produced 384-dimensional embeddings with network model loading disabled.

## Explore

Main navigation remembers each workspace for the current app session. Returning to Explore restores topic, filters, map/list mode, description group, company selection, page, map camera (at the same viewport size), and list/sidebar/inspector scroll positions. Region dismissal retains its pre-region camera. Other tabs keep their own navigation state, too. Explicit company links/search results still navigate to the requested company. The All companies/home breadcrumb remains available for returning to the overview.

- Topic clusters show real company logos. Click a cluster to zoom into its companies.
- Explore company details and Reels share the same Like, Save, Folder, and Visit icon controls, including saved/liked states and folder menus. Category counts use a fixed, right-aligned column.
- Explore search finds companies by name, description, location, and tags without filtering the map. Click a result or press Enter to open its topic/description group, reveal the correct map page, and animate to its selected logo. Arrow keys choose suggestions; Escape dismisses search before changing the map. Compatible filters stay active; only conflicting facets are cleared, with a notice. Companies without map coordinates open selected in the list. Saved, Liked, and Reels retain their text-filter behavior. Combine batch, status, and region filters. Each dropdown supports multiple selections (OR within a dropdown, AND between dropdowns). Broad regions such as Europe, North America, and Asia appear first; country and remote-work options are grouped separately. Region membership uses YC geography tags and deduplicates companies with several matching locations.
- Switch to the complete paginated list. Company lists contain 72 companies per page. Topic maps initially show semantic cluster regions. Select a region to reveal company markers, with the other regions retained for context. Map Settings defaults to 100 companies per page and offers 50, 200, 300, or all companies in the selected group, plus a logo-size slider. Paging and settings changes retain your camera position and zoom. The scattered overview shows all 14 topics without pagination. Company counts appear on hover or keyboard focus.
- Filters, view, pagination, and selected companies are stored in the URL. Browser Back restores exploration state. Saved companies stay in this browser's local storage.
- Use Tab and Enter to navigate clusters and companies, `/` to focus search, and Escape to dismiss a popup, clear only the selected description group, or close company details. Clicking the map background also clears only the description group, preserving topic and dropdown filters.
- Open Summary for cohort signals and unusual approaches, then inspect the actual matching companies. Region and status filters also apply to Summary.
- Download the full dataset from the footer.

## Saved companies

Saved opens as a list with All saved and your own folders. Right-click a folder, or click its ⋯ button, for Rename folder and Delete folder. A selected folder also has a visible Delete folder button above its list. Deleting a folder keeps its companies in All saved, with dates and notes preserved. There is no default Unfiled folder.

Right-click a company, or use the ⋯ button on its saved row, to move it directly to any folder, create a new folder for it, remove it from a folder, or remove it from Saved. Company context menus also work on map logos and on unsaved companies, where they offer saving directly into a folder. The inspector's Move to folder button opens the same menu. Arrow keys, Home/End, Escape, and the keyboard context-menu shortcut are supported; menus close when scrolling or clicking elsewhere. Removing a company has Undo. Saved rows have no selection checkboxes.

Sort by recently saved, oldest saved, or company name. New saves record their actual addition time. Earlier ID-only bookmarks migrate automatically, preserving their relative addition order; dates that were never recorded are explicitly shown as unavailable. Moving folders never resets the save date. Sorting preferences, folders, and notes persist in this browser under `yc-atlas-library`; the original `yc-atlas-saved` ID list remains readable for compatibility. Records absent from a later directory snapshot remain in storage.

Private notes save automatically, and Saved search includes their text. Export CSV includes the current folder and filters, with source links, save dates, and notes. Storage errors are surfaced in the UI; changes remain available in memory for that session.

`dist/saved.js` owns migration, storage, sorting, and CSV encoding. `scripts/test-saved.mjs` checks the store and full app flows, including context menus, keyboard focus, reloads, folder deletion, export, Undo, and removal of the earlier checkbox and Unfiled interfaces.

## Data

The initial snapshot contains **6,344 unique public directory records**, collected on **27 October 2026**, directly from the public search service used by https://www.ycombinator.com/companies. Every YC batch was fetched independently to avoid the search result cap. Returned batch counts and the unique company total were verified against the directory's reported counts.

Logos use the URLs published by YC. Unavailable logos fall back to company initials. The snapshot is not a live sync. YC may change details or publish additional companies after collection.

Topics overlap. They are derived from YC tags and industry fields only, with a fallback group ensuring every company remains accessible. These are exploratory topics, not official YC cohorts. The rules are in `scripts/prepare-data.py`; every company includes `topicEvidence` with its matching tags or industry fallback. Descriptions do not assign topics. Topic circle area is proportional to the number of matching companies, including active filters. Counts overlap because companies can belong to several topics. Overview topic positions are arbitrary. Inside a topic, spatial proximity reflects approximate description similarity, not company quality or ranking.

Refresh and verify:

```sh
python3 scripts/refresh.py
npm run build:semantic
npm test
npm run check
```

Refresh fetches the current public directory configuration; no private API credentials are needed. If counts do not reconcile, it stops without overwriting the existing snapshot.

Verification includes data checks and DOM interaction tests (`npm test`). The original Hallmark static sweep passed; subsequent changes follow the existing design system. Browser and Electron GUI rendering could not be verified in the build environment; no screenshot pass is claimed. `puppeteer-core` is available as a development dependency for later Chrome QA. The deployed site has no npm runtime dependencies. D3 is distributed locally under its ISC license.

## Description similarity maps

The checked-in `dist/data/semantic.json` contains real local sentence embeddings projected into two dimensions. It covers 6,289 companies with usable summary or description text; 55 companies have no text and are available in a separate list. Only summary and description text is embedded; company names, logos, valuations, and geographic labels are not added as separate features.

The build uses [MiniLM sentence embeddings](https://huggingface.co/Xenova/all-MiniLM-L6-v2) through Transformers.js, mean pooling, L2 normalization, and [UMAP](https://github.com/PAIR-code/umap-js) with cosine distance. Each topic has its own projection across all its companies. K-means groups the embeddings; labels are distinctive terms found in descriptions. A gentle collision adjustment stays anchored to projected coordinates. Nearby points are related, but the projection loses information: axes have no units and exact distances should not be read as scores.

The semantic map initially renders only a small number of density-contour regions and labels, with no company markers or company-image requests. Select a shape, map label, sidebar group, or the description-group picker to expand one group. Other groups remain collapsed for context. By default, 100 company markers are mounted per map page. Settings offers 50, 100, 200, 300, or all members of the selected group. Every member remains accessible through paging. List mode uses 72 rows per page and respects the selected group; its filter chip clears the group independently.

Regions follow the full snapshot projection so filters do not reshape the map. Semantic anchors stay fixed; cached local collision adjustments give expanded markers space. Markers grow moderately on screen when zooming in, with proportional hover outlines and adjustable base size. Opening regions, switching groups, and selecting companies animate from the current camera. Deselecting a group animates back to the exact pan and zoom used before opening it, preserving the topic and dropdown filters. A fitted overview is used only if no prior camera exists, and Fit remains available explicitly. The All groups control collapses the active group; selection and page are stored in the URL. Selecting a company, including from Similar descriptions, centers and zooms the map to its logo. Selecting a description group in list mode preserves list mode. Company details and list rows show assigned topics, inferred description groups, and geographic regions. Dense-region geometry and expanded layouts are cached, and off-screen company images are not requested.

`npm run build:semantic` computes the maps locally, downloading the public model on first use if needed. It requires installed development dependencies. Model weights and embeddings are cached under ignored `.cache/`, and are not served by the website or included in its portable ZIP. The site only loads precomputed coordinates and groups; it does not send company descriptions to an inference API. A source fingerprint prevents stale maps from being used after a directory refresh.

`npm test` verifies source coverage, source fingerprints, region/filter stability, semantic groups, and scattered layout geometry. When the embedding cache is available, it also checks that projected neighbors have higher embedding similarity than baseline pairs in five sample maps.

## Summary signals

The Summary compares the two selected snapshot cohort years, excluding future years. The default pair is the latest two substantial cohorts. Tag shares use only companies with at least one tag, with coverage and denominators displayed. Changes are percentage points, not company growth or investment activity. Tags can overlap and the newest cohort may be incomplete. Clicking a signal opens the exact tag and cohort year in the list.

Unusual approaches are editorial selections from company descriptions. Their rationales are source-grounded, not claims of market uniqueness. Small tag-frequency annotations are computed from the full snapshot. Summary calculations are in `dist/insights.js` and tested against independent source counts.

## Design

Hallmark Coral app scope: warm surfaces, General Sans, orange selections, company-logo topic clusters, persistent inspection panel, responsive mobile controls. External font loading falls back to system sans when unavailable. An independent explorer, not affiliated with YC.

## Shared application controls

The footer snapshot date is the update action: hovering or focusing it reveals Update snapshot and clicking opens the existing refresh dialog. It stays available in Chat as well as the directory tabs. Footer source boilerplate and the Saved/Chat local-storage notes are removed. CSV and library confirmations use the warm application surface rather than dark tooltip styling.

Map settings use a gear immediately left of Map/List in the shared Explore/Saved/Liked toolbar. Map/List remain anchored when settings are hidden. Reels uses a filter icon between playback and the overflow menu; its popover has searchable facets, draft Reset, a live matching count, and Apply/Cancel. Re-rendering a reel retains the original filter button and its handler.

`dist/dropdowns.js` provides application-themed single-choice menus and editable model/clarification suggestions, preserving underlying form values and change events. It enhances dynamic controls in Summary, Chat, Usage and Reels; supports search, keyboard navigation, disabled choices, outside/Escape dismissal, and modal-contained popups. Multi-select filters retain checkboxes and use the same surface and centered geometric chevrons. Native browser controls inside company websites are unaffected. Reels yields its native view to these menus using the existing frozen-preview handshake.
