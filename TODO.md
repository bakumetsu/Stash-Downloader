# TODO

## Backlog

### Fork fixes (bakumetsu fork)
- [ ] Replace fork workaround for rule34.xxx 404 (`-f` removed) with format fallback that keeps quality selection
- [ ] Restore scraped cover image without the "no-adapter" error (fork disabled it)
- [ ] Re-evaluate scraper order (fork put StashScraper ahead of yt-dlp)
- [ ] Point CI `PAGES_URL` / manifest `url` fields at this fork


### CI/CD
- [ ] **Automated browser store uploads**: Auto-submit extension updates to Firefox Add-ons when `browser-extension/manifest.json` version changes
  - Extension is live on AMO: https://addons.mozilla.org/en-US/firefox/addon/stash-downloader-extension/
  - Detect version changes with `git diff HEAD^ HEAD -- browser-extension/manifest.json | grep '"version"'`
  - Use `web-ext sign` for AMO with API credentials
  - Status: Manual uploads currently (automated in future)
  - See: https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign

### Features
- [ ] Resume interrupted downloads
- [ ] Download history view

### UI/UX
- [ ] Keyboard shortcuts (using Mousetrap from PluginApi)
- [ ] Drag-and-drop queue reordering
- [ ] Bulk select/delete queue items

### Testing
- [ ] Add unit tests for Logger utility
- [ ] Add integration tests for download flow

## Completed
- [x] Edit & Import advances to the next pending item on click (import continues in background); finished imports no longer reopen the modal
- [x] Large downloads no longer cancelled at 10 min: stall detection (5 min without progress, READY time excluded) + Range-resume of dropped direct downloads
- [x] Faster metadata for new URLs: extraction via `runPluginOperation` (not queued behind downloads), max 3 concurrent; rule34video parser runs before yt-dlp
- [x] rule34video.com: built-in page parser fallback when yt-dlp's extractor fails ("No video formats found"); re-fetches fresh tokenized URLs on download
- [x] Copy button in Activity Log toolbar (copies filtered logs as plain text, works over plain HTTP)
- [x] Fix 404 on page reload: routes moved from `/plugin/{id}` (owned by Stash server) to `/downloader` and `/browser`; old paths redirect in-app
- [x] Empty download path falls back to Stash library, then `/data/StashDownloader` (from RubyDevil fork)
- [x] Stash Browser post detail modal click-through fix (from RubyDevil fork)
- [x] Firefox extension published on [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/stash-downloader-extension/)
- [x] Proper job cancellation via Stash jobQueue (cancels all queued + running jobs)
- [x] Remove concurrency setting (Stash processes jobs sequentially anyway)
- [x] In-modal download progress with auto-advance to next item (no close/reopen cycle)
- [x] Firefox clipboard UX - opens modal directly with manual paste note
- [x] Retry button for failed queue items
- [x] Navbar icon for quick access to downloader
- [x] Queue position indicator in edit modal (1 of X)
- [x] Skip button for multi-item workflow
- [x] "Exists in Stash" badge on duplicate queue items
- [x] Activity log improvements (reduced verbose noise)
- [x] Logger migration: All `console.*` calls migrated to `createLogger()` pattern (20 files)
- [x] Remove test-app infrastructure (standalone testing environment)
- [x] Add `npm run build:stash` script for easy plugin packaging
- [x] BooruScraper for image booru sites (Rule34, Gelbooru, Danbooru)
- [x] Content type support (Video, Image, Gallery)
- [x] Image/gallery downloads
- [x] Re-scrape feature with scraper selection dropdown
- [x] Central Logger utility with log level filtering
- [x] Log level UI setting (off/error/warning/info/debug)
- [x] Thumbnail preview toggle
- [x] ESLint v9 flat config migration
- [x] Automatic Stash library integration and scan triggering
- [x] Metadata matching service
- [x] Entity creation (performers, tags, studios)
- [x] Duplicate URL detection in queue
- [x] Persist download queue to localStorage
- [x] Remove download button from queue items (users must open edit modal)
- [x] Auto-trigger metadata matching when opening edit modal
- [x] Add clear button to each metadata section (Performers, Tags, Studio)
- [x] Add clear all button for matched metadata
