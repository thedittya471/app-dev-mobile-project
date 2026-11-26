# CampusPulse

CampusPulse connects classroom attendance to the timetable and turns gaps between classes into a daily study plan. It uses Expo and React Native on the client, with Express, Drizzle, and PostgreSQL on the server.

## How it works

- **Teachers** select a dated class period and open check-in. The server captures the enrolled roster and issues a rotating QR code valid for 20 seconds. Authorized teachers can mark or correct records. Closing a session marks remaining pending students absent.
- **Students** check in with the QR scanner and see a confirmation after the server saves their attendance. If the camera is unavailable, a student can paste the active QR payload or ask the teacher to mark their attendance. Attendance history and subject percentages use closed sessions.
- **Classroom displays** show the QR and aggregate counts, refreshed about every three seconds while check-in is open. The projector uses the assigned teacher's account and omits individual student records.
- **Daily plans** combine the institution's dated timetable with free periods. Suggestions fit the available time and use the student's career goal, interests, and strengths when available.

Short-lived codes limit the time available to share a valid code. A QR check-in can still be submitted remotely if an enrolled student receives the active payload. Teachers can review questionable entries and correct the roster.

## Run locally

The development setup uses Docker Compose for PostgreSQL and separate terminals for the API and Expo. Start Docker Desktop before running the commands. Copy the environment examples into place for a fresh checkout. Keep existing local settings if you already have a configured environment.

```sh
npm ci
npm --prefix backend ci
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up -d --wait postgres
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
npm --prefix backend start
```

In a second terminal, run `npm run web` and open the address printed by Expo. The default API address is `http://localhost:3000`. Set `EXPO_PUBLIC_API_URL` to the API's reachable LAN address for a physical device on the same network. For browser camera access, use localhost or HTTPS.

If sign-in says the service is temporarily unavailable and the backend logs `ECONNREFUSED 127.0.0.1:5433`, start Docker Desktop and run `docker compose up -d --wait postgres` from the project root. Check `curl -f http://localhost:3000/health`, then reload the app. An already-running API can reconnect once PostgreSQL is healthy.

Use the following accounts with password `password123` on a local seeded database.

| Role | Email |
| --- | --- |
| Teachers | `teacher@pilot.edu`, `teacher2@pilot.edu` through `teacher4@pilot.edu` |
| Computer Science A | `student1@pilot.edu` through `student6@pilot.edu` |
| Computer Science B | `student7@pilot.edu` through `student12@pilot.edu` |
| Data Science A | `student13@pilot.edu` through `student18@pilot.edu` |
| Unenrolled student | `unrelated@pilot.edu` |

Sample classes span 11 calendar days centered on today in `Asia/Kolkata`. The preceding five days have completed attendance sessions with both present and absent records. Today's and future classes are ready for live check-in. The web and mobile timetable show Today and Tomorrow. The schedule API also accepts `date=YYYY-MM-DD` for the other seeded dates.

Set `EXPO_PUBLIC_SHOW_TEST_ACCOUNTS=true` and restart Expo if you want the quick sign-in buttons in development. Test sign-in still uses the server and database. Seed accounts are for local testing. Re-running the seed adds missing sample periods and preserves existing attendance and preferences.

To replace the local sample dataset, back up `attendance_pilot` first, then run `npm --prefix backend run db:seed -- --reset`. This deletes all application records, including sign-in sessions, and inserts fresh sample data in one transaction. Reload the app and sign in again after the reset.

## Verify

```sh
npm run lint
npm --prefix backend test
npx expo export --platform web
```

For a complete check-in, use separate browser profiles or a browser and a phone. Sign in as the teacher, open an assigned class session and its projector, then sign in as an enrolled student and scan or paste the active QR payload. Confirm the projected count increases, close the session, and check the student's attendance history.
