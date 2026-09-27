# Gear regression tests

Open `gear-regression.html` in the deployed GitHub Pages site (or through any local static server).

The page automatically runs a browser-level matrix covering:

- 8T/8T half-tooth phase alignment,
- Bush/gear physical collision rejection,
- multi-neighbor tooth-phase conflicts,
- vertical-spacing false-positive prevention,
- shared axle angle and velocity for stacked gears,
- consistent and inconsistent ratio cycles,
- all configured gear pairs whose pitch-center distance lands on an integer Technic hole spacing,
- non-integer gear pairs checked against the nearest hole spacing to prevent false mesh classification.

No package manager, build step, or test framework is required.
