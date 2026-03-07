---
name: analyze
description: Analyze data by writing and running Python scripts. Can generate sample data, process CSVs, compute statistics, and create charts.
use_when: User asks to analyze data, compute statistics, process a dataset, create charts, or do quantitative analysis
allowed-tools: Bash(./scripts/*), Bash(python3:*), Bash(pip:*), Read, Write
---

# Analyze

Run data analysis using Python scripts and the helper tools in `scripts/`.

## Process

1. Understand what data to analyze — use provided files or generate sample data
2. Use `./scripts/csv-stats.sh <file>` for quick CSV overview if applicable
3. Write a Python script for deeper analysis
4. Run the script and capture results
5. If charts are needed, use `./scripts/chart.py` or write matplotlib code
6. Save the full analysis to `analysis.md`
7. Print the key findings

## Available Tools

- `./scripts/csv-stats.sh <file>` — Quick row count, column names, basic stats
- `./scripts/chart.py <csv> <x-col> <y-col> <output.png>` — Generate a chart
- Python 3 with standard library (csv, json, math, statistics, etc.)
- Install packages with `pip install` if needed (pandas, matplotlib, numpy)
