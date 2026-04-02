# Ternary Expression Builder

A full-stack tool that converts standard function expressions (IF, MIN, MAX, ROUND, AND, OR) into pure nested ternary expressions. Built for workflows where the target expression language has no built-in functions, no control structures — only nested ternaries.

## Features
- Write expressions using standard functions: `IF`, `MIN`, `MAX`, `AND`, `OR`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`
- Backend converts them to strict ternary-only output: `condition ? true_result : false_result`
- Reverse mode: paste existing ternary code and get a plain-English breakdown
- Try-It evaluator: plug in variable values and trace the decision path
- Pattern detection: identifies MIN/MAX/ROUND/CLAMP patterns in ternary trees
- Lookup table extraction for tiered decision logic

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
- Enter expressions using standard functions:
  - `IF(A > 10, 100, 0)`
  - `MIN(A, MAX(B, C))`
  - `IF(AND(X >= 5, Y < 5), MIN(A, B), MAX(A, B))`
  - `ROUND(MIN(A, MAX(B, 0)), 10)`
  - `($gpa > 3 OR $act > 5, 500, 800)` (shorthand IF-style: condition, true, false)
- Click Convert (or just type — live conversion is debounced)
- Copy the ternary output directly into your target system