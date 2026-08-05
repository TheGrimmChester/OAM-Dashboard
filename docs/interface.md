# Interface

Everything visual comes from `@open-family/ui`: the tokens, the app shell, and
every component. `src/index.css` holds only app-local rules, and no raw pixel or
hex value for anything the kit owns.

## Product accent

OAM is the family's sixth product, accent **bronze** (`#7f5c16` light,
`#b68201` dark). The five existing accents are not five brand colours: they sit on
one OKLCH lightness with hues 158/198/236/274/322, and the kit's own token tests
enforce that as a family invariant — white-on-accent ≥ 4.5:1, accent on the dark
surface ≥ 3:1, and a light-contrast spread under 1.5 across all products. Bronze
(hue 80) is the first hue that keeps all twelve ramp steps inside the sRGB gamut
while holding chroma in that band.

## Information architecture

A pinned Overview, then **Directory**, **Configuration**, **Administration** —
the family skeleton, with Administration last. Configuration leads with Agents &
Models because it is the reason the product exists.

`nav.test.js` asserts one glyph per destination. The collapsed rail is icon-only,
so a shared glyph makes two rows indistinguishable — a navigation bug invisible in
the expanded state where the label carries the meaning.

## The inherited-value indicator

`src/utils/inheritance.js` is pure and tested, because the distinction between
"configured here" and "inherited from above" is the page's entire job and a UI
that gets it backwards tells an operator they have set something they have not.

| Source | Shown as | Offers |
|---|---|---|
| `task_override` | Set on this task | Edit |
| `user` | Your override | Edit, Reset |
| `org` | Organisation | Edit, Reset (when editing org) |
| `product_default` | Inherited — product default | Set |
| `family_default` | Inherited — family default | Set |
| anything else | Unrecognised layer | Set |

Two details that are load-bearing:

- **`inherited` is relative to the editing scope.** An org binding is *owned* when
  editing org config and *inherited* when a user decides whether to set a personal
  override. Getting this wrong puts "Reset" on a row with nothing to reset.
- **An unknown source is reported, not blanked.** A newer OAM reporting a layer
  this build does not know renders as "Unrecognised layer" — an empty cell would
  read as "nothing is configured" on a row that is resolving fine.

## The endpoint order

`AI Endpoints` renders the failover order as the table order, because that *is*
the policy. Two things it says explicitly rather than leaving to be inferred:

- Your own endpoints are tried before the organisation's regardless of their
  numbers — a personal account is an override of the shared one, not a peer in one
  merged list.
- A job receives only the first few endpoints (three by default), so one job never
  holds more credentials than it needs.

## Table states

`loading`, `error` and "loaded and genuinely empty" are always distinct. An empty
credential table drawn while a request is in flight, or after it failed, reads as
"your keys are gone".

Every empty state says what is absent *and why it might be*, because on this
console "no credentials" has three very different causes: none stored, none
visible at your scope, or a service that could not answer.
