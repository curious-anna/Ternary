# Recreate Excel - Full Stack Converter

A small full-stack app (frontend + backend) to convert Excel-style input into a pseudocode function.

## Features
- Frontend input field for Excel-like formula text
- Backend parse/convert logic in Node/Express
- Supports `IF`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `MIN`, `MAX`, `AND`, `OR`
- `ROUND(value, X)` is integer step-based (nearest X via remainder rule), not decimal-place rounding.
- Supports Excel operators `=`, `==`, `<`, `>`, `<=`, `>=`, `<>`, `&&`, `||`
- Outputs pseudocode expression only (no function wrapper): `condition ? true_result : false_result`

## Run locally
1. `npm install`
2. `npm start`
3. Open `http://localhost:3010`

## Deploy on Render
This repo is ready for Render Web Service deployment.

Option 1: Blueprint deploy (recommended)
1. Push this repo to GitHub.
2. In Render, click `New +` -> `Blueprint`.
3. Select this repository.
4. Render will use `render.yaml` automatically:
  - Build: `npm install`
  - Start: `npm start`
  - Health check: `/healthz`

Option 2: Manual Web Service
1. In Render, click `New +` -> `Web Service`.
2. Connect this repository.
3. Set:
  - Runtime: `Node`
  - Build Command: `npm install`
  - Start Command: `npm start`
4. (Optional) Set Health Check Path to `/healthz`.

Notes:
- The server listens on `process.env.PORT` (required by Render).
- Static frontend files are served from `public/`.

## Usage
- Enter formulas like:
  - `=IF(A > 10 && B <= 20, ROUND(C/2,0), MAX(D, E))`
  - `IF(AND(X >= 5, Y < 5), MIN(A, B), MAX(A, B))`
  - `MAX(5, 8)`
  - `($gpa > 3 || $act > 5, 500, 800)` (shorthand IF-style: condition, true, false)
- Click Convert
- Output is readable pseudocode expression