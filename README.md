# Ternary Expression Builder

A full-stack tool that converts standard function expressions (IF, MIN, MAX, ROUND, AND, OR) into pure nested ternary expressions. Built for workflows where the target expression language has no built-in functions, no control structures — only nested ternaries.

## Features
- Write expressions using standard functions: `IF`, `MIN`, `MAX`, `AND`, `OR`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`
- Converts them to strict ternary-only output: `condition ? true_result : false_result`
- Reverse mode: paste existing ternary code and get a plain-English breakdown
- Try-It evaluator: plug in variable values and trace the decision path
- Pattern detection: identifies MIN/MAX/ROUND/CLAMP patterns in ternary trees
- Lookup table extraction for tiered decision logic

## Run locally
1. `npm install`
2. `npm start`
3. Open `http://localhost:3010`

## Deploy 
This repo is currently deployed on firebase. 


## Usage
- Enter expressions using standard functions:
  - `IF(A > 10, 100, 0)`
  - `MIN(A, MAX(B, C))`
  - `IF(AND(X >= 5, Y < 5), MIN(A, B), MAX(A, B))`
  - `ROUND(MIN(A, MAX(B, 0)), 10)`
  - `($gpa > 3 OR $act > 5, 500, 800)` (shorthand IF-style: condition, true, false)
- Click Convert (or just type — live conversion is debounced)
- Copy the ternary output directly into your target system
