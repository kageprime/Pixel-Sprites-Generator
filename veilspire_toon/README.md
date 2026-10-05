# Veilspire toon sprites

Run from `veilspire_iso/`. Needs Python 3 with Pillow and numpy.

## Generate
    python3 gen_toon.py OUT --res 2 --pitches          # smooth anime, 192/256px cells (needs the engine patch)
    python3 gen_toon.py OUT --res 1 --style pixel --pitches   # anime pixel, 96/128px cells (drop-in)
    python3 gen_toon.py OUT --res 2 ren_calder --anims air1,jump   # one character / some sheets
Add --force to overwrite existing sheets. Output: OUT/<char>/<anim>.png, OUT/<char>/p16|p38/<anim>.png
(same layout as before), plus shadows. About 20 min per full run on one core.

## Changes
- gen_toon.py: new renderer. Look per character is in the TOON table (skin, hair, hairstyle, eyes).
- gen_iso.py: new AIR (aerial slash) and JUMP leg tables. New pose keys `ls` (leg splay) and `asp` (arm splay); the old renderer ignores them. Original saved as gen_iso.py.orig.
- source/combat.src.html: drawEnt and the portrait sprite() now handle 2x sheets. Original saved as .orig. Rebuild with source/build.py.

## Fixed since the first zip
- Lying poses (death/knockdown/getup) sank below the cell: the floor offset assumed the old taller rig. It now uses the real pelvis height, and every frame is clamped so nothing can touch or be clipped by the cell edge. Checked 6,912 frames (12 characters x 3 pitches x 8 poses x 4 facings): none clipped.
- The CLI was tested end to end on Bram (2x, with pitches).

## Not verified
- I haven't run the game with the new sheets or the engine patch (the JS only passes a syntax check).
- 2x sheets are large (about 230 MB for everything), so the single-file combat.html will be much bigger than 12 MB.
