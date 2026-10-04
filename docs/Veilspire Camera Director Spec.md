# Veilspire Camera Director Spec

Oct 4, 2026 · @kage · updated Oct 5, 2026 to match the shipped build

## Goal and scope

Build an Auto camera for `combat.html` that cuts between the eight 45° view angles on combat beats, so fights feel directed, while controls stay predictable and the player can switch it off.

**In scope**

- A camera director that decides when to cut and to which angle.
- Beat triggers (launcher, plunge impact, knockdown, and similar) with a shot preset for each.
- A readability check so a cut never hides the fight.
- An input latch so a cut never changes where the player is heading mid-run.
- An Auto/Manual setting, a manual override, and a debug overlay.
- Added after the first draft: short hero-shot pitch changes, an optional Immersive chase camera, and all twelve fighters.

**Out of scope for this pass**

- Free-look or camera angles other than the eight 45° steps (the sprites only exist for eight facings).
- Bespoke per-attack cinematics and finisher cutscenes (listed as a later phase).

The full spec is in `Veilspire Camera Director Spec.html`. Acceptance results: 15 pass, 3 warn, 0 fail (`source/test_director.js`).
