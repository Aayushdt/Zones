# Design decisions

- Existing variable font packages are retained: Manrope remains UI/body type and JetBrains Mono remains restricted to codes and time/numeric UI. The brief's requested Inter is not added because an equivalent self-hosted variable UI font already exists in the project.
- A compact static contour SVG replaces a new d3/simplex build dependency. It is decorative, seeded by its committed paths, under 30 KB, and honours existing reduced-motion rules because it has no animation.
