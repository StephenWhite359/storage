# Storage

Track what is in each box in a storage unit. Every box wears a printed label
carrying a QR code and a distinct picture-and-name identifier, so you can spot a
box across the room and scan it to see its contents.

One Node process, one SQLite file, no build step.

## Quick start

```bash
npm install
cp .env.example .env      # set APP_PIN and COOKIE_SECRET
npm run dev
```

Open http://localhost:3000 and enter the passcode.

The database is created and seeded on first boot: 100 identifiers in a shuffled
draw order, the reserved **Not in Storage** identifier, its default box, and the
three starting tags.

## How it works

**Identifiers.** Each box is assigned one identifier — a glyph and a name — from
a pool of 100 that is shuffled once, at seed time, and then fixed. Adding a box
offers the next unassigned identifier; "New identifier" cycles through the next
twelve. The pool lives in `src/seed/identifiers.js`; swap the glyphs there for
images or a different set without touching anything else.

**Not in Storage** is a real box, not a null. It holds a reserved identifier that
the draw never hands out, and it behaves like any other box — it has an icon,
appears in the grid, counts its contents, and is a valid target for a move. It
differs only in having no physical counterpart: it cannot be printed and cannot
be deleted.

**QR codes are never stored.** Each box has a short code; its QR encodes
`BASE_URL/b/<code>` and is rendered on demand. Scanning opens the Items page
filtered to that box, reusing the same page and the same query layer as
everything else.

**Editing and deleting a box.** Each real tile on the Boxes page has an **Edit**
link. The edit page holds an optional **description** (up to 120 characters) and a
**Delete box** section. Deleting never deletes items: the confirmation shows how
many the box holds and asks where they should go, with Not in Storage preselected.
The move and the delete happen in one transaction, so a failure leaves every item
where it was. A deleted box's picture and name go back into the pool at their
original place in the draw order, and its printed label shows "not recognised"
if scanned.

**Existing databases upgrade themselves.** `schema.sql` only creates missing
tables, so columns added later (currently `boxes.description`) are applied by
`addMissingColumns()` in `src/db.js` on boot — additive and nullable, and safe to
run repeatedly. Take a backup first if you like, but nothing is rewritten.

## Printing labels

The print sheet is laid out for **Avery 15264** shipping labels — 4" x 3-1/3",
6 per US Letter sheet (the same template as 5164, 5264, 8164 and 55164).

On the Boxes page, click a box's card to select it (a checkmark badge shows what
is selected; the blue **View contents** button on each card opens its items), then
either:

- **Preview** opens the label sheet as a normal page (with the Items/Boxes
  navigation and a **Back to boxes** button) and prints nothing. Review it, then
  click **Print** on that page. (A single box's edit page has **Preview label**.)
- **Print QR** opens the same page and goes straight to the print dialog.

In the print dialog:

- **Scale: 100%** (not "Fit to page")
- **Margins: None**
- **Headers and footers: off** (Safari: "Print headers and footers")

Anything else shifts the grid and the labels will not line up. Tick **Print cut
guides** and run one page on plain paper first — hold it against a label sheet
to confirm alignment before committing a real sheet.

Each label carries the identifier glyph and name on the left, and the QR with its
code on the right. If the box has a description it prints small, under the name
(about five lines; anything longer is clipped). It is read when you print, so
editing a description does not change labels already printed. The QR keeps a
4-module quiet zone so it scans reliably even with the glyph alongside. The grid geometry lives in the print-sheet section of
`public/app.css`; the numbers there are the Avery template and should not be
rounded or "tidied".

## Backup

```bash
npm run backup                                   # against localhost
APP_URL=https://your-app.example.com npm run backup
```

Pulls a `VACUUM INTO` snapshot — consistent even while the app is in use — into
`backups/`, then keeps only the 3 most recent. `BACKUP_KEEP` changes how many.
There is also a **Download backup** link in the app footer for a one-off copy.

## Deploying to Railway

1. **Attach a volume mounted at `/data`** and set `DB_PATH=/data/storage.sqlite`.
   The container filesystem is ephemeral; without the volume the database is lost
   on every redeploy.
2. Set `APP_PIN`, `COOKIE_SECRET` (`openssl rand -hex 32`), `NODE_ENV=production`,
   and `BASE_URL`. Railway injects `PORT`; the server binds `0.0.0.0`.
3. **Decide `BASE_URL` before printing any labels.** The QR encodes an absolute
   URL and the labels go onto physical boxes — changing the domain later
   invalidates every label already printed. If a custom domain is at all likely,
   set it up first and use it from the start.
4. Keep it to a single instance. SQLite on a volume does not survive horizontal
   scaling.

## Notes

- `npm start` runs with `--max-old-space-size=64 --max-semi-space-size=2`. The
  second flag matters: without it V8 reserves roughly 140MB of young-generation
  heap it never uses, and resident memory plateaus near 300MB instead of ~90MB.
- To start over, stop the server and delete `data/storage.sqlite*`. The next boot
  reseeds, which reshuffles the draw order and invalidates printed labels.
