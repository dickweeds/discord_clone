# Changelog

## [0.99.141](https://github.com/AidenWoodside/discord_clone/compare/v0.99.140...v0.99.141) (2026-03-01)


### Bug Fixes

* use short port syntax for UDP range in Swarm stack ([a336097](https://github.com/AidenWoodside/discord_clone/commit/a336097df2003afa59e0a910e9f408ed9b71ba8e))
* use short port syntax for UDP range in Swarm stack ([51e9d74](https://github.com/AidenWoodside/discord_clone/commit/51e9d741402b4113f49bed3de42431ca28eb9ba9))

## [0.99.140](https://github.com/AidenWoodside/discord_clone/compare/v0.99.139...v0.99.140) (2026-03-01)


### Bug Fixes

* Feat/deploy rework docker swarm ([aad649a](https://github.com/AidenWoodside/discord_clone/commit/aad649a316db648e15c3695cec36becb8fec9dca))

## [0.99.139](https://github.com/AidenWoodside/discord_clone/compare/v0.99.138...v0.99.139) (2026-03-01)


### Bug Fixes

* detect crash-looping nginx and make post-switchover check fatal ([60004c3](https://github.com/AidenWoodside/discord_clone/commit/60004c33f1b1bfa32cffcf3a080a5c85521924a4))
* detect crash-looping nginx and make post-switchover check fatal ([6f4a000](https://github.com/AidenWoodside/discord_clone/commit/6f4a000857c9343be81f23f514081dbe621453ca))

## [0.99.138](https://github.com/AidenWoodside/discord_clone/compare/v0.99.137...v0.99.138) (2026-03-01)


### Bug Fixes

* validate nginx config before reload and fix drain monitoring ([83c41a3](https://github.com/AidenWoodside/discord_clone/commit/83c41a3a4378e8cca9a900fb3d743b3d2ab9deec))
* validate nginx config before reload and fix drain monitoring ([1d765b4](https://github.com/AidenWoodside/discord_clone/commit/1d765b40acd949574158a46004b29cd39e233205))

## [0.99.137](https://github.com/AidenWoodside/discord_clone/compare/v0.99.136...v0.99.137) (2026-03-01)


### Bug Fixes

* force-remove crash-looping nginx before recreating ([e48d02f](https://github.com/AidenWoodside/discord_clone/commit/e48d02f55f58c6d35f67f4c81c6e6892a50b9840))
* force-remove crash-looping nginx before starting fresh ([55dfe50](https://github.com/AidenWoodside/discord_clone/commit/55dfe50f5c542290899c4268dac89a1dc1b0da82))

## [0.99.136](https://github.com/AidenWoodside/discord_clone/compare/v0.99.135...v0.99.136) (2026-03-01)


### Bug Fixes

* bootstrap nginx with HTTP-only config when SSL certs are missing ([d1226dd](https://github.com/AidenWoodside/discord_clone/commit/d1226ddf90e173d8804cb21fdcb7f553b067d847))
* bootstrap nginx with HTTP-only when SSL certs missing ([c95f7d5](https://github.com/AidenWoodside/discord_clone/commit/c95f7d5201b52ba8e7057e7db0ee4c8630977159))

## [0.99.135](https://github.com/AidenWoodside/discord_clone/compare/v0.99.134...v0.99.135) (2026-03-01)


### Bug Fixes

* use --no-deps when starting nginx during deploy ([ba710b4](https://github.com/AidenWoodside/discord_clone/commit/ba710b4ecf7283f32b967418f0d026bfe622dd5b))
* use --no-deps when starting nginx during deploy ([e1d0278](https://github.com/AidenWoodside/discord_clone/commit/e1d0278b5a189419d5198485535fc2b0a9d1f48b))

## [0.99.134](https://github.com/AidenWoodside/discord_clone/compare/v0.99.133...v0.99.134) (2026-03-01)


### Bug Fixes

* start nginx on cold start before config validation ([3a0c11c](https://github.com/AidenWoodside/discord_clone/commit/3a0c11c5841cb3a8349068f2f6f3473dff891967))
* start nginx on cold start before config validation ([1c1d99b](https://github.com/AidenWoodside/discord_clone/commit/1c1d99b7cd062862230cad070eb056e638c0cfe9))

## [0.99.133](https://github.com/AidenWoodside/discord_clone/compare/v0.99.132...v0.99.133) (2026-03-01)


### Bug Fixes

* **ci:** make release workflow compatible with manual dispatch ([c571e6c](https://github.com/AidenWoodside/discord_clone/commit/c571e6cf63497ad379e9e605f852bf5d49cce1d3))
* **ci:** make release workflow compatible with workflow_dispatch ([2d30b80](https://github.com/AidenWoodside/discord_clone/commit/2d30b80d4429bdd4f56a2e2dc371c44c6d079b32))

## [0.99.132](https://github.com/AidenWoodside/discord_clone/compare/v0.99.131...v0.99.132) (2026-03-01)


### Bug Fixes

* install trivy to user-writable path ([#62](https://github.com/AidenWoodside/discord_clone/issues/62)) ([8b64034](https://github.com/AidenWoodside/discord_clone/commit/8b64034276b9b421f8aa0ec575f41443efd0786c))

## [0.99.131](https://github.com/AidenWoodside/discord_clone/compare/v0.99.130...v0.99.131) (2026-03-01)


### Bug Fixes

* install trivy directly instead of using broken action ([#60](https://github.com/AidenWoodside/discord_clone/issues/60)) ([5a64e27](https://github.com/AidenWoodside/discord_clone/commit/5a64e2767bfc4bf43706687d630ccb951f98b619))

## [0.99.130](https://github.com/AidenWoodside/discord_clone/compare/v0.99.129...v0.99.130) (2026-03-01)


### Bug Fixes

* skip Trivy check update to avoid git clone failure in CI ([#58](https://github.com/AidenWoodside/discord_clone/issues/58)) ([bd2a6c4](https://github.com/AidenWoodside/discord_clone/commit/bd2a6c42cfcc3f5c7f5c93f196d2fcc4f6cb80de))

## [0.99.129](https://github.com/AidenWoodside/discord_clone/compare/v0.99.128...v0.99.129) (2026-03-01)


### Bug Fixes

* quiet docker compose output to prevent SSM IPC timeout ([#56](https://github.com/AidenWoodside/discord_clone/issues/56)) ([b46cf8f](https://github.com/AidenWoodside/discord_clone/commit/b46cf8f0aa4f7911bf0ecad1461536e1866e0f86))

## [0.99.128](https://github.com/AidenWoodside/discord_clone/compare/v0.99.127...v0.99.128) (2026-02-28)


### Bug Fixes

* skip step-5 migration on cold start (already ran in step 3a) ([#54](https://github.com/AidenWoodside/discord_clone/issues/54)) ([73db58f](https://github.com/AidenWoodside/discord_clone/commit/73db58f9e6390d9380ce78c12c08b28409ab67fd))

## [0.99.127](https://github.com/AidenWoodside/discord_clone/compare/v0.99.126...v0.99.127) (2026-02-28)


### Bug Fixes

* correct migration script path in deploy script ([#52](https://github.com/AidenWoodside/discord_clone/issues/52)) ([cc4e5b6](https://github.com/AidenWoodside/discord_clone/commit/cc4e5b6632c60a1268b1e9d77175226c2cd3bc6d))

## [0.99.126](https://github.com/AidenWoodside/discord_clone/compare/v0.99.125...v0.99.126) (2026-02-28)


### Bug Fixes

* gracefully skip seed when database tables do not exist ([7771ab0](https://github.com/AidenWoodside/discord_clone/commit/7771ab0d1cf49fbdeac98daaf6a6896df84a820c))
* remove dotenv, handle seed and cold-start migrations ([dbf95d8](https://github.com/AidenWoodside/discord_clone/commit/dbf95d88049535089da082e7f7d72b42982e7f96))
* run migrations before health check on cold start ([5e7309d](https://github.com/AidenWoodside/discord_clone/commit/5e7309dbdd5e324341a294e858f1d96f9eefe690))

## [0.99.125](https://github.com/AidenWoodside/discord_clone/compare/v0.99.124...v0.99.125) (2026-02-28)


### Bug Fixes

* remove dotenv runtime import for production ([02afd81](https://github.com/AidenWoodside/discord_clone/commit/02afd8193dc0fc453a07d51b32258b75c6d73877))
* remove dotenv runtime import from server entry point ([f5b9322](https://github.com/AidenWoodside/discord_clone/commit/f5b93223c8a4b150ca2d505057237d5c86ca974d))

## [0.99.124](https://github.com/AidenWoodside/discord_clone/compare/v0.99.123...v0.99.124) (2026-02-28)


### Bug Fixes

* replace awslogs-stream-prefix with tag option ([09a6935](https://github.com/AidenWoodside/discord_clone/commit/09a693582855969341ace465774753955898c270))
* replace awslogs-stream-prefix with tag option ([96b91e9](https://github.com/AidenWoodside/discord_clone/commit/96b91e970855a000913a79062455194c6d9a8a0c))

## [0.99.123](https://github.com/AidenWoodside/discord_clone/compare/v0.99.122...v0.99.123) (2026-02-28)


### Bug Fixes

* authenticate with GHCR before pulling private server image ([93911aa](https://github.com/AidenWoodside/discord_clone/commit/93911aa88943032df05f3bdfbce67269d99e962b))
* authenticate with GHCR before pulling server image ([bf31880](https://github.com/AidenWoodside/discord_clone/commit/bf318801c3be188c4a01aa78d662bbf70f6e3e4c))

## [0.99.122](https://github.com/AidenWoodside/discord_clone/compare/v0.99.121...v0.99.122) (2026-02-28)


### Bug Fixes

* allow Docker Compose major versions above 2 in deploy script ([feff74c](https://github.com/AidenWoodside/discord_clone/commit/feff74c572b4a7ef1b57a42397a5dc6d2743f4b8))
* allow Docker Compose major versions above 2 in deploy script ([aee7e40](https://github.com/AidenWoodside/discord_clone/commit/aee7e401453c31ccd0ecb258439f0ca2faa5e3d8))

## [0.99.121](https://github.com/AidenWoodside/discord_clone/compare/v0.99.120...v0.99.121) (2026-02-28)


### Bug Fixes

* use env var to guard webhook URL in deploy step ([631cfc5](https://github.com/AidenWoodside/discord_clone/commit/631cfc53ea0d89714445c84fe14e37dbfb7d68ae))
* use env var to guard webhook URL instead of secrets context ([5bc645f](https://github.com/AidenWoodside/discord_clone/commit/5bc645f475950c5cbf915420b9c48cd36793468c))

## [0.99.120](https://github.com/AidenWoodside/discord_clone/compare/v0.99.119...v0.99.120) (2026-02-28)


### Bug Fixes

* add AWS CLI v2 path to SSM commands and guard webhook URL ([c002b52](https://github.com/AidenWoodside/discord_clone/commit/c002b52363c114dd7add9fed6165873fedc87211))
* add AWS CLI v2 path to SSM commands and guard webhook URL ([768558c](https://github.com/AidenWoodside/discord_clone/commit/768558c9459231b1f73bd30c3402a7983e1a7e18))

## [0.99.119](https://github.com/AidenWoodside/discord_clone/compare/v0.99.118...v0.99.119) (2026-02-28)


### Bug Fixes

* resolve trivy scan and electron-builder publish failures ([2b44473](https://github.com/AidenWoodside/discord_clone/commit/2b4447393a540af7d6963df5d9cda05f3a7788b6))
* skip unfixed CVEs in trivy security scan ([6ae511f](https://github.com/AidenWoodside/discord_clone/commit/6ae511fa64e0d8afd9907871563c4513c6b32b5d))
* use artifacts pipeline instead of electron-builder publish ([e189717](https://github.com/AidenWoodside/discord_clone/commit/e189717f80f7802f9af54107e73317887c9fdff1))

## [0.99.118](https://github.com/AidenWoodside/discord_clone/compare/v0.99.117...v0.99.118) (2026-02-28)


### Performance Improvements

* switch to Debian slim base image for prebuilt mediasoup worker ([6e948e9](https://github.com/AidenWoodside/discord_clone/commit/6e948e9994fdb5c16be5267a9ce42082670a128a))
* switch to Debian slim for prebuilt mediasoup worker ([25e2c8c](https://github.com/AidenWoodside/discord_clone/commit/25e2c8cad2762d85dda920eb5170d7a18742a68e))

## [0.99.117](https://github.com/AidenWoodside/discord_clone/compare/v0.99.116...v0.99.117) (2026-02-28)


### Bug Fixes

* use PAT for release-please to trigger release workflow ([7c70673](https://github.com/AidenWoodside/discord_clone/commit/7c706737a70e2e639e8e486ba4cb1e8fc5e6ef19))
* use PAT for release-please to trigger release workflow ([5202d70](https://github.com/AidenWoodside/discord_clone/commit/5202d706d7794e5e8679700e5af69fdcfc88c041))


### Performance Improvements

* mock mediasoup and reduce bcrypt rounds in tests ([2a8deba](https://github.com/AidenWoodside/discord_clone/commit/2a8deba109f5ca717f036888e6d06e183741a7a0))
* mock mediasoup in non-voice tests via vitest setup file ([da5e4a2](https://github.com/AidenWoodside/discord_clone/commit/da5e4a29fb93b89fd1344a8028c7931d0b455c33))
* use minimal bcrypt rounds in test environment ([5b11bbf](https://github.com/AidenWoodside/discord_clone/commit/5b11bbfa40c6f740516d4de1a880de07009eb462))

## [0.99.116](https://github.com/AidenWoodside/discord_clone/compare/v0.99.115...v0.99.116) (2026-02-28)


### Bug Fixes

* add production environment to publish-release job ([0d6e864](https://github.com/AidenWoodside/discord_clone/commit/0d6e864f3bc421141fb49e0e98057ac52cc87a22))
* use BuildKit cache mount for npm ci in server Dockerfile ([aee0dc2](https://github.com/AidenWoodside/discord_clone/commit/aee0dc21d061ebffec2dcd02a39e7ec79c806b6d))
* use BuildKit cache mount for npm ci in server Dockerfile ([43fb9c2](https://github.com/AidenWoodside/discord_clone/commit/43fb9c27579acc49e22100a40c96f29cbd642017))

## [0.99.115](https://github.com/AidenWoodside/discord_clone/compare/v0.99.114...v0.99.115) (2026-02-28)


### Features

* migrate database layer from SQLite to PostgreSQL (Supabase) ([af5cf02](https://github.com/AidenWoodside/discord_clone/commit/af5cf028ab2ccc3888fe76032aa21a2d290e3159))


### Bug Fixes

* address 24 code review findings from Supabase migration review ([359aee8](https://github.com/AidenWoodside/discord_clone/commit/359aee890ee8a92fca4a61c43dc157b7791c0991))
* configure coturn for production voice connectivity ([153edfe](https://github.com/AidenWoodside/discord_clone/commit/153edfeb625223a0ebe94eb50162cbad7d17cd9e))
* remove component prefix from release-please tags ([f9fdcca](https://github.com/AidenWoodside/discord_clone/commit/f9fdccadefa0b9ccc74116ef0835784679b9f7a4))

## [0.99.114](https://github.com/AidenWoodside/discord_clone/compare/discord-clone-v0.99.113...discord-clone-v0.99.114) (2026-02-28)


### Features

* migrate database layer from SQLite to PostgreSQL (Supabase) ([af5cf02](https://github.com/AidenWoodside/discord_clone/commit/af5cf028ab2ccc3888fe76032aa21a2d290e3159))


### Bug Fixes

* address 24 code review findings from Supabase migration review ([359aee8](https://github.com/AidenWoodside/discord_clone/commit/359aee890ee8a92fca4a61c43dc157b7791c0991))
* configure coturn for production voice connectivity ([153edfe](https://github.com/AidenWoodside/discord_clone/commit/153edfeb625223a0ebe94eb50162cbad7d17cd9e))
