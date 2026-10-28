# YC Atlas

YC Atlas is a macOS/Linux Electron desktop app for exploring the public Y Combinator directory. It uses a shared HTML/JavaScript renderer and keeps an optional browser companion. The desktop app starts directly without a web server.

## Open the Mac app

The latest local Apple Silicon build is `release/company-actions/mac-arm64/YC Atlas.app`. Open it in Finder. A portable Mac application archive is supplied alongside it as `release/YC-Atlas-mac-arm64.zip`.

From source, install Node.js 24 and run:

```sh
npm ci
npm start
```

`npm run dev` also starts Electron. For the browser companion, use `npm run web` and open http://127.0.0.1:4173. Live website rendering and automatic snapshot updates require the desktop app.

## Desktop features

The Mac shell uses native traffic-light window controls, a draggable toolbar, system typography, native application menus, and file dialogs. Linux uses its own window decorations. Search is Cmd/Ctrl+F. Cmd/Ctrl+1 through 5 open Explore, Reels, Summary, Saved, and Liked.

Reels displays the actual company website in an isolated Chromium `WebContentsView`. JavaScript, normal page animations, and scroll-triggered effects remain live. It holds the top of the page briefly, scrolls at an adjustable constant pixel speed, pauses at the bottom, and repeats. Reels uses Electron’s existing Chromium engine with a bounded pool of three reusable page views. The next recommendation loads in the background, the previous page can be revisited without reloading, and an isolated persistent session caches website assets. Pages become visible at DOM readiness instead of waiting for all assets to finish. Leaving Reels closes the pool. Scroll or press Up/Down to move between companies. Reel navigation uses a vertical slide: transient viewport frames animate inside the preview area, then hand back to the live Chromium view. These frames are discarded, not stored as a screenshot database. Animations respect reduced-motion settings. The website domain, Pause scroll, Speed, Restart, Previous, and Next share the bottom bar, leaving more space for the live website. Changing reels automatically resumes scrolling. Dragging the website scrollbar pauses it; Resume continues from the current scroll position, including any movement made while paused. Space pauses or resumes scrolling from the app or the live website; typing in search and editing filters retain their normal keyboard behavior. Reduced-motion settings initially pause auto-scrolling. Some websites use custom scrolling, show cookie dialogs, or block loading; Visit opens them in the system browser.

Heart and bookmark are separate actions. Liked companies have their own tab. With likes, the recommender selects roughly 70% of new suggestions using YC-tag overlap, description neighbors, and description groups; the other 30% are random exploration. Without likes it starts randomly. Recently viewed companies are avoided where possible. Previous/Next preserves session history. Recommendations run locally and do not use an external model service.

Reels opens in **For you**, keeping the same mix of personalized recommendations and random discovery. The feed label, eligible count, and Filters share the Reels heading row, with no duplicate directory total. Company descriptions open by default; a subtle YC profile link opens the source company page. **Filters** optionally narrows the feed using Explore’s topics, broad geographic regions, batches, status, YC tags, years, and description groups. Topics, regions, batches, and status accept multiple selections: OR within each field, AND across fields. Draft selections show a matching count; **Apply** changes the feed and **Cancel** keeps it. Search in Reels stays within Reels. Recommendations, random picks, preloaded websites, and Previous navigation all respect the applied scope. **Back to For you** clears the scope. Reel filters have separate URL parameters and do not silently change the default feed.

Summary accepts any two available batch years, supports swapping them, and shows cohort totals, tagging coverage, and changes in tag share. Both years' tag counts can open their company lists. These compare current snapshot tags across cohorts, not historical measurements of those companies.

Update snapshot fetches YC's public directory configuration, gathers each batch, verifies reported coverage, and stages a replacement dataset. It reuses semantic maps when descriptions/memberships are unchanged, otherwise rebuilds them in an Electron utility process. The checked-in MiniLM model can be bundled at packaging time from `.cache/models`; if absent, refresh downloads it into the user's semantic cache. Maps and source hashes are verified before an atomic active-snapshot pointer is changed. A failed refresh preserves the previous snapshot. Progress is visible, and browsing can continue during the job. Updated snapshots live under Electron's application-data directory, separately from the installed app.

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
