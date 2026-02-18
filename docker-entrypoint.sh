#!/bin/bash
set -e

# Set up cgroup v2 delegation so ash-server can create per-sandbox cgroups.
# Inside Docker, the container sees its own cgroup namespace as root.
# We must move ALL processes (including tini/--init PID 1) out of root
# before we can enable subtree controllers.

if [ -d /sys/fs/cgroup ] && [ -w /sys/fs/cgroup ]; then
  # Create a leaf cgroup for the server process tree
  mkdir -p /sys/fs/cgroup/server

  # Move every process out of root cgroup (required before enabling controllers)
  for pid in $(cat /sys/fs/cgroup/cgroup.procs 2>/dev/null); do
    echo "$pid" > /sys/fs/cgroup/server/cgroup.procs 2>/dev/null || true
  done

  # Root cgroup is now empty — enable memory, cpu, pids controllers
  echo "+memory +cpu +pids" > /sys/fs/cgroup/cgroup.subtree_control 2>/dev/null || true

  # Create sandbox parent and enable controllers there too
  mkdir -p /sys/fs/cgroup/ash
  echo "+memory +cpu +pids" > /sys/fs/cgroup/ash/cgroup.subtree_control 2>/dev/null || true

  echo "[entrypoint] cgroup v2 delegation configured"
else
  echo "[entrypoint] cgroup v2 not available, using ulimit fallback"
fi

exec "$@"
