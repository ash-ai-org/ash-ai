#!/usr/bin/env python3
"""Generate a chart from CSV data.

Usage: python3 scripts/chart.py <csv-file> <x-column> <y-column> <output.png> [--type bar|line|scatter]
"""

import csv
import sys

def main():
    if len(sys.argv) < 5:
        print("Usage: chart.py <csv-file> <x-col> <y-col> <output.png> [--type bar|line|scatter]")
        sys.exit(1)

    csv_file, x_col, y_col, output = sys.argv[1:5]
    chart_type = "line"
    if "--type" in sys.argv:
        chart_type = sys.argv[sys.argv.index("--type") + 1]

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "matplotlib", "-q"])
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

    with open(csv_file, "r") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    x_vals = [r[x_col] for r in rows]
    y_vals = [float(r[y_col].replace(",", "")) for r in rows]

    fig, ax = plt.subplots(figsize=(10, 6))

    if chart_type == "bar":
        ax.bar(x_vals, y_vals, color="#00d4ff")
    elif chart_type == "scatter":
        ax.scatter(x_vals, y_vals, color="#00d4ff")
    else:
        ax.plot(x_vals, y_vals, color="#00d4ff", linewidth=2, marker="o")

    ax.set_xlabel(x_col)
    ax.set_ylabel(y_col)
    ax.set_title(f"{y_col} by {x_col}")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    plt.savefig(output, dpi=150)
    print(f"Chart saved to {output}")

if __name__ == "__main__":
    main()
