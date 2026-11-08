# FGO in-game UI reference (2026-11-08)

Notes from real in-game screenshots, for making FGO Planner feel like FGO. These describe the game's visual language; the app should echo it with original drawing, not copy the game's assets (no ripped textures, frames or logos). Servant and class art comes from Atlas Academy.

Screenshots studied (kept outside the repo; links below):
- Party Formation: Fandom `PartyOptions.jpg` (Formation page), Support Edit `FGO_Edit_Menu.jpg`.
- Battle: official US site how-to (`fate-go.us/howto/system.html`, `system_01`–`05`), a 2023 modern battle screenshot (Level Winner beginner's guide).
- Background research: Fontworks interview with FGO's graphic director (fonts, "transparency"), and a 2019 color-preference study of FGO's UI.

## The big correction

Menus are **bright**, not dark. The menu frame is a pale icy blue → cyan gradient with faceted, crystal-like light shards. Dark is used only for (a) translucent navy dialog panels and (b) battle, where the UI floats over scene art. The earlier "dark navy + gold" direction read as fantasy, not FGO.

## Menu screens (Formation, Support, lists)

- **Frame:** icy blue-white background with geometric crystalline facets; content sits on white/silver panels with thin blue edges.
- **Top bar:** a white, angled "Back" tab at top-left with a blue diamond arrow. Centered section title in a serif ("PARTY III", "SUPPORT SET III") flanked by thin arrow ornaments, with pager dots below. Top-right: a very large brush-calligraphy Japanese title with a tiny, widely letter-spaced English subtitle ("F o r m a t i o n", "S u p p o r t").
- **Dialogs:** translucent navy-to-blue gradient panel, light line under the title, white text, highlighted values in yellow. A tiny letter-spaced caption under the buttons ("c o n f i r m a t i o n").
- **Buttons:** white-to-silver bevelled pills with dark text (secondary). The primary action is a big rounded pill at bottom-right ("Quest Start", "Decide") with a glowing double cyan outline and a chevron.
- **Bottom toolbar:** square colored tiles (blue, magenta, yellow) with bold white two-line labels; set selectors in bordered groups (blue for normal quests, red for event quests).
- **Servant card (portrait, tall):** gold diamond class emblem top-left with the class name in caps underneath, a "LEADER" ribbon, rarity stars; a dark stat strip at the bottom with Lv, HP, ATK, COST, and skill levels shown as "7/5/10".
- **Totals:** "TOTAL COST 49/111" as small caps label over big bold numbers.

## Battle screens

- Class shown as a **gold diamond badge** with the class name in caps beneath ("CASTER", "LANCER").
- HP and NP as **thin bars with chevron end caps** (`<< … >>`), value right-aligned above; NP bar fills orange/gold, HP blue (red for enemies).
- Info box top-right on translucent dark: light-blue caps labels ("BATTLE", "ENEMY", "TURN") with white values ("2/2", "Remaining: 1", "12 Turn(s)").
- Enemy NP "Charge" as a row of chevrons.
- **Command cards:** tall portrait cards in a colored frame, with huge gold metallic **serif** lettering ("Buster", "Arts", "Quick", "Extra Attack") over a color splash (red burst, blue cross, green ring); critical % in gold with a star above.
- Chain banners ("Brave CHAIN", "Extra Attack Gained!") in gold metallic serif with horizontal light streaks.

## Type

- Display and card names: bold, high-contrast **serif** (Latin) and Mincho (Japanese), often with a metallic gold fill.
- Labels and buttons: bold **condensed** sans in caps.
- English subtitles: thin, widely letter-spaced caps used as decoration.

## What to take into FGO Planner

1. Light icy-blue app frame with faceted background; white/silver panels; navy translucent panels only for dialogs and the "battle-like" results view.
2. Angled Back tab, centered serif section titles with arrow ornaments, big calligraphic page titles with spaced English subtitles.
3. Silver pill secondary buttons, glowing cyan primary pill bottom-right.
4. Tall Saint Graph cards in the Servants area (class diamond, stars, stat strip); chevron-capped HP/NP bars and gold serif card names in composition results.
5. Motion where the game moves: cards sliding in, chain banners with light streaks, gauges filling.
