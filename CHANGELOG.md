# Changelog

## [1.2.2](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/compare/v1.2.1...v1.2.2) (2026-06-30)


### Bug Fixes

* use official caprover deploy action instead of raw curl ([23d7cff](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/23d7cff31d92013a72ded284640c571cac36bd84))
* use official caprover deploy action instead of raw curl ([b1566dd](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/b1566ddaf3f336119091621441d4744d3f1b5a2d))

## [1.2.1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/compare/v1.2.0...v1.2.1) (2026-06-30)


### Bug Fixes

* check both release_created and releases_created outputs ([152cbf7](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/152cbf7866a1a6c4b9d8fc7040f9f03405818ea5))
* check both release_created and releases_created outputs ([079cab2](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/079cab26f783d4c3b5e9c31dd9f0a5fe282cf44b))

## [1.2.0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/compare/v1.1.0...v1.2.0) (2026-06-30)


### Features

* add client balance snapshot to transaction schema and service ([c459f43](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c459f432a014ff6bb9d5e8765d5795b7c85b52a2))
* add clientBalanceAfterTransaction field to transaction creation ([5e33f7b](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/5e33f7b9c41805126171aba052c216f41fbfe0f2))
* Add WebSocket broadcasting for maintenance mode and waybill assignment ([8e8a4dd](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/8e8a4dd8f0fe74409c9dd130b4de53e1ce3e53d1))
* allow negative balances for PURCHASE and PICKUP transactions, update related logic ([5196463](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/51964630804fcba2d4218a6b2cf0d6e2b7714244))
* change the apps db from mongodb to postgres along with all its relations using prisma orm ([64e14f7](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/64e14f71e6e9088067ccf990f0975fd235797176))
* Implement RETURN transaction handling with validation and processing logic ([e884f4f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/e884f4f62dcaead43188572053b129ea36fc12b1))
* Implement Return Transaction Validation Audit & Wholesale Ledger Refactor ([c008338](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c008338b825d217cbbb1ca049e6a190cbad991ff))
* Implement WHOLESALE transaction type with validation and processing logic ([779dd2d](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/779dd2d838b681cd2a6b4d9b6b002472b34f18f5))
* include user role in transaction user population queries ([699aa93](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/699aa933dc251864cf17868e48c1af9b1979a2d1))
* integrate client model and update transaction service to manage client balance within transaction sessions ([94d17fa](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/94d17fab3cf9a069b6e4e2b9087a5ec4f7773a78))
* remove unnecessary logging from authentication and transaction processes ([eb5e138](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/eb5e138e393ac5e576b9bcace60883074117a440))
* update logging in client, product, and transaction services to be non-blocking ([3297be4](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/3297be46ea9c8f00f4ee3abbf415bcd8127e5def))
* update transaction sorting to use createdAt instead of date ([8b52ef4](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/8b52ef49b5c5beca66d11a44887b66144ba56e93))
* Update wholesale pricing logic to use unitPrice from request body with fallback to wholesalePrice ([f05d8c0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/f05d8c0c7ddcbf38bd5d251579be2122b795d6d7))
* validate JWT_SECRET configuration and deprecate PICKUP transaction type ([47d4348](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/47d43483bea3bbfc5d370cb65295da442efac734))


### Bug Fixes

* add CapRover subdomain URLs to CORS allowed origins ([a91feaf](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/a91feaf553119ba977a6545e3d20067d2b4e5c57))
* Add memory limits for Render deployment ([986b9a1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/986b9a1f10663bdc159da7cb4023473595d60a6f))
* Add missing DEPOSIT logic to update client balance ([45547d1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/45547d1774b5547c39f7f35c49c4d921645c43a8))
* added new features(wholesale and return type transactions) ([a0c0a15](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/a0c0a157c6aec6177072c581f598499957888def))
* Allow Jest to pass with no tests ([407faef](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/407faef31b76a06b49cceb0e1af6cbccce64ca15))
* Await async getRefreshTokenData in cookie refresh middleware ([e1fa2c1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/e1fa2c158e7f796afa0db716d088baed939a7332))
* Correct DEPOSIT ledger amount to add instead of subtract ([f440db1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/f440db1562b7a773f28d43dfcc7a89d94214d12f))
* corrections ([6828db1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/6828db18ad97c9ada677262f84f2b3c9d5782f89))
* expected logout ([bda6361](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/bda6361e7cc270b1fea30c8e0b269e3f8fb779f5))
* fixed the docker image issue ([b11000c](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/b11000c0c781cf77a0f3238ec24daec5d1be1cc7))
* import PrismaClientKnownRequestError from runtime library ([f462767](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/f462767ab629e6fbbf166e1d4bcf6c37c860ae00))
* new fixes on the transactions ([c13655f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c13655fd308a930e6a4bc9a9129746242cab9327))
* notification module, added branch to system-activity schema so notication can be directed the right admins ([ca67229](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/ca6722942abca82d08f32a11daded148e049c8ad))
* Optimize build for Render free tier memory limits ([c4edeb2](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c4edeb27ffe3a40cb3fb166c675fa7ab73f3772d))
* Persist refresh tokens in database to survive server restarts ([9a8e2a0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/9a8e2a08dd7515c6159ad6e6f3b991c3130388b2))
* Remove invalid JSON body from Render deploy API call ([58ce75a](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/58ce75aac1164da06586212f3147f998873caf4c))
* Remove invalid JSON body from Render deploy API call ([58ce75a](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/58ce75aac1164da06586212f3147f998873caf4c))
* Remove invalid JSON body from Render deploy API call ([301474c](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/301474cc8d5127942e900e98905afd357fd46ba9))
* Remove unused variables and imports (lint errors) ([3323b7b](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/3323b7b82bb3cacdb2aea423114efb179a501d66))
* Replace generic Error with ForbiddenException in users controller ([d0ce4e9](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/d0ce4e9f742d72626fdcbdb0960994c8bd9182b8))
* Resolve WebSocket authentication and CORS issues for real-time updates ([a39a155](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/a39a15531ac270776ea717d199fe7ece29a24057))
* Restrict maintenance mode access to MAINTAINER only ([5eb2bfe](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/5eb2bfe89a6167672c1bb703f5158edfc292589e))
* retrieve some permissions from the admin and staff ([50f7a5f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/50f7a5f2bd041fb54bc368082751dd935dbd18a1))
* still fixing the numerous issues that were pointed out by the manager ([5eddac1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/5eddac11857261a8c048b6bb27e3b52988fee54a))
* stop the return of wholesale transactions from updating stock ([18ba3c3](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/18ba3c3e074e6d4828229e4403ce9213afdf4971))
* update CORS to allow new production and staging domains ([6764db5](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/6764db5ec57b21f4cc61e6f726633336f9b201f3))
* update Dockerfile for Prisma and replace MongoDB with PostgreSQL in docker-compose ([e2c881f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/e2c881f619661e980ddbb8e7243352730e8e947d))
* Update health check with production-standard memory thresholds ([6bb249c](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/6bb249c70ca6d6b48773f7ce1613a034dc20b07e))
* Update Render service ID for Docker deployment ([bfc9868](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/bfc9868c626f3a04086e349086748f42292eb160))
* use --omit=dev --ignore-scripts in production Docker stage ([53e3f8d](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/53e3f8de5c4e6f165b4bc40fd93ce235cdfe3e8b))
* use correct googleapis release-please action namespace ([8887ef6](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/8887ef64820ec4e6829a7e6aecb75af9d2a1e870))
* use duck typing for Prisma error detection to avoid import issues ([2aa3b8b](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/2aa3b8b8ed9740bd7fb99a5c28d5c60f9948e4e2))
* use truthy check for release_created output condition ([3b886f0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/3b886f06c537cac7aeac574425744899dba85507))

## [1.1.0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/compare/v1.0.0...v1.1.0) (2026-06-30)


### Features

* add client balance snapshot to transaction schema and service ([c459f43](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c459f432a014ff6bb9d5e8765d5795b7c85b52a2))
* add clientBalanceAfterTransaction field to transaction creation ([5e33f7b](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/5e33f7b9c41805126171aba052c216f41fbfe0f2))
* Add WebSocket broadcasting for maintenance mode and waybill assignment ([8e8a4dd](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/8e8a4dd8f0fe74409c9dd130b4de53e1ce3e53d1))
* allow negative balances for PURCHASE and PICKUP transactions, update related logic ([5196463](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/51964630804fcba2d4218a6b2cf0d6e2b7714244))
* change the apps db from mongodb to postgres along with all its relations using prisma orm ([64e14f7](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/64e14f71e6e9088067ccf990f0975fd235797176))
* Implement RETURN transaction handling with validation and processing logic ([e884f4f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/e884f4f62dcaead43188572053b129ea36fc12b1))
* Implement Return Transaction Validation Audit & Wholesale Ledger Refactor ([c008338](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c008338b825d217cbbb1ca049e6a190cbad991ff))
* Implement WHOLESALE transaction type with validation and processing logic ([779dd2d](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/779dd2d838b681cd2a6b4d9b6b002472b34f18f5))
* include user role in transaction user population queries ([699aa93](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/699aa933dc251864cf17868e48c1af9b1979a2d1))
* integrate client model and update transaction service to manage client balance within transaction sessions ([94d17fa](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/94d17fab3cf9a069b6e4e2b9087a5ec4f7773a78))
* remove unnecessary logging from authentication and transaction processes ([eb5e138](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/eb5e138e393ac5e576b9bcace60883074117a440))
* update logging in client, product, and transaction services to be non-blocking ([3297be4](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/3297be46ea9c8f00f4ee3abbf415bcd8127e5def))
* update transaction sorting to use createdAt instead of date ([8b52ef4](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/8b52ef49b5c5beca66d11a44887b66144ba56e93))
* Update wholesale pricing logic to use unitPrice from request body with fallback to wholesalePrice ([f05d8c0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/f05d8c0c7ddcbf38bd5d251579be2122b795d6d7))
* validate JWT_SECRET configuration and deprecate PICKUP transaction type ([47d4348](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/47d43483bea3bbfc5d370cb65295da442efac734))


### Bug Fixes

* add CapRover subdomain URLs to CORS allowed origins ([a91feaf](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/a91feaf553119ba977a6545e3d20067d2b4e5c57))
* Add memory limits for Render deployment ([986b9a1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/986b9a1f10663bdc159da7cb4023473595d60a6f))
* Add missing DEPOSIT logic to update client balance ([45547d1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/45547d1774b5547c39f7f35c49c4d921645c43a8))
* added new features(wholesale and return type transactions) ([a0c0a15](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/a0c0a157c6aec6177072c581f598499957888def))
* Allow Jest to pass with no tests ([407faef](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/407faef31b76a06b49cceb0e1af6cbccce64ca15))
* Await async getRefreshTokenData in cookie refresh middleware ([e1fa2c1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/e1fa2c158e7f796afa0db716d088baed939a7332))
* Correct DEPOSIT ledger amount to add instead of subtract ([f440db1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/f440db1562b7a773f28d43dfcc7a89d94214d12f))
* corrections ([6828db1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/6828db18ad97c9ada677262f84f2b3c9d5782f89))
* expected logout ([bda6361](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/bda6361e7cc270b1fea30c8e0b269e3f8fb779f5))
* fixed the docker image issue ([b11000c](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/b11000c0c781cf77a0f3238ec24daec5d1be1cc7))
* import PrismaClientKnownRequestError from runtime library ([f462767](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/f462767ab629e6fbbf166e1d4bcf6c37c860ae00))
* new fixes on the transactions ([c13655f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c13655fd308a930e6a4bc9a9129746242cab9327))
* notification module, added branch to system-activity schema so notication can be directed the right admins ([ca67229](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/ca6722942abca82d08f32a11daded148e049c8ad))
* Optimize build for Render free tier memory limits ([c4edeb2](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c4edeb27ffe3a40cb3fb166c675fa7ab73f3772d))
* Persist refresh tokens in database to survive server restarts ([9a8e2a0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/9a8e2a08dd7515c6159ad6e6f3b991c3130388b2))
* Remove invalid JSON body from Render deploy API call ([58ce75a](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/58ce75aac1164da06586212f3147f998873caf4c))
* Remove invalid JSON body from Render deploy API call ([58ce75a](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/58ce75aac1164da06586212f3147f998873caf4c))
* Remove invalid JSON body from Render deploy API call ([301474c](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/301474cc8d5127942e900e98905afd357fd46ba9))
* Remove unused variables and imports (lint errors) ([3323b7b](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/3323b7b82bb3cacdb2aea423114efb179a501d66))
* Replace generic Error with ForbiddenException in users controller ([d0ce4e9](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/d0ce4e9f742d72626fdcbdb0960994c8bd9182b8))
* Resolve WebSocket authentication and CORS issues for real-time updates ([a39a155](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/a39a15531ac270776ea717d199fe7ece29a24057))
* Restrict maintenance mode access to MAINTAINER only ([5eb2bfe](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/5eb2bfe89a6167672c1bb703f5158edfc292589e))
* retrieve some permissions from the admin and staff ([50f7a5f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/50f7a5f2bd041fb54bc368082751dd935dbd18a1))
* still fixing the numerous issues that were pointed out by the manager ([5eddac1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/5eddac11857261a8c048b6bb27e3b52988fee54a))
* stop the return of wholesale transactions from updating stock ([18ba3c3](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/18ba3c3e074e6d4828229e4403ce9213afdf4971))
* update CORS to allow new production and staging domains ([6764db5](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/6764db5ec57b21f4cc61e6f726633336f9b201f3))
* update Dockerfile for Prisma and replace MongoDB with PostgreSQL in docker-compose ([e2c881f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/e2c881f619661e980ddbb8e7243352730e8e947d))
* Update health check with production-standard memory thresholds ([6bb249c](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/6bb249c70ca6d6b48773f7ce1613a034dc20b07e))
* Update Render service ID for Docker deployment ([bfc9868](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/bfc9868c626f3a04086e349086748f42292eb160))
* use --omit=dev --ignore-scripts in production Docker stage ([53e3f8d](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/53e3f8de5c4e6f165b4bc40fd93ce235cdfe3e8b))
* use correct googleapis release-please action namespace ([8887ef6](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/8887ef64820ec4e6829a7e6aecb75af9d2a1e870))
* use duck typing for Prisma error detection to avoid import issues ([2aa3b8b](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/2aa3b8b8ed9740bd7fb99a5c28d5c60f9948e4e2))
* use truthy check for release_created output condition ([3b886f0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/3b886f06c537cac7aeac574425744899dba85507))

## 1.0.0 (2026-06-30)


### Features

* add client balance snapshot to transaction schema and service ([c459f43](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c459f432a014ff6bb9d5e8765d5795b7c85b52a2))
* add clientBalanceAfterTransaction field to transaction creation ([5e33f7b](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/5e33f7b9c41805126171aba052c216f41fbfe0f2))
* Add WebSocket broadcasting for maintenance mode and waybill assignment ([8e8a4dd](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/8e8a4dd8f0fe74409c9dd130b4de53e1ce3e53d1))
* allow negative balances for PURCHASE and PICKUP transactions, update related logic ([5196463](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/51964630804fcba2d4218a6b2cf0d6e2b7714244))
* change the apps db from mongodb to postgres along with all its relations using prisma orm ([64e14f7](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/64e14f71e6e9088067ccf990f0975fd235797176))
* Implement RETURN transaction handling with validation and processing logic ([e884f4f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/e884f4f62dcaead43188572053b129ea36fc12b1))
* Implement Return Transaction Validation Audit & Wholesale Ledger Refactor ([c008338](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c008338b825d217cbbb1ca049e6a190cbad991ff))
* Implement WHOLESALE transaction type with validation and processing logic ([779dd2d](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/779dd2d838b681cd2a6b4d9b6b002472b34f18f5))
* include user role in transaction user population queries ([699aa93](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/699aa933dc251864cf17868e48c1af9b1979a2d1))
* integrate client model and update transaction service to manage client balance within transaction sessions ([94d17fa](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/94d17fab3cf9a069b6e4e2b9087a5ec4f7773a78))
* remove unnecessary logging from authentication and transaction processes ([eb5e138](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/eb5e138e393ac5e576b9bcace60883074117a440))
* update logging in client, product, and transaction services to be non-blocking ([3297be4](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/3297be46ea9c8f00f4ee3abbf415bcd8127e5def))
* update transaction sorting to use createdAt instead of date ([8b52ef4](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/8b52ef49b5c5beca66d11a44887b66144ba56e93))
* Update wholesale pricing logic to use unitPrice from request body with fallback to wholesalePrice ([f05d8c0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/f05d8c0c7ddcbf38bd5d251579be2122b795d6d7))
* validate JWT_SECRET configuration and deprecate PICKUP transaction type ([47d4348](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/47d43483bea3bbfc5d370cb65295da442efac734))


### Bug Fixes

* add CapRover subdomain URLs to CORS allowed origins ([a91feaf](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/a91feaf553119ba977a6545e3d20067d2b4e5c57))
* Add memory limits for Render deployment ([986b9a1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/986b9a1f10663bdc159da7cb4023473595d60a6f))
* Add missing DEPOSIT logic to update client balance ([45547d1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/45547d1774b5547c39f7f35c49c4d921645c43a8))
* added new features(wholesale and return type transactions) ([a0c0a15](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/a0c0a157c6aec6177072c581f598499957888def))
* Allow Jest to pass with no tests ([407faef](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/407faef31b76a06b49cceb0e1af6cbccce64ca15))
* Await async getRefreshTokenData in cookie refresh middleware ([e1fa2c1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/e1fa2c158e7f796afa0db716d088baed939a7332))
* Correct DEPOSIT ledger amount to add instead of subtract ([f440db1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/f440db1562b7a773f28d43dfcc7a89d94214d12f))
* corrections ([6828db1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/6828db18ad97c9ada677262f84f2b3c9d5782f89))
* expected logout ([bda6361](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/bda6361e7cc270b1fea30c8e0b269e3f8fb779f5))
* fixed the docker image issue ([b11000c](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/b11000c0c781cf77a0f3238ec24daec5d1be1cc7))
* import PrismaClientKnownRequestError from runtime library ([f462767](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/f462767ab629e6fbbf166e1d4bcf6c37c860ae00))
* new fixes on the transactions ([c13655f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c13655fd308a930e6a4bc9a9129746242cab9327))
* notification module, added branch to system-activity schema so notication can be directed the right admins ([ca67229](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/ca6722942abca82d08f32a11daded148e049c8ad))
* Optimize build for Render free tier memory limits ([c4edeb2](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/c4edeb27ffe3a40cb3fb166c675fa7ab73f3772d))
* Persist refresh tokens in database to survive server restarts ([9a8e2a0](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/9a8e2a08dd7515c6159ad6e6f3b991c3130388b2))
* Remove invalid JSON body from Render deploy API call ([58ce75a](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/58ce75aac1164da06586212f3147f998873caf4c))
* Remove invalid JSON body from Render deploy API call ([58ce75a](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/58ce75aac1164da06586212f3147f998873caf4c))
* Remove invalid JSON body from Render deploy API call ([301474c](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/301474cc8d5127942e900e98905afd357fd46ba9))
* Remove unused variables and imports (lint errors) ([3323b7b](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/3323b7b82bb3cacdb2aea423114efb179a501d66))
* Replace generic Error with ForbiddenException in users controller ([d0ce4e9](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/d0ce4e9f742d72626fdcbdb0960994c8bd9182b8))
* Resolve WebSocket authentication and CORS issues for real-time updates ([a39a155](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/a39a15531ac270776ea717d199fe7ece29a24057))
* Restrict maintenance mode access to MAINTAINER only ([5eb2bfe](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/5eb2bfe89a6167672c1bb703f5158edfc292589e))
* retrieve some permissions from the admin and staff ([50f7a5f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/50f7a5f2bd041fb54bc368082751dd935dbd18a1))
* still fixing the numerous issues that were pointed out by the manager ([5eddac1](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/5eddac11857261a8c048b6bb27e3b52988fee54a))
* stop the return of wholesale transactions from updating stock ([18ba3c3](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/18ba3c3e074e6d4828229e4403ce9213afdf4971))
* update CORS to allow new production and staging domains ([6764db5](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/6764db5ec57b21f4cc61e6f726633336f9b201f3))
* update Dockerfile for Prisma and replace MongoDB with PostgreSQL in docker-compose ([e2c881f](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/e2c881f619661e980ddbb8e7243352730e8e947d))
* Update health check with production-standard memory thresholds ([6bb249c](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/6bb249c70ca6d6b48773f7ce1613a034dc20b07e))
* Update Render service ID for Docker deployment ([bfc9868](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/bfc9868c626f3a04086e349086748f42292eb160))
* use --omit=dev --ignore-scripts in production Docker stage ([53e3f8d](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/53e3f8de5c4e6f165b4bc40fd93ce235cdfe3e8b))
* use correct googleapis release-please action namespace ([8887ef6](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/8887ef64820ec4e6829a7e6aecb75af9d2a1e870))
* use duck typing for Prisma error detection to avoid import issues ([2aa3b8b](https://github.com/mfon-obong-nigeria-enterprises/mfon-obong-enterprise-backend/commit/2aa3b8b8ed9740bd7fb99a5c28d5c60f9948e4e2))
