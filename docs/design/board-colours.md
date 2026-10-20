# Board colour sampling

The supplied 1536×1024 board was reduced to 180px wide and quantized to 16 colours with ImageMagick. The dominant swatches were used to tune semantic tokens rather than copied into component styles.

| Named region | Sampled swatch | Token use |
| --- | --- | --- |
| Dusk ground | `#0D0D18` | Dusk background |
| Dusk surface | `#161626` | Dusk surface |
| Dusk map/card blue | `#232749` | Dusk raised surface |
| Dusk muted teal | `#2A5054` | Texture only, not semantic text |
| Paper ground | `#F0E7D8` | Paper background |
| Paper surface | `#FAF3E9` | Paper surface |
| Paper border/shadow | `#E7DBCF` | Paper raised surface/border family |
| Warm ink | `#2C2633` | Supporting deep-ink reference |

Role colours retain the brief's accessible semantic values because the contact-sheet quantization merged small coloured UI regions into nearby scene pixels. Violet is reserved for the game boundary; teal and orange are never used as the primary action colour.
