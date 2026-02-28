# Changelog

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
