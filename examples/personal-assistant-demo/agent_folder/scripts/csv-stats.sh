#!/bin/bash
# Quick statistics on a CSV file
# Usage: ./scripts/csv-stats.sh <file.csv>

set -euo pipefail

file="${1:?Usage: csv-stats.sh <file.csv>}"

python3 -c "
import csv, sys, statistics

with open('$file', 'r') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

if not rows:
    print('Empty CSV file')
    sys.exit(0)

cols = list(rows[0].keys())
print(f'Rows: {len(rows)}')
print(f'Columns: {len(cols)}')
print(f'Column names: {\", \".join(cols)}')
print()

for col in cols:
    vals = [r[col] for r in rows if r[col].strip()]
    # Try numeric stats
    try:
        nums = [float(v.replace(',', '')) for v in vals]
        print(f'{col} (numeric):')
        print(f'  min={min(nums):.2f}  max={max(nums):.2f}  mean={statistics.mean(nums):.2f}  median={statistics.median(nums):.2f}')
    except (ValueError, TypeError):
        unique = len(set(vals))
        print(f'{col} (text):')
        print(f'  {len(vals)} values, {unique} unique')
        if unique <= 10:
            from collections import Counter
            top = Counter(vals).most_common(5)
            print(f'  top: {\", \".join(f\"{v} ({c})\" for v, c in top)}')
    print()
"
