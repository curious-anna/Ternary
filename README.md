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
3. Open `http://localhost:3000`

## Usage
- Enter formulas like:
  - `=IF(A > 10 && B <= 20, ROUND(C/2,0), MAX(D, E))`
  - `IF(AND(X >= 5, Y < 5), MIN(A, B), MAX(A, B))`
  - `MAX(5, 8)`
  - `($gpa > 3 || $act > 5, 500, 800)` (shorthand IF-style: condition, true, false)
- Click Convert
- Output is readable pseudocode expression