# Tukosoko club sites

One server, many clubs. A club signs up at `tukosoko.com/start`, answers a short questionnaire, and gets a site at `theirclub.tukosoko.com` with news, fixtures, players, table, training, tickets, fundraising and a kit shop. Mathaithi United (`mathaithi.tukosoko.com`) is the first club on it.

## Run

    node server.js            # Node 22+, no npm packages
    node test.js              # end-to-end checks against a throwaway server

Local preview of any club: `http://localhost:3010/?team=<club id>`. Platform signup: `http://localhost:3010/start`.

## Files

- `server.js` auth, orders, database (JSON file in `data/`), static files, host routing
- `routes.js` signup, kits, club profile, CMS collections, inbox, donations, M-Pesa callback
- `kit.js` kit renderer and design limits (shared by fan site, designer and printer file)
- `signup.js` questionnaire validation and starter content (optional Claude polish if `ANTHROPIC_API_KEY` is set)
- `payments.js` M-Pesa STK push (Daraja)
- `start.html` platform landing and signup, `index.html` club site, `admin.html` club and platform console

## Money rules (edit in Super console, Store tab)

Fan price of a kit = platform base price + the club's mark-up (clamped to a range). The platform keeps a % of the mark-up. Delivery (Pickup Mtaani or parcel) is added on top and goes to the platform. All numbers are placeholders until you have the printer's real quote.

## Going live checklist

1. Run `server.js` behind nginx or Cloudflare. A static host will not work now.
2. DNS: `tukosoko.com` plus wildcard `*.tukosoko.com` to the server, with a wildcard TLS certificate.
3. Set `BASE_DOMAIN=tukosoko.com`.
4. Change the seeded passwords (`super`, `coach`, `rovers`, `stars`) before real use.
5. M-Pesa: set `MPESA_ENV`, `MPESA_KEY`, `MPESA_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_BASE`, `MPESA_CALLBACK_SECRET`. Test in the Daraja sandbox first. Without these the site runs in demo mode: orders are recorded, no money moves, and buyers are told so.
6. New clubs start unapproved. Approve them in Super console > Teams before their shop, tickets and giving open.
7. Back up `data/db.json`. An existing database is migrated automatically and a copy is saved as `db.json.pre-platform.bak`.
