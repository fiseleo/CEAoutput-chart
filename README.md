# CEAoutput-chart

Turn a NASA CEA `output.txt` into interactive charts, ready to host on GitHub Pages.

## Files

- `index.html` — the chart viewer (Plotly, dark theme)
- `ceaparse.js` — generic CEA output parser (no dependencies)
- `output.txt` — optional sample file that auto-loads next to the page

## Use

1. Put `index.html`, `ceaparse.js` and your CEA `output.txt` in a folder.
2. Open `index.html` (or upload the folder to GitHub Pages).

You can also load any other CEA output by dropping the `.txt` onto the page
or clicking the file picker — no rebuild needed.

### Charts

- Specific impulse, chamber/throat temperature, C\*, molecular weight vs O/F (one line per pressure)
- Mass fractions vs O/F (pick a pressure)
- A pressure × O/F performance map

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
