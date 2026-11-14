# MovieMate

**Less scrolling. Better movie nights.** A mobile-first, self-hosted companion for the films already on your Jellyfin server.

MovieMate is an early **0.1.3 alpha**, not a finished product. The interface is currently Danish. It does not download media, modify film files, change Jellyfin ratings, or claim that similarity scores are probabilities.

## What works in this version

- Sign in with your own Jellyfin username and password. Your password is forwarded to Jellyfin, never persisted. The returned Jellyfin token stays on the server.
- Browse films visible to your account, search by title, and read details.
- Save private MovieMate ratings: dislike, good, favorite; remove a rating when needed.
- Get recommendations from your own unwatched library, with runtime filtering, a modest diversity penalty, and human-readable reasons.
- Use existing Jellyfin favorites and played flags to bootstrap recommendations. A played flag is only a weak signal; stopping a film never creates a dislike.
- Hide a recommendation for 12 hours without changing your taste profile.
- Invite one other Jellyfin profile to a two-hour movie-night room. Both participants must log in themselves and exchange a code. Results include only films available to both accounts and eligible for both users.
- Persistent PostgreSQL storage; Docker Compose deployment.

## Quick start on Windows / Plexi

Install Git and Docker Desktop with Linux containers. In PowerShell:

```powershell
git clone https://github.com/wilhelmsendk/moviemate.git
cd moviemate
Copy-Item .env.example .env
notepad .env
```

In `.env`, replace `POSTGRES_PASSWORD` with a **long random alphanumeric password** (use letters and digits to avoid connection-URL escaping problems). For Jellyfin installed directly on the same Windows machine, keep:

```dotenv
JELLYFIN_URL=http://host.docker.internal:8096
PORT=3210
COOKIE_SECURE=false
```

Then:

```powershell
docker compose up -d --build
```

Open `http://localhost:3210` on the server, or `http://192.168.86.120:3210` from your phone on the same network (replace the address for your server). If remote devices cannot connect, allow inbound TCP 3210 on the **private** Windows network profile. Log in with a Jellyfin user. No administrator API key is needed.

Jellyfin URLs may include a base path. For Jellyfin in another container, use an address reachable from MovieMate's container. `localhost` inside the container is not your Windows machine.

Repository access is currently controlled by its owner; if the repository is private, authenticate Git with an account that has access. Do not put access tokens in clone URLs or screenshots.

### A first movie night

1. Rate a few films you know in **Bibliotek**. Positive ratings and Jellyfin favorites give stronger taste signals than watched flags.
2. Open **I aften**, optionally set a maximum runtime, and review suggestions.
3. Open **Sammen**, create an invitation code, and ask your partner to sign into MovieMate with their own Jellyfin profile on another phone/browser and enter it.
4. Open the chosen film yourself in Moonfin/Jellyfin on the TV. **Remote playback is not implemented in 0.1.**

Two people using one shared Jellyfin account do not yet have separate MovieMate taste profiles. Sessions expire after seven days. Invitations expire after two hours. Library metadata is fetched on demand, coalesced for concurrent requests and cached in memory for 30 seconds per user/token (bounded to 24 sessions). It is not a persistent background mirror. Library access changes may take up to 30 seconds to reach this metadata cache; poster requests still check Jellyfin access directly. Ratings are read separately from PostgreSQL.

### Phone installation

A web manifest is included. Install-to-home-screen availability depends on the browser and HTTPS configuration. This is not an offline app. Push notifications and a service worker are not implemented.

## Architecture

- Next.js / React / TypeScript: responsive UI and server-side API.
- PostgreSQL: users, sessions, ratings, snoozes, and joint movie-night rooms.
- Jellyfin REST API: login, permission-scoped movie lists, and permission-checked poster proxying.
- A deterministic content-based recommender: genres, directors, cast, decade, favorites and explicit ratings. It keeps separate positive movie anchors instead of collapsing all interests into one vector. No paid API, GPU or LLM is required.

There is no Python service in this first baseline: this ranking is small enough to run directly in TypeScript. A separate Python engine remains an option once evaluation justifies it. The application and database are the only two services.

## Security and privacy

Start on a trusted local network. **Do not port-forward MovieMate directly to the Internet.** For remote use, configure a properly authenticated HTTPS reverse proxy and set `COOKIE_SECURE=true`. Verify the deployment before inviting users outside your household.

- The Jellyfin destination is configured by the operator, not accepted as an arbitrary URL from the browser.
- Session cookies are HTTP-only, SameSite=Lax, with random tokens hashed in the database.
- Write requests require a matching Origin/Host. Login attempts are limited per username in each application process.
- Database queries are parameterized; user access comes from the authenticated session.
- Room membership is established through an invitation code; it does not reveal a public list of server users.
- PostgreSQL is not published to the host network. Backups and the database contain sensitive Jellyfin access tokens. Tokens are **not encrypted at rest** in this alpha; protect the server, disk and backups accordingly.
- No telemetry or third-party recommendation services. Artwork is served from Jellyfin through MovieMate.

Not a security-audited release. Login throttling is in-process, single-instance; do not treat it as an Internet-facing abuse-defense system. Recommendations are convenience features, never parental controls. Jellyfin remains the authority for library access.

## Development

Node.js 24 and PostgreSQL 17:

```sh
npm ci
# Set DATABASE_URL and JELLYFIN_URL in your shell or .env.local
npm run dev
npm run typecheck
npm test
npm run build
```

Production Docker uses Next.js standalone output. Run the API integration suite after building, with `TEST_DATABASE_URL` pointing at an **isolated, empty test database**:

```sh
TEST_DATABASE_URL=postgresql://test:test@localhost:5432/moviemate_test npm run test:integration
```

It exercises real HTTP routes and PostgreSQL against a simulated Jellyfin server: authentication, origin checks, per-user ratings, permission boundaries, two-person room membership, snoozes and logout. Never use your production database for tests. GitHub Actions also builds the Docker image.

## Backup and restore

The `moviemate-db` Compose volume contains persistent app data. Keep `.env` privately with your backup. On Windows PowerShell, use a database-side dump and binary-safe `docker cp`:

```powershell
docker compose exec -T db pg_dump -U moviemate -d moviemate -Fc -f /tmp/moviemate.dump
docker compose cp db:/tmp/moviemate.dump ./moviemate.dump
docker compose exec -T db rm /tmp/moviemate.dump
```

To restore into a **fresh empty MovieMate database** with the app stopped:

```powershell
docker compose stop moviemate
docker compose cp ./moviemate.dump db:/tmp/moviemate.dump
docker compose exec -T db pg_restore -U moviemate -d moviemate --no-owner /tmp/moviemate.dump
docker compose exec -T db rm /tmp/moviemate.dump
docker compose start moviemate
```

A backup is not verified until a restore has been tested on a separate instance. Take a database backup before updates. `docker compose down` keeps data; **`docker compose down -v` deletes it**.

## Roadmap

- [ ] Real-server testing on Plexi and Moonfin; direct session playback with a manual fallback.
- [ ] Playback event ingestion, reliable finish detection, post-film prompts and opt-in push.
- [ ] Rating/history import from Netflix exports, Letterboxd and Trakt, with match review.
- [ ] Recommendations and short messages to other opted-in users on the same server.
- [ ] Joint shortlisting/voting, mood and language constraints, meaningful badges.
- [ ] Recommendation evaluation: fixed fixtures, feedback, novelty and shared satisfaction.
- [ ] Jellyfin companion plugin distributed through a third-party repository.
- [ ] Moonbase Watch Party handoff after API compatibility is verified. **Not a player or SyncPlay replacement.**
- [ ] Translations, install icons and visual regression tests.

## Contributing and license

Contributions are welcome. Open an issue before a large change, keep secrets and real viewing data out of fixtures, and include tests for changes to access control or recommendation behavior.

AGPL-3.0-only. See [LICENSE](LICENSE). MovieMate is independent of Jellyfin and Moonfin and is not affiliated with them.

## 0.1.1 fixes

- Each Jellyfin sign-in uses a unique device ID so partners do not replace each other's device sessions.
- Full-library pair ranking reuses precomputed feature vectors and avoids doing diversity ordering for every film; solo diversity selection is incremental.
- Pair polling never overlaps and pauses when the Together screen is not open.
- An expired partner token is reported as a partner sign-in problem rather than invalidating the viewer's own session.
- Regression coverage includes 500-film pair ranking and a Jellyfin simulator that invalidates sessions when a device ID is reused.

After upgrading from 0.1.0, both partners should log out of MovieMate and log back in to obtain independent Jellyfin sessions. Existing ratings are retained.

## 0.1.2 responsiveness fixes

- The MovieMate logo switches to Tonight without a page reload; movie lists stay in browser memory while the app is open.
- Rating a film updates it immediately without locking other films. Failed saves are rolled back and shown as an error.
- Recommendation refresh happens in the background; late responses cannot replace a newer refresh or cross into another signed-in account.
- Changing runtime filters refreshes recommendations only, not the complete library.
- A bounded, 30-second per-session metadata cache coalesces simultaneous library reads. Failed reads are not cached and different users/tokens never share entries.
- Rating authorization checks the same permission-scoped library snapshot, avoiding a fresh Jellyfin metadata request for every click.
- Component tests simulate multiple ratings before the first save finishes, failed saves, and returning home without another library request. API tests verify metadata reuse and user isolation.

## 0.1.3 film details and recommendations to friends

“Se filmen nærmere” now opens a film-first detail view: full synopsis, cast, director, audio languages, and external trailer links when Jellyfin provides them. “Det bliver den her” confirms the choice with an instruction to start it on your TV; it does **not** start playback. Ratings open separately through “Bedøm filmen”; cards under “Min smag” still open the rating view directly.

To recommend a film to another MovieMate user on the **same configured Jellyfin server**:

1. Both people sign into MovieMate with separate Jellyfin accounts.
2. The recipient opens their user button at the top and enables **Modtag filmanbefalinger**. This makes their username visible to other signed-in users in the recipient picker; ratings and history remain private. Receiving is off by default, including for existing accounts.
3. Open a film, choose **Del med bruger**, select the recipient, and optionally add a message of up to 500 characters.
4. The recipient opens **Indbakke** to view the recommendation and film details. This is an in-app inbox, not chat or a push notification.

Sending checks that the film is accessible to both accounts. The recipient must have a non-expired MovieMate/Jellyfin session. The inbox hides films no longer visible to the recipient (subject to the existing 30-second metadata-cache window). Only the recipient can mark a recommendation read. Duplicate recommendations to the same person for the same film within a day are rejected; a basic per-sender daily limit of 20 applies.

The update adds a profile preference and a recommendation table automatically, without deleting existing ratings or accounts. Take a database backup before updating as usual.
