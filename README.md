Go-Tegs horizontal overflow fix

Replace only:
- assets/css/style.css
- assets/css/home.css

Root cause found by mobile diagnostic:
- viewport clientWidth: 403px
- document scrollWidth: 408px
- cta-orbit extends beyond the viewport by design (58.5px each side) and the public mobile nav overlay also reaches the layout viewport edge.

Fix:
- clip root horizontal overflow so fixed overlays cannot create a 5px horizontal scroll strip.
- constrain the decorative CTA orbit on small screens so it cannot expand beyond its section.
