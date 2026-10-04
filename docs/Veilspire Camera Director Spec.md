# Veilspire Camera Director Spec

Oct 4, 2026 · @kage

## Goal and scope

Build an Auto camera for `combat.html` that cuts between the eight 45° view angles on combat beats, so fights feel directed, while controls stay predictable and the player can switch it off.

**In scope**

- A camera director that decides when to cut and to which angle.
- Beat triggers (launcher, plunge impact, knockdown, and similar) with a shot preset for each.
- A readability check so a cut never hides the fight.
- An input latch so a cut never changes where the player is heading mid-run.
- An Auto/Manual setting, a manual override, and a debug overlay.

**Out of scope for this pass**

- Free-look or camera angles other than the eight 45° steps (the sprites only exist for eight facings).
- Bespoke per-attack cinematics and finisher cutscenes (listed as a later phase).
- Characters other than Bram and Cinder, until the others are wired into the page.
