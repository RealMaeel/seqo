# SEQO community server — setup

This folder is the server that SEQO 3.0 uploads community data to. It runs on your free Cloudflare
account. You set it up once, in about 10 minutes, from a Command Prompt on your PC.

**What you need:** your Cloudflare account (step 1 is already done) and Node.js, which is already
installed because the SEQO test launchers use it. Nothing else to install: `npx` fetches Cloudflare's
`wrangler` tool the first time.

## 1. Open a Command Prompt in this folder

```
cd /d C:\test_seqo\_server
```

## 2. Sign in to Cloudflare

```
npx wrangler@latest login
```

Answer **y** if it asks to install wrangler. Your browser opens and Cloudflare asks to let Wrangler
use your account: click **Allow**. The Command Prompt then says you're logged in. Your login stays on
your PC; nobody else, including Claude, ever sees it.

## 3. Put the server online

```
npx wrangler@latest deploy
```

The first time, it creates the database (`seqo-community`) and the storage for the compiled file,
writes their ids into `wrangler.jsonc`, and uploads the server. If it asks a question, take the
default (just press Enter). At the end it prints the server's address, like

```
https://seqo-community.seqo.workers.dev
```

Copy that address into a new file in this folder called **server-url.txt** (one line, nothing else).

## 4. Set your admin key

The admin key lets you read the raw uploads, build the compiled file and block an install that sends
bad data. Make a long random password with your password manager (30+ characters) and save it there.

```
npx wrangler@latest secret put ADMIN_KEY
```

Paste the password when it asks; nothing shows on screen while you paste, which is normal. Then put
the same password in a new file in this folder called **admin-key.txt** (one line). That file is only
on your PC; don't send it to anyone, Claude included.

## 5. Check it works

Open `<your address>/v1/health` in your browser. It should show `{"ok":true,"schema":1}`.

Then, in the Command Prompt:

```
node tools\compile.cjs --dry
```

It should say `read 0 batches` and `0 installs, 0 records`: the server answers, your admin key
works, and nothing has been uploaded yet.

---

## Later: building the compiled file

Once SEQO is uploading, run this to add everything up and publish the file every SEQO downloads:

```
node tools\compile.cjs
```

Or let Windows run it every hour (no window pops up; each run is added to compile-log.txt):

```
schtasks /Create /TN "SEQO community compile" /SC HOURLY /MO 3 /TR "wscript.exe C:\test_seqo\_server\compile-hidden.vbs" /F
```

It runs while you are signed in to Windows. To run it once now: `schtasks /Run /TN "SEQO community compile"`.
To remove it: `schtasks /Delete /TN "SEQO community compile" /F`. When more players share, the same job can move
to a scheduled GitHub Action so it runs even while your PC is off.

## Admin, if bad data ever shows up

Use the admin key from admin-key.txt in place of `<key>` (curl comes with Windows):

```
curl -H "Authorization: Bearer <key>" <address>/v1/admin/stats
curl -X POST -H "Authorization: Bearer <key>" -H "content-type: application/json" -d "{\"install\":\"<id>\"}" <address>/v1/admin/ignore
curl -X DELETE -H "Authorization: Bearer <key>" "<address>/v1/admin/install?id=<id>"
```

`stats` lists every install (a random ID, not linked to a character) with how much it sent;
`ignore` quietly drops everything that install sends from then on; `install?id=` deletes what it
already sent. Run `node tools\compile.cjs` afterwards to rebuild the file.

## What the server keeps

Only the game records SEQO sends (kills, drops, faction hits, quest turn-ins, NPC dialog, tasks, mob
details) and the random install ID. No IP addresses, names or anything else about the sender, and
request logging is off (`observability` in wrangler.jsonc).

## Free plan limits

100,000 requests a day, 10 ms of CPU per request, 100,000 database row writes a day. Each upload is
one row, so even every SEQO player uploading stays far below that. The adding-up runs on your PC (or
GitHub) because 10 ms of CPU is too little for it.
