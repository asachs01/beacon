# [1.42.0](https://github.com/nyabb/beacon/compare/v1.41.0...v1.42.0) (2026-11-05)


### Features

* **settings:** group avatar emoji picker under translated category headings ([fb9aad8](https://github.com/nyabb/beacon/commit/fb9aad82a2ce2e63ed7a97ef2497fffab52d7a78))

# 1.0.0 (2026-11-05)


### Bug Fixes

* add CHANGELOG.md to beacon/ add-on directory ([6f666b5](https://github.com/nyabb/beacon/commit/6f666b54a2dea7518817716db51e9bd3824266fe))
* add chore edit/delete UI, assignee visibility, and dynamic version ([103ad44](https://github.com/nyabb/beacon/commit/103ad4438749aedec825226b3fba55b1f403717b)), closes [#1](https://github.com/nyabb/beacon/issues/1)
* add default BUILD_FROM value in Dockerfile ([1b3eacd](https://github.com/nyabb/beacon/commit/1b3eacd00b7d606bd24288e02b072e9a67ef83bd))
* add ha_token config option for add-on authentication ([582bb46](https://github.com/nyabb/beacon/commit/582bb46406c2b0d726fcfcea429cdb37d0461cf4))
* add ha_token option for browser-side HA auth ([13d4674](https://github.com/nyabb/beacon/commit/13d46742712ac018aca4d1e3fe070702a7982b70))
* add icon.png and logo.png for HA add-on store listing ([1533e06](https://github.com/nyabb/beacon/commit/1533e069285fd681b92d970c0c70989002f2e5c9))
* add image field to config.yaml, remove dead GroceryDrawer ([e97f210](https://github.com/nyabb/beacon/commit/e97f210da517bdbf477fecc251cbc076878bbce3))
* add safe area padding to mobile tab bar for iPhone home indicator ([f3a24a3](https://github.com/nyabb/beacon/commit/f3a24a38cf4c0a82110732de0d60f208eefb0f87))
* add viewport-fit=cover for iOS safe area insets ([84ff7b3](https://github.com/nyabb/beacon/commit/84ff7b3a5047e907571c1d1ebacee1c4d4960b71))
* align CSS variables with theme hook — dark themes now render correctly ([bebb34a](https://github.com/nyabb/beacon/commit/bebb34a4f4f5b3fa9e88df406e7aaa5e418c7e19))
* all-day event dtend, calendar visibility persistence, chores toggle, assignee display ([2fe7cc3](https://github.com/nyabb/beacon/commit/2fe7cc3cce58cc72c748dcc38d0b4707e9fd7dd1))
* all-day events align with calendar day columns ([07563f4](https://github.com/nyabb/beacon/commit/07563f44fdb13296ff8bf1e2fee2367abb8bc693))
* allow HA connection without token in ingress mode ([bc2ef35](https://github.com/nyabb/beacon/commit/bc2ef35cdda606ef3076443a3a2e4468bf59841b))
* bucket chore and routine completions by local day, not UTC ([3a8ff59](https://github.com/nyabb/beacon/commit/3a8ff593b599bec84be1870243e88e733ddfd00b))
* **build:** exclude test files from production tsc build ([#12](https://github.com/nyabb/beacon/issues/12)) ([1bbb873](https://github.com/nyabb/beacon/commit/1bbb8736e87d4f8607e21ea6c14d041a5f5174cd))
* calendar layout whitespace and add-on auth/URL resolution ([0daec9f](https://github.com/nyabb/beacon/commit/0daec9f94b89b51b55926f5781e7a426fa3c7430))
* calendar/lists work via API proxy without WebSocket or user token ([9840db4](https://github.com/nyabb/beacon/commit/9840db4d7415519b01791a7fa5719c682d0d1913))
* chore assignee badges overlapping text on Calendar screen ([9c777f2](https://github.com/nyabb/beacon/commit/9c777f2308df9caae46ff6591e7dd23ef42f700e))
* chore value input lets you type freely ([d0b4d09](https://github.com/nyabb/beacon/commit/d0b4d0927aec377c2d23887953479e872225dff4))
* chores/leaderboard panels close on view change, compact mobile weather ([78a4df4](https://github.com/nyabb/beacon/commit/78a4df4fc1388d69e26f7ea8694b8c990280e2ac))
* ChoresView uses available width on large screens ([8956e4a](https://github.com/nyabb/beacon/commit/8956e4ad6c73d1aca831408a59ab819a34e219bf))
* **ci:** checkout the post-release commit in build-addon.yml, not the stale pre-bump sha ([17d2bf9](https://github.com/nyabb/beacon/commit/17d2bf9b6d235f89541fac78fbe167dcd9cccf6d))
* **ci:** correct workflow_call detection in build-addon.yml ([949b8bb](https://github.com/nyabb/beacon/commit/949b8bb8303c3ebd3a77a1ac27edcf80e5342a7d)), closes [#1](https://github.com/nyabb/beacon/issues/1)
* **ci:** publish images to fork GHCR namespace and exclude .env from build context ([4435d33](https://github.com/nyabb/beacon/commit/4435d33ec0265ad58d32a2044032778335f282e4))
* clean up duplicate sidebar CSS rules, force display:flex in ingress ([015a4de](https://github.com/nyabb/beacon/commit/015a4de6515ff99be7154bff9738614f4382737d))
* clone sidebar nav into mobile menu for docs navigation ([ba50aff](https://github.com/nyabb/beacon/commit/ba50aff3331b1a053f6ad55c98f06639f8e8c442))
* copy run.sh to / (root) where hassio base expects it ([1e03774](https://github.com/nyabb/beacon/commit/1e03774e832817761494cb07516064fd679132f4))
* create recurring calendar events via HA WebSocket API ([ae02469](https://github.com/nyabb/beacon/commit/ae024697d75e41a473f368e6299351baea7e908d))
* dashboard equal thirds layout, weather moved to clock column ([870c13d](https://github.com/nyabb/beacon/commit/870c13d0fd4d1b5bed6fca308431017300682203))
* **dashboard:** render Family layout as vertical columns, not stacked rows ([bac3427](https://github.com/nyabb/beacon/commit/bac34279e5ba91b0b1e4194631f9eaed3e4ecdb5))
* deduplicate media players, prefer device_class entity for controls ([4d0b587](https://github.com/nyabb/beacon/commit/4d0b58780279bde3993403ac594899ff7b7fff30))
* default docs to dark mode, improve prose text contrast ([04dee77](https://github.com/nyabb/beacon/commit/04dee778f2a0751ed614552a174eff9197eae157))
* define missing CSS vars, music empty state, touch target sizes ([e240dd7](https://github.com/nyabb/beacon/commit/e240dd7665800b4645cec134f73594a8f49c358f))
* desktop sidebar showing on mobile — removed inline display:flex that overrode media query ([b0b187f](https://github.com/nyabb/beacon/commit/b0b187f2b2ebe18e842f98055409d25547a886bc))
* detect HA ingress via URL path, not just iframe ([5bbbef7](https://github.com/nyabb/beacon/commit/5bbbef79bc7991c1ae287d8a686265a12ba1f9ea))
* disable event notifications and permission prompt on kid displays ([d0206a1](https://github.com/nyabb/beacon/commit/d0206a16913070d2479cba967675893d620ad9ed))
* discover all todo.* entities for AnyList, fix API URL for ingress ([c10afe5](https://github.com/nyabb/beacon/commit/c10afe51e5d24ee89f973ee679b74f2493c2a411))
* **docker:** add missing custom_intents/custom_sentences at repo root ([c14f854](https://github.com/nyabb/beacon/commit/c14f854a60033d0e2248b5f06f2cdfb769382585)), closes [#8](https://github.com/nyabb/beacon/issues/8) [#9](https://github.com/nyabb/beacon/issues/9) [8/#9](https://github.com/nyabb/beacon/issues/9)
* Dockerfile ARG placement for HA build system ([9fc04ca](https://github.com/nyabb/beacon/commit/9fc04ca75342dd3684f5c7638c39ace1472e71c8))
* event card/block text always dark on pastel backgrounds ([0d8f5ea](https://github.com/nyabb/beacon/commit/0d8f5ea02d040e38aa8fffcbd4a4f0c6da4b58cf))
* FAB chore button opens chores panel, screensaver respects settings ([e03492d](https://github.com/nyabb/beacon/commit/e03492d6f70d25993c372afea5007880903a3ebb))
* FAB chore button opens panel + screensaver reads settings ([a847278](https://github.com/nyabb/beacon/commit/a8472780dc387553ce6ebc4fcbef8ba81d96622b))
* FAB uses theme accent color, scales up on large displays ([73b2350](https://github.com/nyabb/beacon/commit/73b2350a3bfd9bfdf1f4cd433e7655c34547f26a))
* family name updates reactively from settings in dashboard greeting ([6345141](https://github.com/nyabb/beacon/commit/63451419932d93f145ed3b20e765f95dabe2b1ed))
* grocery list discovery and item loading ([abb01e6](https://github.com/nyabb/beacon/commit/abb01e6788b1cdfd0b15dffdf1289be28c86a3ec))
* grow mobile tab bar height to include safe area inset ([805e5c3](https://github.com/nyabb/beacon/commit/805e5c3c4064fdc9dd25751b0b0cf49776ee45c9))
* HA ingress auth — create long-lived token from supervisor ([e5c2c43](https://github.com/nyabb/beacon/commit/e5c2c434af0c2a90333dea29ff513fbf85a30cc9))
* hide completed tasks from dashboard, only show pending items ([123bb34](https://github.com/nyabb/beacon/commit/123bb342a554bb8a4cab60148e44625edbb663cc))
* hide demo badge in add-on mode, improve mobile tab bar spacing ([751411e](https://github.com/nyabb/beacon/commit/751411e4f57d1087464a69600faac573e5e03e03))
* hide permanently disabled calendars from FamilyFilter pills ([5590af9](https://github.com/nyabb/beacon/commit/5590af9d8680feaa91b7353eba5781133ae05bc6))
* honor default grocery list even without English keywords ([842ba5c](https://github.com/nyabb/beacon/commit/842ba5c0f5e9c0b13ffd7ef9c32d0e68cece6313))
* **i18n:** align card/widget strings with existing terms ([#54](https://github.com/nyabb/beacon/issues/54)) ([3e6bfd8](https://github.com/nyabb/beacon/commit/3e6bfd8c57774fad6d47630cebbff0a4427cec71)), closes [#47](https://github.com/nyabb/beacon/issues/47)
* **i18n:** translate remaining hardcoded screens ([#55](https://github.com/nyabb/beacon/issues/55)) ([42dbac1](https://github.com/nyabb/beacon/commit/42dbac102aeca967e6b584f732e1c1e83c094eab)), closes [#47](https://github.com/nyabb/beacon/issues/47) [48-#51](https://github.com/48-/issues/51) [#54](https://github.com/nyabb/beacon/issues/54) [#54](https://github.com/nyabb/beacon/issues/54)
* improve text contrast — darken --text-muted and --text-secondary ([f36c3f3](https://github.com/nyabb/beacon/commit/f36c3f371e6cedd02980a9b503a51f014d483e3c)), closes [#9ca3af](https://github.com/nyabb/beacon/issues/9ca3af) [#6b7280](https://github.com/nyabb/beacon/issues/6b7280) [#6b7280](https://github.com/nyabb/beacon/issues/6b7280) [#4b5563](https://github.com/nyabb/beacon/issues/4b5563)
* increase mobile tab bar height and bottom padding for safe area ([0f17150](https://github.com/nyabb/beacon/commit/0f17150de5a91330ab0dc27fe7d951830d88b4a1))
* kid display copy-url fallback for non-secure origins ([9f0b4a0](https://github.com/nyabb/beacon/commit/9f0b4a0a7a055ff324b2ce128a7d8cf72c371f83))
* make Kiosk Mode setting actually hide the sidebar ([#20](https://github.com/nyabb/beacon/issues/20)) ([#51](https://github.com/nyabb/beacon/issues/51)) ([2175dca](https://github.com/nyabb/beacon/commit/2175dcab02437d3cfe5915c969f23397ce5d3738))
* media control fallback chain includes toggle for TV integrations ([bfa780f](https://github.com/nyabb/beacon/commit/bfa780fabc333090f666b5fe71bb94b91db0b44d))
* media controls fallback to media_play_pause, mobile layout height ([fe66dc8](https://github.com/nyabb/beacon/commit/fe66dc87e8b998c7d979c2fbd33c640a888143da))
* mobile chore form scroll when keyboard is open ([ec34418](https://github.com/nyabb/beacon/commit/ec344189890dfb1976beef5a5f523137791897f3))
* mobile content invisible — grid-column:2 overrode mobile grid-column:1 ([44edc9a](https://github.com/nyabb/beacon/commit/44edc9a689bd498c32ac1b383e06cbad409e920b))
* mobile dashboard layout — no overlap, constrained events, better sizing ([008103d](https://github.com/nyabb/beacon/commit/008103df3400944c2ec23694bf7f7124fd5a6bdd))
* mobile grocery bleed, bump to v1.1.0 ([2560f22](https://github.com/nyabb/beacon/commit/2560f22233a9d190bfb5e0c51838150ae37c0a6e))
* move ARG BUILD_FROM to top of Dockerfile (before any FROM) ([a150600](https://github.com/nyabb/beacon/commit/a150600100e3be4ecf7bb499d2fdcbf23cf805f0))
* music player works via REST API proxy (no WebSocket required) ([71f8f9c](https://github.com/nyabb/beacon/commit/71f8f9c209ec744c971c80d997c95ac3a05eb14b))
* Now Playing bar fixed to bottom on mobile, flush with tab bar ([8dd4edb](https://github.com/nyabb/beacon/commit/8dd4edb64c6aa9e574394623d31aa508bb4bf446))
* only hide sidebar on truly narrow viewports (<600px), not ingress width ([33cd3e4](https://github.com/nyabb/beacon/commit/33cd3e4deca77100b903a9a54f6ef0024682b39e))
* panel close returns to calendar view, not dashboard ([40b94f1](https://github.com/nyabb/beacon/commit/40b94f1a17782a65f59dca105c1081ebe0a824f0))
* path traversal, shell injection, body limits, async I/O, auth ([6e8c672](https://github.com/nyabb/beacon/commit/6e8c672664e5b5ed376b5e019e03b77104689144))
* refresh shared settings when the app becomes visible ([fab908e](https://github.com/nyabb/beacon/commit/fab908e953399c19283b2e056f3883ff3e03aaee))
* release workflow — upgrade to Node 22, fix sed for Linux, enable git credentials ([e6e1cac](https://github.com/nyabb/beacon/commit/e6e1caca4ef781efe94413879b8e35b5d5f194f3))
* remove CMD — hassio base uses s6-overlay which calls /run.sh ([2ee291e](https://github.com/nyabb/beacon/commit/2ee291e54d17282ae30f977acfa8431041e49990))
* remove CSS filter that turned beacon icon solid black ([578625f](https://github.com/nyabb/beacon/commit/578625f5f304d391ff37bc63c0c5128cec26210b))
* remove gap above mobile tab bar, use min-height for safe area ([c972bad](https://github.com/nyabb/beacon/commit/c972bad8c2b6297526be52b495ff0193b864d4d9))
* remove orphaned palette icon from More menu, 2-col theme grid on mobile ([b0f0cb1](https://github.com/nyabb/beacon/commit/b0f0cb1147a7af1fc42a9f5dffd3fc92b110d4be))
* remove orphaned ThemeSelector icon from sidebar — theming is in Settings ([a73ad80](https://github.com/nyabb/beacon/commit/a73ad806fb522740583d51b3a085fd2e4ba4f6ca))
* remove unused previousView variable ([0f54891](https://github.com/nyabb/beacon/commit/0f54891b14b93db2381f2e76e54b9df83154ae5a))
* request auth token from HA frontend via postMessage ([37d215f](https://github.com/nyabb/beacon/commit/37d215fd94e6e1c33d289f556dd578d0ed8dc0c8))
* resolve calendar default/colors and add multi-calendar family linking ([9836159](https://github.com/nyabb/beacon/commit/98361594663869fdf9682b583137d1efd0ab91a5)), closes [#1](https://github.com/nyabb/beacon/issues/1)
* resolve calendar event CRUD bugs (edit duplicates, end-time drift, dead deletes, dashboard edit) ([542812a](https://github.com/nyabb/beacon/commit/542812a4c549f3769812cb3bcc5164e3d561154a)), closes [#1](https://github.com/nyabb/beacon/issues/1)
* resolve HA media photos through ha-rest and resolve_media ([#41](https://github.com/nyabb/beacon/issues/41)) ([#49](https://github.com/nyabb/beacon/issues/49)) ([2ed658c](https://github.com/nyabb/beacon/commit/2ed658c367b86bce6e335b9789cccbe45bb0aea2))
* resolve HA URL from browser origin in ingress mode ([ab91372](https://github.com/nyabb/beacon/commit/ab91372c8e6e6872fe8d0a7f17d3181fecd8bcef))
* resolve HA WebSocket URL from parent frame, force HTTPS for ingress ([d162a4b](https://github.com/nyabb/beacon/commit/d162a4b17496a5fcb6d7a42b4e06d05e3c175162))
* respect the notification lead-time setting ([#14](https://github.com/nyabb/beacon/issues/14)) ([#50](https://github.com/nyabb/beacon/issues/50)) ([bbeece3](https://github.com/nyabb/beacon/commit/bbeece3a9c51caf075e7d7f34f4cc6f95a914fc4))
* respect Week Starts On setting in week calendar ([0815b24](https://github.com/nyabb/beacon/commit/0815b24e721d7a24529c6a987290f84b7b9c74b8))
* restore calendar event update/delete after HA moved them to WS-only commands ([69bbedb](https://github.com/nyabb/beacon/commit/69bbedba31bb28d2ecd56f039751ab0e4413ed3d))
* route API calls through ingress path in add-on proxy mode ([2ef91e1](https://github.com/nyabb/beacon/commit/2ef91e16ca74211a5bbc79caecdbf12be5c5254a))
* runtime-config.js path relative for ingress ([84b5f04](https://github.com/nyabb/beacon/commit/84b5f04256bfe5b12fb874f6f12cf921aff7dbf6))
* same-day chore dedup and kid display loading escape hatch ([abe6af6](https://github.com/nyabb/beacon/commit/abe6af672563016838d997881fa046df859c12fc))
* scrollable calendar pills, button overflow, consistent pill sizing ([3e5df97](https://github.com/nyabb/beacon/commit/3e5df9714db25b86d6f49ff3b5e92948e31cedd3))
* service calls via dedicated endpoint, show app name in music view ([27410ce](https://github.com/nyabb/beacon/commit/27410cea87029a5f32126d77b95f304423076606))
* set GitHub Pages base path for docs site ([2710789](https://github.com/nyabb/beacon/commit/2710789c4a889e88cef13fa48582644f3b4ab5a9))
* show calendar filter pill names on mobile instead of dot-only ([f2f19fe](https://github.com/nyabb/beacon/commit/f2f19feb96e1718ac6fe54ddad319b97c2d63d46))
* sidebar icons use theme-aware colors in dark mode ([8a59299](https://github.com/nyabb/beacon/commit/8a59299d2d13d86a115682b2b318730c56f42ed3))
* simplify repository.yaml for HA add-on discovery, add docs URL to repo ([958d94a](https://github.com/nyabb/beacon/commit/958d94ad5fb639b3dcae08860f01cba0fdb79607))
* skip onboarding in HA ingress mode ([b7293e7](https://github.com/nyabb/beacon/commit/b7293e71fb9c8c54c2aa551ce9ab98421297c30a))
* sync all changes to beacon/ add-on subdirectory ([33a9856](https://github.com/nyabb/beacon/commit/33a9856f8853b8c0d2f584916bd97bc7a79db3a1))
* sync beacon/ add-on tree with root and fail CI on drift ([#52](https://github.com/nyabb/beacon/issues/52)) ([9391c1f](https://github.com/nyabb/beacon/commit/9391c1f4ca2cd82b50ff54ddc88b541b59c20c7e)), closes [#47](https://github.com/nyabb/beacon/issues/47) [48-#51](https://github.com/48-/issues/51)
* synchronous server restore prevents settings/family data loss ([ec5d547](https://github.com/nyabb/beacon/commit/ec5d547d3064f02fb751545cefcd4ebfc44d86d0))
* theme selection in Settings now applies CSS variables immediately ([e132e49](https://github.com/nyabb/beacon/commit/e132e49c084e490942ac2260bf9631446e40fbfb))
* timer panel slides from right (matches sidebar position) ([8046e34](https://github.com/nyabb/beacon/commit/8046e342bb905a178b978e85d59e73396e9789c1))
* **tokens:** wire the 10-role color tokens into real consumers ([fb9604c](https://github.com/nyabb/beacon/commit/fb9604c69c6402f232de3189ab10edb6d1fe5cac)), closes [#ef4444](https://github.com/nyabb/beacon/issues/ef4444) [#ef4444](https://github.com/nyabb/beacon/issues/ef4444) [#f59e0b](https://github.com/nyabb/beacon/issues/f59e0b)
* use GitHub repo for astro-tinker dep (not local file path) ([cdf544d](https://github.com/nyabb/beacon/commit/cdf544daefcd86de240c366c733a7d0c0d5d3979))
* use marketplace install for Beacon Claude plugin ([9b9f8b6](https://github.com/nyabb/beacon/commit/9b9f8b6aa5fa5e35efb96584a559f1146477ddf6))
* use node:20-alpine runtime instead of hassio base (s6 conflict) ([ea6adc4](https://github.com/nyabb/beacon/commit/ea6adc4dd085116a360256e91a519ec2c3d40243))
* use nullish coalescing for ha_url — empty string was falling through to supervisor URL ([53769dd](https://github.com/nyabb/beacon/commit/53769ddccd9572dd578ce9a4af10c3da36bbbf7e))
* use relative base path for HA ingress compatibility ([7882bb7](https://github.com/nyabb/beacon/commit/7882bb764eb571c9d48a848c321f48f176437600))
* use relative path for runtime-config.js (fixes ingress 404) ([ddf29f2](https://github.com/nyabb/beacon/commit/ddf29f28ad79541304b43773999b348b767d2ca7))
* use REST API for calendars (WS doesn't support calendar commands) ([dc30c82](https://github.com/nyabb/beacon/commit/dc30c826d239738445246e66253d7d7c37e09e94))
* use simpler emoji for All tab (ZWJ sequences break on some renderers) ([2ef46bc](https://github.com/nyabb/beacon/commit/2ef46bca2ff38b725795f9d849e418ccc9282915))
* weather view and forecast auto-discover entity on 404 ([4b6f937](https://github.com/nyabb/beacon/commit/4b6f937bdcdf76b61906295e5e9f7076c0d2c8e8))
* weather works via REST proxy, auto-discovers weather entity ([496d0f8](https://github.com/nyabb/beacon/commit/496d0f89d8b0c75e8625b30d5476f59684dba699))
* wire up GroceryDrawer to sidebar nav, differentiate from chores ([acbbf3d](https://github.com/nyabb/beacon/commit/acbbf3dc4a7a5a9809ddaa86376c8287dbd13202))


### Features

* add browser configuration persistence toggle ([691d337](https://github.com/nyabb/beacon/commit/691d3377f0d1f9200ab3600a29b48a35381b19fa))
* add Claude Code plugin with skills and commands ([24cce9b](https://github.com/nyabb/beacon/commit/24cce9b860f47551c25504fc6011549ef3760fdf))
* add focus mode resolution module ([c6bb811](https://github.com/nyabb/beacon/commit/c6bb8118019bc49f6f37b0e472f1b8b36aaaed0a))
* add FocusView kid display components ([64ecf96](https://github.com/nyabb/beacon/commit/64ecf966a0815bcd677c2967e71ef508f0b2b011))
* add i18n so the Language setting translates the UI ([d334f78](https://github.com/nyabb/beacon/commit/d334f78f3f91b75db969a87bb7ca31be44d68c5d))
* add kid display picker to display settings ([de4cfa9](https://github.com/nyabb/beacon/commit/de4cfa9b16185f345a468bd7189c829bd8089556))
* add max_completions support to MCP server ([a019187](https://github.com/nyabb/beacon/commit/a019187c8ec9f65d831266cf973e531a03ba0ea5))
* add meal plan sync script for AnyList data ([7a2f18b](https://github.com/nyabb/beacon/commit/7a2f18ba0c9b9a908e7a2fcdf964a1f831df3b23))
* add routine editor to family settings ([d22db4b](https://github.com/nyabb/beacon/commit/d22db4bf4dfc1273871347488913cb3daac13813))
* add routine task completion records to family store ([e23f636](https://github.com/nyabb/beacon/commit/e23f636f304cb27245a54052d16740d2bf7ee7f4))
* add Streamable HTTP transport to MCP server ([373e37d](https://github.com/nyabb/beacon/commit/373e37dc61a32843481f3ad152e26ec1e830d59d))
* add useRoutines hook ([d8cc28d](https://github.com/nyabb/beacon/commit/d8cc28d23a01724fe81ca91a1c1e7d14fe6c2ff1))
* add video featurette recording script with demo data anonymization ([02572b2](https://github.com/nyabb/beacon/commit/02572b2fd38a1375c8f1b4a1687426ab80059921))
* add-on API proxy — zero-config HA connection ([e16dbf5](https://github.com/nyabb/beacon/commit/e16dbf5c3e42d6d65db2e7cb0e04e4131aebec8e))
* allow unassigned chores kids can claim ([9b301b9](https://github.com/nyabb/beacon/commit/9b301b9dcdd3d1c6278f92a387db940de5fa6a3f))
* auto-detect HA ingress mode, adapt sidebar for available space ([5ea4b82](https://github.com/nyabb/beacon/commit/5ea4b82b420b79e1e49d2166b0b74d9b2f948ee9))
* Beacon docs site with astro-tinker theme ([af5ad81](https://github.com/nyabb/beacon/commit/af5ad810cac0565c44456d17dbc1f990dc3ca1a8))
* Beacon v0.2.0 — Skylight-style calendar + full feature suite ([7a5bf66](https://github.com/nyabb/beacon/commit/7a5bf660b1c02d7fbef9e2f112e429b1626aa557))
* Beacon v1.0.0 — feature complete ([ad8befb](https://github.com/nyabb/beacon/commit/ad8befbca84390ed11fdbad4f45c79b53b3b21ae))
* **brand:** Beacon Light icon set from single SVG source ([#56](https://github.com/nyabb/beacon/issues/56)) ([2506ee1](https://github.com/nyabb/beacon/commit/2506ee107706cf5dca626ba06108a26c98783a62)), closes [#f7a832](https://github.com/nyabb/beacon/issues/f7a832) [#101d3c](https://github.com/nyabb/beacon/issues/101d3c) [#101d3c](https://github.com/nyabb/beacon/issues/101d3c) [#101d3c](https://github.com/nyabb/beacon/issues/101d3c)
* calendar-entity assignment for family members ([4b66c2e](https://github.com/nyabb/beacon/commit/4b66c2e8bfe52b71034e7ccf95192314225e8b29))
* chore payout ledger with auto-generated parent chores ([ad8b38d](https://github.com/nyabb/beacon/commit/ad8b38d2705cd096de8ce191dac728163e7ac38d))
* configurable dashboard layout presets ([92e1dc7](https://github.com/nyabb/beacon/commit/92e1dc737aff9baa4820d6faead148e83e518470))
* configurable grocery list IDs and sidebar shopping card ([#39](https://github.com/nyabb/beacon/issues/39)) ([872878c](https://github.com/nyabb/beacon/commit/872878c61c4cc36594db080d6cab18a3472ba8c3)), closes [#32](https://github.com/nyabb/beacon/issues/32) [#26](https://github.com/nyabb/beacon/issues/26)
* dashboard shows todo items from HA lists, music works via REST ([513f748](https://github.com/nyabb/beacon/commit/513f748faed1f40a9eadbff7edfa7f591aacfcd1))
* dashboard view, music, photos, OSS docs — Beacon v0.3.0 ([e93dcc5](https://github.com/nyabb/beacon/commit/e93dcc5481b5073d659b175168f098101e17be85))
* dedicated full-page ChoresView replacing slide-out panel ([a05b444](https://github.com/nyabb/beacon/commit/a05b444bd86fd592dc78f49c526c1aa288b27c7c))
* dedicated full-screen Chores view with per-member columns ([29de05a](https://github.com/nyabb/beacon/commit/29de05a382a7aa43b1bf30a0afa44dd7ca3240f3))
* default view setting, Midnight Light theme, updated README ([29662a3](https://github.com/nyabb/beacon/commit/29662a33a521c5d3c70683ad7ffe46f9a477dda0))
* **docker:** support standalone deployment mode ([85031c2](https://github.com/nyabb/beacon/commit/85031c2614f23a39477154b7820a86ca24eb0195))
* expand avatar emojis (150+) and color palette (20 colors) ([64c6c8f](https://github.com/nyabb/beacon/commit/64c6c8f9d461961ad3b4ef70012f3402b2cc0fc2))
* full audit + polish — sidebar position, dashboard fix, theme colors ([97c004c](https://github.com/nyabb/beacon/commit/97c004c5e059b0d8bb6c016b906162cafe4e22af))
* hourly forecast detail when tapping a day in weather view ([862eca2](https://github.com/nyabb/beacon/commit/862eca2786b753f13f8655aecde4d3eef2c7792a))
* **icon:** ship simplified lighthouse icon system ([9cc1806](https://github.com/nyabb/beacon/commit/9cc1806fd0371322094377ab3081a44731478436))
* implement classic dashboard layout preset ([b1b1758](https://github.com/nyabb/beacon/commit/b1b17586a042ea76ce5199578fe857bb98841760))
* initial Beacon app — family command center for wall displays ([8885516](https://github.com/nyabb/beacon/commit/8885516fec9754126f58b1d5033f930c8c471ac7))
* left sidebar nav, expanded avatars, new brand assets ([1384a54](https://github.com/nyabb/beacon/commit/1384a54ec21156b57b5cba9504ad8ece9dabee5e))
* max completions per chore frequency period ([b94a69f](https://github.com/nyabb/beacon/commit/b94a69f21167c2a6cdf68bd94cffb0842a79656c))
* MCP chore CRUD and family member tools ([b6d1706](https://github.com/nyabb/beacon/commit/b6d1706b952384aa87ddf6a4bd2232c29e700ef0))
* meal plan integration with dashboard display and MCP tools ([2c591bb](https://github.com/nyabb/beacon/commit/2c591bb56f8bc1a4f7618be7015d4aee1803ce7b))
* move Beacon sidebar to right side — avoids HA sidebar overlap ([9e6ce5e](https://github.com/nyabb/beacon/commit/9e6ce5e1d0ff0f18675718e13944ea96f0fb017f))
* multi-tap counter for repeatable chores ([48b15e0](https://github.com/nyabb/beacon/commit/48b15e0366364d88fcd8f215b56d880f04e94e9b))
* multiple simultaneous named timers ([6c5e356](https://github.com/nyabb/beacon/commit/6c5e356e09c4b44a99520641d7a182aa7d8f3cd8))
* on-screen kiosk keyboard + Music Assistant search/browse/queue ([f1f2e60](https://github.com/nyabb/beacon/commit/f1f2e60cdda1ff32e7d0f7daab2a59c0802c98bb))
* per-family-member dashboard with calendar columns ([e836365](https://github.com/nyabb/beacon/commit/e836365f0f27208b86d5da136f138f6c671226bc))
* photo screensaver with Google Photos (HA) + Immich support ([8049c79](https://github.com/nyabb/beacon/commit/8049c79bea73e2a6af9ab82e70205f5135a35171))
* rebuild docs with astro-terminal-docs theme + Beacon gold ([0c44556](https://github.com/nyabb/beacon/commit/0c44556663716c8d0081027b099d7d5211d690a6)), closes [#f59e0b](https://github.com/nyabb/beacon/issues/f59e0b)
* rename Midnight → Beacon Dark, Midnight Light → Beacon Light ([6e62124](https://github.com/nyabb/beacon/commit/6e6212432f99fc94a5d2a264343e4738750b2c45)), closes [#0f172a](https://github.com/nyabb/beacon/issues/0f172a) [#f59e0b](https://github.com/nyabb/beacon/issues/f59e0b) [#f8fafc](https://github.com/nyabb/beacon/issues/f8fafc)
* restructure as HA add-on repository ([76e766e](https://github.com/nyabb/beacon/commit/76e766ed12ee19550d275bc76a5d6f243dec12fe))
* separate Lists and Tasks views with auto-categorization ([136ddc6](https://github.com/nyabb/beacon/commit/136ddc60120776d102b314b92dd972e8839a2728))
* server-first data sync — all devices share same data ([831b344](https://github.com/nyabb/beacon/commit/831b344bedbb592d42a1d78a9597e0544b922b5d))
* server-side data persistence for family, settings, chores ([8bf3391](https://github.com/nyabb/beacon/commit/8bf3391b2e2950cb24f99ded23311bed7069f37a))
* settings UI, mobile responsive, icon fix ([03d4807](https://github.com/nyabb/beacon/commit/03d48076aec5146265f3827fb436ecd4c8fbf99c))
* standalone mode with local calendar/tasks, fix theme flash and calendar loading ([36609d2](https://github.com/nyabb/beacon/commit/36609d297e0ec9e3ca43eb48fb82c600b8b8d165))
* timer beep loops until dismissed, multiple sound options ([8fbb492](https://github.com/nyabb/beacon/commit/8fbb492146671f1f5b4af1360da0bf629410c7b7))
* timer is now a full view, not a slide-out panel ([be50e1b](https://github.com/nyabb/beacon/commit/be50e1b3cd888a427a7500ccfbcef679ecb6d54e))
* translate card registry, weather, timer, countdown, and photo frame ([#47](https://github.com/nyabb/beacon/issues/47)) ([#48](https://github.com/nyabb/beacon/issues/48)) ([16d1548](https://github.com/nyabb/beacon/commit/16d15480eb1f3f956b3e07831cd94af68c92f831))
* two-column calendar layout + meal plan view ([5eacf61](https://github.com/nyabb/beacon/commit/5eacf61cde61df28d3fec11b6b5cbcdcbfc21a9d))
* two-column calendar view with sidebar for tasks and events ([fad959f](https://github.com/nyabb/beacon/commit/fad959f3e257910a63320d16776d5299e3402378))
* voice control, MCP server, HA custom sentences + code cleanup ([03b7133](https://github.com/nyabb/beacon/commit/03b7133d390cf8f8dee496a34cada8056f0e243d))
* weather forecast view and calendar day weather headers ([4eebe69](https://github.com/nyabb/beacon/commit/4eebe6965f5309d96b542ea18f97e20e44690330))
* week navigation, inline event details, and stacked dashboard ([919f5f5](https://github.com/nyabb/beacon/commit/919f5f5cb61188c8fe4503d756dbb09ecdb07145))
* wire kid display focus shell into App ([7e56e95](https://github.com/nyabb/beacon/commit/7e56e95f63224095e5a4243d0e468fb1093a9603))

# [1.40.0](https://github.com/asachs01/beacon/compare/v1.39.6...v1.40.0) (2026-10-17)


### Features

* **brand:** Beacon Light icon set from single SVG source ([#56](https://github.com/asachs01/beacon/issues/56)) ([2506ee1](https://github.com/asachs01/beacon/commit/2506ee107706cf5dca626ba06108a26c98783a62)), closes [#f7a832](https://github.com/asachs01/beacon/issues/f7a832) [#101d3c](https://github.com/asachs01/beacon/issues/101d3c) [#101d3c](https://github.com/asachs01/beacon/issues/101d3c) [#101d3c](https://github.com/asachs01/beacon/issues/101d3c)

## [1.39.6](https://github.com/asachs01/beacon/compare/v1.39.5...v1.39.6) (2026-10-17)


### Bug Fixes

* **i18n:** translate remaining hardcoded screens ([#55](https://github.com/asachs01/beacon/issues/55)) ([42dbac1](https://github.com/asachs01/beacon/commit/42dbac102aeca967e6b584f732e1c1e83c094eab)), closes [#47](https://github.com/asachs01/beacon/issues/47) [48-#51](https://github.com/48-/issues/51) [#54](https://github.com/asachs01/beacon/issues/54) [#54](https://github.com/asachs01/beacon/issues/54)

## [1.39.5](https://github.com/asachs01/beacon/compare/v1.39.4...v1.39.5) (2026-10-17)


### Bug Fixes

* **i18n:** align card/widget strings with existing terms ([#54](https://github.com/asachs01/beacon/issues/54)) ([3e6bfd8](https://github.com/asachs01/beacon/commit/3e6bfd8c57774fad6d47630cebbff0a4427cec71)), closes [#47](https://github.com/asachs01/beacon/issues/47)

## [1.39.4](https://github.com/asachs01/beacon/compare/v1.39.3...v1.39.4) (2026-10-12)


### Bug Fixes

* sync beacon/ add-on tree with root and fail CI on drift ([#52](https://github.com/asachs01/beacon/issues/52)) ([9391c1f](https://github.com/asachs01/beacon/commit/9391c1f4ca2cd82b50ff54ddc88b541b59c20c7e)), closes [#47](https://github.com/asachs01/beacon/issues/47) [48-#51](https://github.com/48-/issues/51)

## [1.39.3](https://github.com/asachs01/beacon/compare/v1.39.2...v1.39.3) (2026-10-11)


### Bug Fixes

* make Kiosk Mode setting actually hide the sidebar ([#20](https://github.com/asachs01/beacon/issues/20)) ([#51](https://github.com/asachs01/beacon/issues/51)) ([2175dca](https://github.com/asachs01/beacon/commit/2175dcab02437d3cfe5915c969f23397ce5d3738))

## [1.39.2](https://github.com/asachs01/beacon/compare/v1.39.1...v1.39.2) (2026-10-11)


### Bug Fixes

* respect the notification lead-time setting ([#14](https://github.com/asachs01/beacon/issues/14)) ([#50](https://github.com/asachs01/beacon/issues/50)) ([bbeece3](https://github.com/asachs01/beacon/commit/bbeece3a9c51caf075e7d7f34f4cc6f95a914fc4))

## [1.39.1](https://github.com/asachs01/beacon/compare/v1.39.0...v1.39.1) (2026-10-11)


### Bug Fixes

* resolve HA media photos through ha-rest and resolve_media ([#41](https://github.com/asachs01/beacon/issues/41)) ([#49](https://github.com/asachs01/beacon/issues/49)) ([2ed658c](https://github.com/asachs01/beacon/commit/2ed658c367b86bce6e335b9789cccbe45bb0aea2))

# [1.39.0](https://github.com/asachs01/beacon/compare/v1.38.0...v1.39.0) (2026-10-11)


### Features

* translate card registry, weather, timer, countdown, and photo frame ([#47](https://github.com/asachs01/beacon/issues/47)) ([#48](https://github.com/asachs01/beacon/issues/48)) ([16d1548](https://github.com/asachs01/beacon/commit/16d15480eb1f3f956b3e07831cd94af68c92f831))

# [1.38.0](https://github.com/asachs01/beacon/compare/v1.37.0...v1.38.0) (2026-10-03)


### Features

* add browser configuration persistence toggle ([691d337](https://github.com/asachs01/beacon/commit/691d3377f0d1f9200ab3600a29b48a35381b19fa))

# [1.37.0](https://github.com/asachs01/beacon/compare/v1.36.0...v1.37.0) (2026-10-02)


### Bug Fixes

* respect Week Starts On setting in week calendar ([0815b24](https://github.com/asachs01/beacon/commit/0815b24e721d7a24529c6a987290f84b7b9c74b8))


### Features

* add i18n so the Language setting translates the UI ([d334f78](https://github.com/asachs01/beacon/commit/d334f78f3f91b75db969a87bb7ca31be44d68c5d))

# [1.36.0](https://github.com/asachs01/beacon/compare/v1.35.0...v1.36.0) (2026-09-19)


### Features

* allow unassigned chores kids can claim ([9b301b9](https://github.com/asachs01/beacon/commit/9b301b9dcdd3d1c6278f92a387db940de5fa6a3f))

# [1.35.0](https://github.com/asachs01/beacon/compare/v1.34.2...v1.35.0) (2026-09-19)


### Features

* configurable grocery list IDs and sidebar shopping card ([#39](https://github.com/asachs01/beacon/issues/39)) ([872878c](https://github.com/asachs01/beacon/commit/872878c61c4cc36594db080d6cab18a3472ba8c3)), closes [#32](https://github.com/asachs01/beacon/issues/32) [#26](https://github.com/asachs01/beacon/issues/26)

## [1.34.2](https://github.com/asachs01/beacon/compare/v1.34.1...v1.34.2) (2026-09-19)


### Bug Fixes

* refresh shared settings when the app becomes visible ([fab908e](https://github.com/asachs01/beacon/commit/fab908e953399c19283b2e056f3883ff3e03aaee))

## [1.34.1](https://github.com/asachs01/beacon/compare/v1.34.0...v1.34.1) (2026-09-19)


### Bug Fixes

* create recurring calendar events via HA WebSocket API ([ae02469](https://github.com/asachs01/beacon/commit/ae024697d75e41a473f368e6299351baea7e908d))
* hide permanently disabled calendars from FamilyFilter pills ([5590af9](https://github.com/asachs01/beacon/commit/5590af9d8680feaa91b7353eba5781133ae05bc6))
* honor default grocery list even without English keywords ([842ba5c](https://github.com/asachs01/beacon/commit/842ba5c0f5e9c0b13ffd7ef9c32d0e68cece6313))

# [1.34.0](https://github.com/asachs01/beacon/compare/v1.33.1...v1.34.0) (2026-09-10)


### Features

* add TaskMate multi-user task support with correct per-user completion state ([b743328](https://github.com/asachs01/beacon/commit/b743328d83011d22417cdba80e2bc7debef688e0)) — thanks [@peaches](https://github.com/peaches)
* share one Home Assistant poller across dashboard cards and roll back failed toggles ([d87d35d](https://github.com/asachs01/beacon/commit/d87d35d511e4105373677fe58e8091cd5c700535)) — thanks [@MrMEEE](https://github.com/MrMEEE)


### Bug Fixes

* fix hidden calendars in dashboard and sidebar ([c473544](https://github.com/asachs01/beacon/commit/c47354427a32a912b16b2eb8c2d5a470717a8066)) — thanks [@barmorebd](https://github.com/barmorebd)
* default HA_API_BASE to supervisor when not explicitly set ([b2549b8](https://github.com/asachs01/beacon/commit/b2549b8fb18608e5898ecf62dbf7fdc6e4e05449)) — thanks [@peaches](https://github.com/peaches)
* improve calendar color selection ([2d79307](https://github.com/asachs01/beacon/commit/2d793071eb27c5a153c08ca7a7ba8b50c05bb63f)) — thanks [@peaches](https://github.com/peaches)


### Documentation

* correct dev server port in README (5173, not 3000) ([da44004](https://github.com/asachs01/beacon/commit/da44004de0184fe53087f7f9803ef70cd97e83cc)) — thanks [@webbrain-one](https://github.com/webbrain-one)


### Contributors

Thanks to our external contributors for this release: [@peaches](https://github.com/peaches) (Anh-Kiet Ngo), [@MrMEEE](https://github.com/MrMEEE) (Martin Juhl), [@barmorebd](https://github.com/barmorebd), [@webbrain-one](https://github.com/webbrain-one) (WebBrain).

## [1.33.1](https://github.com/asachs01/beacon/compare/v1.33.0...v1.33.1) (2026-08-12)


### Bug Fixes

* chore assignee badges overlapping text on Calendar screen ([9c777f2](https://github.com/asachs01/beacon/commit/9c777f2308df9caae46ff6591e7dd23ef42f700e))

# [1.33.0](https://github.com/asachs01/beacon/compare/v1.32.8...v1.33.0) (2026-08-11)


### Features

* dedicated full-screen Chores view with per-member columns ([29de05a](https://github.com/asachs01/beacon/commit/29de05a382a7aa43b1bf30a0afa44dd7ca3240f3))

## [1.32.8](https://github.com/asachs01/beacon/compare/v1.32.7...v1.32.8) (2026-08-11)


### Bug Fixes

* all-day event dtend, calendar visibility persistence, chores toggle, assignee display ([2fe7cc3](https://github.com/asachs01/beacon/commit/2fe7cc3cce58cc72c748dcc38d0b4707e9fd7dd1))

## [1.32.7](https://github.com/asachs01/beacon/compare/v1.32.6...v1.32.7) (2026-08-10)


### Bug Fixes

* restore calendar event update/delete after HA moved them to WS-only commands ([69bbedb](https://github.com/asachs01/beacon/commit/69bbedba31bb28d2ecd56f039751ab0e4413ed3d))

## [1.32.6](https://github.com/asachs01/beacon/compare/v1.32.5...v1.32.6) (2026-08-09)


### Bug Fixes

* add chore edit/delete UI, assignee visibility, and dynamic version ([103ad44](https://github.com/asachs01/beacon/commit/103ad4438749aedec825226b3fba55b1f403717b)), closes [#1](https://github.com/asachs01/beacon/issues/1)
* resolve calendar default/colors and add multi-calendar family linking ([9836159](https://github.com/asachs01/beacon/commit/98361594663869fdf9682b583137d1efd0ab91a5)), closes [#1](https://github.com/asachs01/beacon/issues/1)
* resolve calendar event CRUD bugs (edit duplicates, end-time drift, dead deletes, dashboard edit) ([542812a](https://github.com/asachs01/beacon/commit/542812a4c549f3769812cb3bcc5164e3d561154a)), closes [#1](https://github.com/asachs01/beacon/issues/1)

## [1.32.5](https://github.com/asachs01/beacon/compare/v1.32.4...v1.32.5) (2026-08-03)


### Bug Fixes

* **build:** exclude test files from production tsc build ([#12](https://github.com/asachs01/beacon/issues/12)) ([1bbb873](https://github.com/asachs01/beacon/commit/1bbb8736e87d4f8607e21ea6c14d041a5f5174cd))

## [1.32.4](https://github.com/asachs01/beacon/compare/v1.32.3...v1.32.4) (2026-08-02)


### Bug Fixes

* **ci:** checkout the post-release commit in build-addon.yml, not the stale pre-bump sha ([17d2bf9](https://github.com/asachs01/beacon/commit/17d2bf9b6d235f89541fac78fbe167dcd9cccf6d))

## [1.32.3](https://github.com/asachs01/beacon/compare/v1.32.2...v1.32.3) (2026-08-02)


### Bug Fixes

* **docker:** add missing custom_intents/custom_sentences at repo root ([c14f854](https://github.com/asachs01/beacon/commit/c14f854a60033d0e2248b5f06f2cdfb769382585)), closes [#8](https://github.com/asachs01/beacon/issues/8) [#9](https://github.com/asachs01/beacon/issues/9) [8/#9](https://github.com/asachs01/beacon/issues/9)

## [1.32.2](https://github.com/asachs01/beacon/compare/v1.32.1...v1.32.2) (2026-08-02)


### Bug Fixes

* **ci:** correct workflow_call detection in build-addon.yml ([949b8bb](https://github.com/asachs01/beacon/commit/949b8bb8303c3ebd3a77a1ac27edcf80e5342a7d)), closes [#1](https://github.com/asachs01/beacon/issues/1)

## [1.32.1](https://github.com/asachs01/beacon/compare/v1.32.0...v1.32.1) (2026-08-02)


### Bug Fixes

* **dashboard:** render Family layout as vertical columns, not stacked rows ([bac3427](https://github.com/asachs01/beacon/commit/bac34279e5ba91b0b1e4194631f9eaed3e4ecdb5))

# [1.32.0](https://github.com/asachs01/beacon/compare/v1.31.0...v1.32.0) (2026-08-02)


### Bug Fixes

* **tokens:** wire the 10-role color tokens into real consumers ([fb9604c](https://github.com/asachs01/beacon/commit/fb9604c69c6402f232de3189ab10edb6d1fe5cac)), closes [#ef4444](https://github.com/asachs01/beacon/issues/ef4444) [#ef4444](https://github.com/asachs01/beacon/issues/ef4444) [#f59e0b](https://github.com/asachs01/beacon/issues/f59e0b)


### Features

* **icon:** ship simplified lighthouse icon system ([9cc1806](https://github.com/asachs01/beacon/commit/9cc1806fd0371322094377ab3081a44731478436))

# [1.31.0](https://github.com/asachs01/beacon/compare/v1.30.2...v1.31.0) (2026-07-05)


### Features

* implement classic dashboard layout preset ([b1b1758](https://github.com/asachs01/beacon/commit/b1b17586a042ea76ce5199578fe857bb98841760))

## [1.30.2](https://github.com/asachs01/beacon/compare/v1.30.1...v1.30.2) (2026-07-05)


### Bug Fixes

* bucket chore and routine completions by local day, not UTC ([3a8ff59](https://github.com/asachs01/beacon/commit/3a8ff593b599bec84be1870243e88e733ddfd00b))

## [1.30.1](https://github.com/asachs01/beacon/compare/v1.30.0...v1.30.1) (2026-07-05)


### Bug Fixes

* same-day chore dedup and kid display loading escape hatch ([abe6af6](https://github.com/asachs01/beacon/commit/abe6af672563016838d997881fa046df859c12fc))

# [1.30.0](https://github.com/asachs01/beacon/compare/v1.29.0...v1.30.0) (2026-07-05)


### Bug Fixes

* disable event notifications and permission prompt on kid displays ([d0206a1](https://github.com/asachs01/beacon/commit/d0206a16913070d2479cba967675893d620ad9ed))
* kid display copy-url fallback for non-secure origins ([9f0b4a0](https://github.com/asachs01/beacon/commit/9f0b4a0a7a055ff324b2ce128a7d8cf72c371f83))


### Features

* add focus mode resolution module ([c6bb811](https://github.com/asachs01/beacon/commit/c6bb8118019bc49f6f37b0e472f1b8b36aaaed0a))
* add FocusView kid display components ([64ecf96](https://github.com/asachs01/beacon/commit/64ecf966a0815bcd677c2967e71ef508f0b2b011))
* add kid display picker to display settings ([de4cfa9](https://github.com/asachs01/beacon/commit/de4cfa9b16185f345a468bd7189c829bd8089556))
* add routine editor to family settings ([d22db4b](https://github.com/asachs01/beacon/commit/d22db4bf4dfc1273871347488913cb3daac13813))
* add routine task completion records to family store ([e23f636](https://github.com/asachs01/beacon/commit/e23f636f304cb27245a54052d16740d2bf7ee7f4))
* add useRoutines hook ([d8cc28d](https://github.com/asachs01/beacon/commit/d8cc28d23a01724fe81ca91a1c1e7d14fe6c2ff1))
* wire kid display focus shell into App ([7e56e95](https://github.com/asachs01/beacon/commit/7e56e95f63224095e5a4243d0e468fb1093a9603))

# [1.29.0](https://github.com/asachs01/beacon/compare/v1.28.2...v1.29.0) (2026-06-18)


### Features

* week navigation, inline event details, and stacked dashboard ([919f5f5](https://github.com/asachs01/beacon/commit/919f5f5cb61188c8fe4503d756dbb09ecdb07145))

## [1.28.2](https://github.com/asachs01/beacon/compare/v1.28.1...v1.28.2) (2026-04-07)


### Bug Fixes

* ChoresView uses available width on large screens ([8956e4a](https://github.com/asachs01/beacon/commit/8956e4ad6c73d1aca831408a59ab819a34e219bf))

## [1.28.1](https://github.com/asachs01/beacon/compare/v1.28.0...v1.28.1) (2026-04-05)


### Bug Fixes

* use simpler emoji for All tab (ZWJ sequences break on some renderers) ([2ef46bc](https://github.com/asachs01/beacon/commit/2ef46bca2ff38b725795f9d849e418ccc9282915))

# [1.28.0](https://github.com/asachs01/beacon/compare/v1.27.0...v1.28.0) (2026-04-05)


### Features

* dedicated full-page ChoresView replacing slide-out panel ([a05b444](https://github.com/asachs01/beacon/commit/a05b444bd86fd592dc78f49c526c1aa288b27c7c))

# [1.27.0](https://github.com/asachs01/beacon/compare/v1.26.0...v1.27.0) (2026-04-05)


### Features

* add Streamable HTTP transport to MCP server ([373e37d](https://github.com/asachs01/beacon/commit/373e37dc61a32843481f3ad152e26ec1e830d59d))

# [1.26.0](https://github.com/asachs01/beacon/compare/v1.25.0...v1.26.0) (2026-04-04)


### Features

* multi-tap counter for repeatable chores ([48b15e0](https://github.com/asachs01/beacon/commit/48b15e0366364d88fcd8f215b56d880f04e94e9b))

# [1.25.0](https://github.com/asachs01/beacon/compare/v1.24.5...v1.25.0) (2026-04-04)


### Features

* chore payout ledger with auto-generated parent chores ([ad8b38d](https://github.com/asachs01/beacon/commit/ad8b38d2705cd096de8ce191dac728163e7ac38d))

## [1.24.5](https://github.com/asachs01/beacon/compare/v1.24.4...v1.24.5) (2026-04-04)


### Bug Fixes

* chore value input lets you type freely ([d0b4d09](https://github.com/asachs01/beacon/commit/d0b4d0927aec377c2d23887953479e872225dff4))

## [1.24.4](https://github.com/asachs01/beacon/compare/v1.24.3...v1.24.4) (2026-04-04)


### Bug Fixes

* remove gap above mobile tab bar, use min-height for safe area ([c972bad](https://github.com/asachs01/beacon/commit/c972bad8c2b6297526be52b495ff0193b864d4d9))

## [1.24.3](https://github.com/asachs01/beacon/compare/v1.24.2...v1.24.3) (2026-04-04)


### Bug Fixes

* grow mobile tab bar height to include safe area inset ([805e5c3](https://github.com/asachs01/beacon/commit/805e5c3c4064fdc9dd25751b0b0cf49776ee45c9))

## [1.24.2](https://github.com/asachs01/beacon/compare/v1.24.1...v1.24.2) (2026-04-04)


### Bug Fixes

* add viewport-fit=cover for iOS safe area insets ([84ff7b3](https://github.com/asachs01/beacon/commit/84ff7b3a5047e907571c1d1ebacee1c4d4960b71))

## [1.24.1](https://github.com/asachs01/beacon/compare/v1.24.0...v1.24.1) (2026-04-04)


### Bug Fixes

* add safe area padding to mobile tab bar for iPhone home indicator ([f3a24a3](https://github.com/asachs01/beacon/commit/f3a24a38cf4c0a82110732de0d60f208eefb0f87))

# [1.24.0](https://github.com/asachs01/beacon/compare/v1.23.0...v1.24.0) (2026-04-04)


### Features

* photo screensaver with Google Photos (HA) + Immich support ([8049c79](https://github.com/asachs01/beacon/commit/8049c79bea73e2a6af9ab82e70205f5135a35171))

# [1.23.0](https://github.com/asachs01/beacon/compare/v1.22.0...v1.23.0) (2026-04-04)


### Features

* add max_completions support to MCP server ([a019187](https://github.com/asachs01/beacon/commit/a019187c8ec9f65d831266cf973e531a03ba0ea5))

# [1.22.0](https://github.com/asachs01/beacon/compare/v1.21.1...v1.22.0) (2026-04-04)


### Features

* max completions per chore frequency period ([b94a69f](https://github.com/asachs01/beacon/commit/b94a69f21167c2a6cdf68bd94cffb0842a79656c))

## [1.21.1](https://github.com/asachs01/beacon/compare/v1.21.0...v1.21.1) (2026-04-04)


### Bug Fixes

* mobile chore form scroll when keyboard is open ([ec34418](https://github.com/asachs01/beacon/commit/ec344189890dfb1976beef5a5f523137791897f3))

# [1.21.0](https://github.com/asachs01/beacon/compare/v1.20.1...v1.21.0) (2026-04-04)


### Features

* on-screen kiosk keyboard + Music Assistant search/browse/queue ([f1f2e60](https://github.com/asachs01/beacon/commit/f1f2e60cdda1ff32e7d0f7daab2a59c0802c98bb))

## [1.20.1](https://github.com/asachs01/beacon/compare/v1.20.0...v1.20.1) (2026-04-03)


### Bug Fixes

* use marketplace install for Beacon Claude plugin ([9b9f8b6](https://github.com/asachs01/beacon/commit/9b9f8b6aa5fa5e35efb96584a559f1146477ddf6))

# [1.20.0](https://github.com/asachs01/beacon/compare/v1.19.0...v1.20.0) (2026-04-03)


### Features

* add Claude Code plugin with skills and commands ([24cce9b](https://github.com/asachs01/beacon/commit/24cce9b860f47551c25504fc6011549ef3760fdf))

# [1.19.0](https://github.com/asachs01/beacon/compare/v1.18.0...v1.19.0) (2026-04-02)


### Bug Fixes

* FAB chore button opens chores panel, screensaver respects settings ([e03492d](https://github.com/asachs01/beacon/commit/e03492d6f70d25993c372afea5007880903a3ebb))


### Features

* add meal plan sync script for AnyList data ([7a2f18b](https://github.com/asachs01/beacon/commit/7a2f18ba0c9b9a908e7a2fcdf964a1f831df3b23))
* calendar-entity assignment for family members ([4b66c2e](https://github.com/asachs01/beacon/commit/4b66c2e8bfe52b71034e7ccf95192314225e8b29))
* configurable dashboard layout presets ([92e1dc7](https://github.com/asachs01/beacon/commit/92e1dc737aff9baa4820d6faead148e83e518470))
* MCP chore CRUD and family member tools ([b6d1706](https://github.com/asachs01/beacon/commit/b6d1706b952384aa87ddf6a4bd2232c29e700ef0))
* meal plan integration with dashboard display and MCP tools ([2c591bb](https://github.com/asachs01/beacon/commit/2c591bb56f8bc1a4f7618be7015d4aee1803ce7b))
* per-family-member dashboard with calendar columns ([e836365](https://github.com/asachs01/beacon/commit/e836365f0f27208b86d5da136f138f6c671226bc))
* two-column calendar view with sidebar for tasks and events ([fad959f](https://github.com/asachs01/beacon/commit/fad959f3e257910a63320d16776d5299e3402378))

# [1.18.0](https://github.com/asachs01/beacon/compare/v1.17.3...v1.18.0) (2026-04-02)


### Features

* two-column calendar layout + meal plan view ([5eacf61](https://github.com/asachs01/beacon/commit/5eacf61cde61df28d3fec11b6b5cbcdcbfc21a9d))

## [1.17.3](https://github.com/asachs01/beacon/compare/v1.17.2...v1.17.3) (2026-04-02)


### Bug Fixes

* FAB chore button opens panel + screensaver reads settings ([a847278](https://github.com/asachs01/beacon/commit/a8472780dc387553ce6ebc4fcbef8ba81d96622b))

## [1.17.2](https://github.com/asachs01/beacon/compare/v1.17.1...v1.17.2) (2026-03-31)


### Bug Fixes

* FAB uses theme accent color, scales up on large displays ([73b2350](https://github.com/asachs01/beacon/commit/73b2350a3bfd9bfdf1f4cd433e7655c34547f26a))

## [1.17.1](https://github.com/asachs01/beacon/compare/v1.17.0...v1.17.1) (2026-03-31)


### Bug Fixes

* dashboard equal thirds layout, weather moved to clock column ([870c13d](https://github.com/asachs01/beacon/commit/870c13d0fd4d1b5bed6fca308431017300682203))

# [1.17.0](https://github.com/asachs01/beacon/compare/v1.16.0...v1.17.0) (2026-03-31)


### Features

* add video featurette recording script with demo data anonymization ([02572b2](https://github.com/asachs01/beacon/commit/02572b2fd38a1375c8f1b4a1687426ab80059921))

# [1.16.0](https://github.com/asachs01/beacon/compare/v1.15.0...v1.16.0) (2026-03-30)


### Features

* hourly forecast detail when tapping a day in weather view ([862eca2](https://github.com/asachs01/beacon/commit/862eca2786b753f13f8655aecde4d3eef2c7792a))

# [1.15.0](https://github.com/asachs01/beacon/compare/v1.14.0...v1.15.0) (2026-03-30)


### Features

* rename Midnight → Beacon Dark, Midnight Light → Beacon Light ([6e62124](https://github.com/asachs01/beacon/commit/6e6212432f99fc94a5d2a264343e4738750b2c45)), closes [#0f172a](https://github.com/asachs01/beacon/issues/0f172a) [#f59e0b](https://github.com/asachs01/beacon/issues/f59e0b) [#f8fafc](https://github.com/asachs01/beacon/issues/f8fafc)

# [1.14.0](https://github.com/asachs01/beacon/compare/v1.13.0...v1.14.0) (2026-03-30)


### Features

* server-first data sync — all devices share same data ([831b344](https://github.com/asachs01/beacon/commit/831b344bedbb592d42a1d78a9597e0544b922b5d))

# [1.13.0](https://github.com/asachs01/beacon/compare/v1.12.0...v1.13.0) (2026-03-30)


### Features

* timer beep loops until dismissed, multiple sound options ([8fbb492](https://github.com/asachs01/beacon/commit/8fbb492146671f1f5b4af1360da0bf629410c7b7))

# [1.12.0](https://github.com/asachs01/beacon/compare/v1.11.7...v1.12.0) (2026-03-30)


### Features

* multiple simultaneous named timers ([6c5e356](https://github.com/asachs01/beacon/commit/6c5e356e09c4b44a99520641d7a182aa7d8f3cd8))

## [1.11.7](https://github.com/asachs01/beacon/compare/v1.11.6...v1.11.7) (2026-03-30)


### Bug Fixes

* improve text contrast — darken --text-muted and --text-secondary ([f36c3f3](https://github.com/asachs01/beacon/commit/f36c3f371e6cedd02980a9b503a51f014d483e3c)), closes [#9ca3af](https://github.com/asachs01/beacon/issues/9ca3af) [#6b7280](https://github.com/asachs01/beacon/issues/6b7280) [#6b7280](https://github.com/asachs01/beacon/issues/6b7280) [#4b5563](https://github.com/asachs01/beacon/issues/4b5563)

## [1.11.6](https://github.com/asachs01/beacon/compare/v1.11.5...v1.11.6) (2026-03-30)


### Bug Fixes

* all-day events align with calendar day columns ([07563f4](https://github.com/asachs01/beacon/commit/07563f44fdb13296ff8bf1e2fee2367abb8bc693))

## [1.11.5](https://github.com/asachs01/beacon/compare/v1.11.4...v1.11.5) (2026-03-30)


### Bug Fixes

* synchronous server restore prevents settings/family data loss ([ec5d547](https://github.com/asachs01/beacon/commit/ec5d547d3064f02fb751545cefcd4ebfc44d86d0))

## [1.11.4](https://github.com/asachs01/beacon/compare/v1.11.3...v1.11.4) (2026-03-30)


### Bug Fixes

* define missing CSS vars, music empty state, touch target sizes ([e240dd7](https://github.com/asachs01/beacon/commit/e240dd7665800b4645cec134f73594a8f49c358f))

## [1.11.3](https://github.com/asachs01/beacon/compare/v1.11.2...v1.11.3) (2026-03-30)


### Bug Fixes

* path traversal, shell injection, body limits, async I/O, auth ([6e8c672](https://github.com/asachs01/beacon/commit/6e8c672664e5b5ed376b5e019e03b77104689144))

## [1.11.2](https://github.com/asachs01/beacon/compare/v1.11.1...v1.11.2) (2026-03-29)


### Bug Fixes

* chores/leaderboard panels close on view change, compact mobile weather ([78a4df4](https://github.com/asachs01/beacon/commit/78a4df4fc1388d69e26f7ea8694b8c990280e2ac))

## [1.11.1](https://github.com/asachs01/beacon/compare/v1.11.0...v1.11.1) (2026-03-29)


### Bug Fixes

* weather view and forecast auto-discover entity on 404 ([4b6f937](https://github.com/asachs01/beacon/commit/4b6f937bdcdf76b61906295e5e9f7076c0d2c8e8))

# [1.11.0](https://github.com/asachs01/beacon/compare/v1.10.7...v1.11.0) (2026-03-29)


### Features

* weather forecast view and calendar day weather headers ([4eebe69](https://github.com/asachs01/beacon/commit/4eebe6965f5309d96b542ea18f97e20e44690330))

## [1.10.7](https://github.com/asachs01/beacon/compare/v1.10.6...v1.10.7) (2026-03-29)


### Bug Fixes

* weather works via REST proxy, auto-discovers weather entity ([496d0f8](https://github.com/asachs01/beacon/commit/496d0f89d8b0c75e8625b30d5476f59684dba699))

## [1.10.6](https://github.com/asachs01/beacon/compare/v1.10.5...v1.10.6) (2026-03-29)


### Bug Fixes

* deduplicate media players, prefer device_class entity for controls ([4d0b587](https://github.com/asachs01/beacon/commit/4d0b58780279bde3993403ac594899ff7b7fff30))

## [1.10.5](https://github.com/asachs01/beacon/compare/v1.10.4...v1.10.5) (2026-03-29)


### Bug Fixes

* media control fallback chain includes toggle for TV integrations ([bfa780f](https://github.com/asachs01/beacon/commit/bfa780fabc333090f666b5fe71bb94b91db0b44d))

## [1.10.4](https://github.com/asachs01/beacon/compare/v1.10.3...v1.10.4) (2026-03-29)


### Bug Fixes

* Now Playing bar fixed to bottom on mobile, flush with tab bar ([8dd4edb](https://github.com/asachs01/beacon/commit/8dd4edb64c6aa9e574394623d31aa508bb4bf446))

## [1.10.3](https://github.com/asachs01/beacon/compare/v1.10.2...v1.10.3) (2026-03-29)


### Bug Fixes

* media controls fallback to media_play_pause, mobile layout height ([fe66dc8](https://github.com/asachs01/beacon/commit/fe66dc87e8b998c7d979c2fbd33c640a888143da))

## [1.10.2](https://github.com/asachs01/beacon/compare/v1.10.1...v1.10.2) (2026-03-29)


### Bug Fixes

* mobile dashboard layout — no overlap, constrained events, better sizing ([008103d](https://github.com/asachs01/beacon/commit/008103df3400944c2ec23694bf7f7124fd5a6bdd))

## [1.10.1](https://github.com/asachs01/beacon/compare/v1.10.0...v1.10.1) (2026-03-29)


### Bug Fixes

* hide completed tasks from dashboard, only show pending items ([123bb34](https://github.com/asachs01/beacon/commit/123bb342a554bb8a4cab60148e44625edbb663cc))

# [1.10.0](https://github.com/asachs01/beacon/compare/v1.9.0...v1.10.0) (2026-03-29)


### Features

* voice control, MCP server, HA custom sentences + code cleanup ([03b7133](https://github.com/asachs01/beacon/commit/03b7133d390cf8f8dee496a34cada8056f0e243d))

## [Unreleased]

### Added

* HA custom sentences and intent handlers for voice control of Beacon features
* Voice commands: add to lists, complete chores, check calendar, navigate views, set timers, query grocery/chore status
* Auto-install of voice intents into HA config on add-on startup
* Install script at `scripts/install-voice-intents.sh` for manual deployment

## [1.8.1](https://github.com/asachs01/beacon/compare/v1.8.0...v1.8.1) (2026-03-29)


### Bug Fixes

* service calls via dedicated endpoint, show app name in music view ([27410ce](https://github.com/asachs01/beacon/commit/27410cea87029a5f32126d77b95f304423076606))

# [1.8.0](https://github.com/asachs01/beacon/compare/v1.7.1...v1.8.0) (2026-03-29)


### Features

* dashboard shows todo items from HA lists, music works via REST ([513f748](https://github.com/asachs01/beacon/commit/513f748faed1f40a9eadbff7edfa7f591aacfcd1))

## [1.7.1](https://github.com/asachs01/beacon/compare/v1.7.0...v1.7.1) (2026-03-29)


### Bug Fixes

* music player works via REST API proxy (no WebSocket required) ([71f8f9c](https://github.com/asachs01/beacon/commit/71f8f9c209ec744c971c80d997c95ac3a05eb14b))

# [1.7.0](https://github.com/asachs01/beacon/compare/v1.6.0...v1.7.0) (2026-03-29)


### Features

* expand avatar emojis (150+) and color palette (20 colors) ([64c6c8f](https://github.com/asachs01/beacon/commit/64c6c8f9d461961ad3b4ef70012f3402b2cc0fc2))

# [1.6.0](https://github.com/asachs01/beacon/compare/v1.5.0...v1.6.0) (2026-03-29)


### Features

* server-side data persistence for family, settings, chores ([8bf3391](https://github.com/asachs01/beacon/commit/8bf3391b2e2950cb24f99ded23311bed7069f37a))

# [1.5.0](https://github.com/asachs01/beacon/compare/v1.4.4...v1.5.0) (2026-03-29)


### Features

* separate Lists and Tasks views with auto-categorization ([136ddc6](https://github.com/asachs01/beacon/commit/136ddc60120776d102b314b92dd972e8839a2728))

## [1.4.4](https://github.com/asachs01/beacon/compare/v1.4.3...v1.4.4) (2026-03-29)


### Bug Fixes

* route API calls through ingress path in add-on proxy mode ([2ef91e1](https://github.com/asachs01/beacon/commit/2ef91e16ca74211a5bbc79caecdbf12be5c5254a))

## [1.4.3](https://github.com/asachs01/beacon/compare/v1.4.2...v1.4.3) (2026-03-29)


### Bug Fixes

* use relative path for runtime-config.js (fixes ingress 404) ([ddf29f2](https://github.com/asachs01/beacon/commit/ddf29f28ad79541304b43773999b348b767d2ca7))

## [1.4.2](https://github.com/asachs01/beacon/compare/v1.4.1...v1.4.2) (2026-03-29)


### Bug Fixes

* calendar/lists work via API proxy without WebSocket or user token ([9840db4](https://github.com/asachs01/beacon/commit/9840db4d7415519b01791a7fa5719c682d0d1913))

## [1.4.1](https://github.com/asachs01/beacon/compare/v1.4.0...v1.4.1) (2026-03-29)


### Bug Fixes

* show calendar filter pill names on mobile instead of dot-only ([f2f19fe](https://github.com/asachs01/beacon/commit/f2f19feb96e1718ac6fe54ddad319b97c2d63d46))

# [1.4.0](https://github.com/asachs01/beacon/compare/v1.3.1...v1.4.0) (2026-03-29)


### Features

* add-on API proxy — zero-config HA connection ([e16dbf5](https://github.com/asachs01/beacon/commit/e16dbf5c3e42d6d65db2e7cb0e04e4131aebec8e))

## [1.3.1](https://github.com/asachs01/beacon/compare/v1.3.0...v1.3.1) (2026-03-29)


### Bug Fixes

* calendar layout whitespace and add-on auth/URL resolution ([0daec9f](https://github.com/asachs01/beacon/commit/0daec9f94b89b51b55926f5781e7a426fa3c7430))

# [1.3.0](https://github.com/asachs01/beacon/compare/v1.2.1...v1.3.0) (2026-03-29)


### Bug Fixes

* release workflow — upgrade to Node 22, fix sed for Linux, enable git credentials ([e6e1cac](https://github.com/asachs01/beacon/commit/e6e1caca4ef781efe94413879b8e35b5d5f194f3))


### Features

* standalone mode with local calendar/tasks, fix theme flash and calendar loading ([36609d2](https://github.com/asachs01/beacon/commit/36609d297e0ec9e3ca43eb48fb82c600b8b8d165))

# Changelog

## Unreleased

### New
- Built-in local task lists (To-Do, Shopping List) that work without any HA integration
- Built-in local calendar ("Beacon") for standalone event management
- Both local and HA-powered lists/calendars can be used side by side

### Fixed
- Theme no longer flashes to Skylight default on page load — applied before first paint
- Theme now stays active across all views (was previously only applied when visiting Settings)
- Calendar events load reliably on startup (fixed stale closure in calendar fetch)
- Leaderboard panel no longer peeks out when sidebar is positioned on the left
- Dashboard now correctly shows today's all-day events (timezone normalization fix)
- Grocery/todo lists show local lists immediately even without HA connection

## 1.2.0

### New
- Grocery lists now work with AnyList and HA Shopping List
- Onboarding wizard for standalone app setup
- Native iOS and Android app support via Capacitor
- Keyboard shortcuts: press 1-9 to switch views
- Now Playing bar shows track progress
- Smooth transitions between views

### Improved
- Calendar events that overlap now display side-by-side
- Current time indicator updates in real time
- Screensaver clock moves smoothly instead of jumping
- Better empty states throughout the app
- Mobile tab bar has an active indicator
- Accessibility: respects reduced motion preferences

### Fixed
- Grocery view now properly fetches items from HA
- Connection handling in HA ingress mode
- Event text readable on all themes
- Layout issues on mobile

## 1.0.0

### New
- Weekly calendar with drag-to-reschedule
- Dashboard with clock, weather, and daily overview
- 7 color themes with auto dark mode
- Family member management
- Chore tracking with streaks and leaderboard
- AnyList and Grocy grocery integration
- Music Assistant controls and Now Playing bar
- Photo frame slideshow
- Timer and countdown widgets
- Screen saver with floating clock
