# CEAoutput-chart

Turn a NASA CEA `output.txt` (or a CEARUN rocket output) into interactive
charts, ready to host on GitHub Pages.

## Files

- `index.html` — the chart viewer (Plotly, dark theme)
- `ceaparse.js` — generic CEA output parser (no dependencies)
- `output.txt` — optional sample file that auto-loads next to the page

## Use

1. Put `index.html`, `ceaparse.js` and your CEA `output.txt` in a folder.
2. Open `index.html` (or upload the folder to GitHub Pages).

You can also load any other CEA output by dropping the `.txt` onto the page
or clicking the file picker — no rebuild needed.

## Features

- **Station selector** — Chamber, Throat, and every nozzle **exit** (pressure-ratio
  `pi/p`, subsonic `subar` and supersonic `supar` area-ratio exits) when the file
  is a multi-exit CEARUN rocket output. Exit stations are labelled by area ratio
  (Ae/At) and pressure ratio (Pc/Pe).
- **X-axis switch** — plot the line charts against O/F ratio, chamber pressure,
  or nozzle area ratio.
- **Data table** — sortable, with a search box to filter rows.
- **Compare datasets** — overlay multiple files; compare a metric vs O/F (with
  best-O/F markers) or the best O/F vs pressure.
- **Export** — CSV (data, summary) and raw parsed **JSON**.

### Charts

- Specific impulse, temperature, C\*, molecular weight, γ, sound velocity, CF
  and vacuum Isp vs O/F (or vs pressure / area ratio) — one line per pressure
- Mass fractions vs O/F (pick a pressure)
- A pressure × O/F performance map and a 3D surface
- Transport properties (viscosity, conductivity, Prandtl) when present

## Deploy to GitHub Pages

1. Create a repo and push these files (keep `output.txt` in the same folder as `index.html`).
2. Settings → Pages → Source: `main` branch, root folder → Save.
3. Visit `https://<user>.github.io/<repo>/`.

The page auto-loads `output.txt` from the same folder; to switch data just
replace that file (or drop a new one in the browser).

## Notes

- Requires an internet connection for the Plotly CDN.
- Works with `output short`, `output massf` and equilibrium rocket cases;
  frozen-composition cases are parsed too (performance params only).
- Also parses the CEARUN web-tool rocket format, which repeats each (Pin, O/F)
  across several blocks of exit columns.
