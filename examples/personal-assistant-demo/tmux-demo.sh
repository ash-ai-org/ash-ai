#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ASH HACKATHON DEMO — tmux layout
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Usage:  ./demo/hackathon/tmux-demo.sh
#
# ┌──────────────────────────┬───────────────────────┐
# │                          │                       │
# │   LEFT (60%)             │  TOP-RIGHT (40%)      │
# │   Type commands here     │  ash session tail     │
# │                          │                       │
# │                          ├───────────────────────┤
# │                          │  BOTTOM-RIGHT         │
# │                          │  Cue card             │
# └──────────────────────────┴───────────────────────┘
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SESSION="ash-demo"
CUE_CARD="/tmp/ash-demo-cuecard.txt"

# Kill existing session
tmux kill-session -t "$SESSION" 2>/dev/null

# Write the cue card
cat > "$CUE_CARD" << 'EOF'

  ━━━ ASH HACKATHON DEMO ━━━


  1. cat ~/Projects/demo-agent/CLAUDE.md

  2. ash deploy ~/Projects/demo-agent --name assistant

  3. ash session create assistant
     A=<paste-session-id>

  4. ash session tail $A
     (run in TAIL pane ↗)

  5. ash session send $A "Research the
     latest breakthroughs in space
     exploration. Create a 4-slide HTML
     presentation about it with a dark
     theme and generated images for each
     slide. Make it a single self-contained
     file. Save it as presentation.html"

  6. ash session files $A

  7. ash session exec $A \
       "cat presentation.html" \
       > /tmp/ash-demo-presentation.html
     open /tmp/ash-demo-presentation.html

  8. npx tsx demo/hackathon/demo-app.ts
     → http://localhost:3000

     Cloud:
     ASH_URL=https://api.ash.computer \
       npx tsx demo/hackathon/demo-app.ts

  9. ash session end $A

EOF

# Create tmux session — left pane (main)
tmux new-session -d -s "$SESSION" -x 200 -y 50 -c "$DIR"

# Split right 40%
tmux split-window -h -t "$SESSION" -p 40 -c "$DIR"

# Split the right pane: top for tail, bottom for cue card
tmux split-window -v -t "$SESSION:0.1" -p 50 -c "$DIR"

# Bottom-right: cue card
tmux send-keys -t "$SESSION:0.2" "less $CUE_CARD" Enter

# Top-right: ready for tail (clean prompt)
tmux send-keys -t "$SESSION:0.1" "clear" Enter

# Left: clean prompt
tmux send-keys -t "$SESSION:0.0" "clear" Enter

# Labels
tmux select-pane -t "$SESSION:0.0" -T "DEMO"
tmux select-pane -t "$SESSION:0.1" -T "TAIL"
tmux select-pane -t "$SESSION:0.2" -T "CUE CARD"

# Style
tmux set -t "$SESSION" pane-border-status top
tmux set -t "$SESSION" pane-border-format " #{pane_title} "
tmux set -t "$SESSION" status-style "bg=black,fg=white"
tmux set -t "$SESSION" status-left "#[fg=cyan,bold] ASH DEMO "
tmux set -t "$SESSION" status-right "#[fg=yellow] %H:%M "
tmux set -t "$SESSION" status-left-length 20

# Focus left pane
tmux select-pane -t "$SESSION:0.0"

# Attach
tmux attach -t "$SESSION"
