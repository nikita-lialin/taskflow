# TaskFlow

TaskFlow manages tasks for several teams. People sign in, create organizations, and work in projects, tasks, and comments. Each organization is a separate tenant: its data is never visible to another organization. Inside an organization, an Admin has full access. A Member reads everything and changes only the tasks they created or that are assigned to them.

[SPEC.md](SPEC.md) defines the product rules, roles, and API. [AGENTS.md](AGENTS.md) defines architecture and working rules.

## Applications

| Path | Purpose | Guide |
| --- | --- | --- |
| `backend` | Bun and Hono API, PostgreSQL, authentication, background jobs | [Backend](backend/README.md) |
| `webapp` | React application for signed-in users | [Webapp](webapp/README.md) |
| `website` | Astro pages for the public site | [Website](website/README.md) |
| `packages/contracts` | Shared API schemas and types | [Contracts](packages/contracts/README.md) |

## Run locally

Requirements: Bun (the version in [package.json](package.json)) and Docker with Compose. Run all commands from the repository root.

```bash
bun install --frozen-lockfile
cp backend/.env.example backend/.env
```

In PowerShell, use `Copy-Item backend/.env.example backend/.env`. Set `JWT_SECRET` in `backend/.env` to a random string of at least 32 characters.

Start the database, apply migrations, and add local data:

```bash
docker compose --env-file backend/.env up -d --wait postgres
bun run --cwd backend prisma:deploy
DEV_SEED_DEMO=1 bun run dev:seed
```

In PowerShell, set the variable first: `$env:DEV_SEED_DEMO = "1"`.

Start the API and the web application, each in its own terminal:

```bash
bun run dev:backend
bun run dev:webapp
```

Open `http://localhost:5173`. The API runs on `http://localhost:3000` (`PORT`); `GET /openapi.json` returns its OpenAPI document.

### Demo data

The seed refuses production and non-loopback databases. Without `DEV_SEED_DEMO`, it creates only the two local accounts from `DEV_SEED_*`. With `DEV_SEED_DEMO=1`, it also creates two organizations (Acme Studio and Globex Labs) with members, projects, tasks, and comments. Both accounts belong to both organizations with opposite roles. Run the seed again at any time: it rebuilds the demo organizations without duplicates.

To sign in, use `DEV_SEED_ADMIN_EMAIL` or `DEV_SEED_USER_EMAIL` with the matching password from `backend/.env`.

## Tests and checks

```bash
bun run typecheck            # all applications
bun run architecture:check   # import boundaries
bun run lint                 # webapp
bun run test:contracts
bun run test:backend         # unit and integration; needs Docker
bun run test:webapp
bun run e2e:webapp           # Playwright browser tests
bun run check                # everything above for a release; needs Docker and registry access
```

The backend integration runner starts and removes its own test database. [Testing](docs/TESTING.md) explains focused runs. [UI](docs/UI.md) explains theme generation and screenshots.

## Environment variables

[backend/.env.example](backend/.env.example) lists every backend setting, and [backend/src/env.ts](backend/src/env.ts) validates them. The main ones:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection | local Compose database |
| `JWT_SECRET` | Signs access tokens (32+ characters) | none, required |
| `CORS_ORIGINS` | Browser origins the API accepts | local webapp origins |
| `WEBAPP_ORIGIN` | Origin used in password reset links | `http://localhost:5173` |
| `DEV_SEED_*` | Local demo accounts for `dev:seed` | see `.env.example` |
| `AUTH_BODY_LIMIT_BYTES` | Largest request body on any API route (413 above it). A task needs at most about 40 KB. | 65536 |
| `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_SECONDS` | Writes per client address | 60 per 60 s |
| `WRITE_RATE_LIMIT_MAX`, `WRITE_RATE_LIMIT_WINDOW_SECONDS` | Writes per signed-in user (429 above it) | 120 per 60 s |
| `RATE_LIMIT_STORE` | `memory`, or `database` when several API processes run | `memory` |
| `EMAIL_DELIVERY` | `disabled`, `console`, or a provider | `disabled` |

The webapp reads `VITE_API_URL` ([webapp/.env.example](webapp/.env.example)).

## Deployment

[Deployment](docs/DEPLOYMENT.md) covers production setup and recovery. Deploy only through `scripts/infra.mjs`.

## License

Apache License 2.0. Keep [LICENSE](LICENSE) and [NOTICE](NOTICE) when distributing this project. Preserve the attribution to Dima Sukharev, his GitHub account, and the source repository.
