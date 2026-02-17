# Theme Changelog

## 2026-02-13: Warm palette update (marketing alignment)

Shifted from cool blue-gray backgrounds to warm brown-amber backgrounds
to match the sorcerer.sh marketing page aesthetic.

### To revert: replace the `:root` block in `index.css` with the values below.

```css
/* ORIGINAL cool blue-gray theme */
:root {
  --bg-root:       #111114;
  --bg-sidebar:    #18181c;
  --bg-titlebar:   #111114;
  --bg-hover:      #232329;
  --bg-active:     #2a2a32;
  --bg-elevated:   #28282f;
  --terminal-bg:   #111114;
  --border-subtle:  #2a2a32;
  --border-medium:  #353540;
  --text-primary:   #e8e6e3;
  --text-secondary: #9b9a97;
  --text-tertiary:  #6b6a68;
  --text-muted:     #4a4a4f;
  --accent:         #e2a445;
  --accent-dim:     #c48a2a;
  --accent-glow:    rgba(226, 164, 69, 0.12);
  --accent-glow-strong: rgba(226, 164, 69, 0.22);
  --status-active:   #5ec269;
  --status-idle:     #e2a445;
  --status-archived: #6b6a68;
  --status-waiting:  #5ba4e6;
  --danger:          #e25555;
}
```

### What changed

| Token              | Before (cool)               | After (warm)                  |
|--------------------|----------------------------|-------------------------------|
| --bg-root          | #111114                    | #0f0e0c                      |
| --bg-sidebar       | #18181c                    | #0b0a08 (darkest surface)    |
| --bg-titlebar      | #111114                    | #1a1714 (lightest surface)   |
| --bg-hover         | #232329                    | #231f19                      |
| --bg-active        | #2a2a32                    | #2a261e                      |
| --bg-elevated      | #28282f                    | #282420                      |
| --terminal-bg      | #111114                    | #0f0e0c                      |
| --border-subtle    | #2a2a32                    | #2a261e                      |
| --border-medium    | #353540                    | #3a342a                      |
| --text-primary     | #e8e6e3                    | #ede6d8                      |
| --text-secondary   | #9b9a97                    | #a69e8e                      |
| --text-tertiary    | #6b6a68                    | #6b6355                      |
| --text-muted       | #4a4a4f                    | #4a4540                      |
| --accent           | #e2a445                    | #e2a445 (unchanged)          |
| --accent-dim       | #c48a2a                    | #c48a2a (unchanged)          |
| --status-active    | #5ec269                    | #5ec269 (unchanged)          |
