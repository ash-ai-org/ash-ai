#!/usr/bin/env bash
# Ash CLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/ash-ai-org/ash-ai/main/install.sh | bash
#
# Installs the `ash` CLI globally via npm. If Node.js is not found,
# offers to install it via the appropriate package manager.

set -euo pipefail

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${BOLD}$*${NC}"; }
ok()    { echo -e "${GREEN}$*${NC}"; }
warn()  { echo -e "${YELLOW}$*${NC}"; }
error() { echo -e "${RED}$*${NC}" >&2; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

install_node() {
  info "Node.js not found. Installing..."

  if [[ "$(uname)" == "Darwin" ]]; then
    if command_exists brew; then
      info "Installing Node.js via Homebrew..."
      brew install node
    else
      error "Homebrew not found. Install Node.js manually: https://nodejs.org"
      exit 1
    fi
  elif [[ "$(uname)" == "Linux" ]]; then
    if command_exists apt-get; then
      info "Installing Node.js 20 via apt..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command_exists dnf; then
      info "Installing Node.js via dnf..."
      sudo dnf install -y nodejs
    elif command_exists yum; then
      info "Installing Node.js via yum..."
      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
      sudo yum install -y nodejs
    else
      error "No supported package manager found. Install Node.js manually: https://nodejs.org"
      exit 1
    fi
  else
    error "Unsupported OS: $(uname). Install Node.js manually: https://nodejs.org"
    exit 1
  fi
}

check_docker() {
  if ! command_exists docker; then
    warn "Docker is not installed. Ash requires Docker to run the server."
    warn "Install Docker: https://docs.docker.com/get-docker/"
    echo ""
  fi
}

main() {
  echo ""
  info "Installing Ash CLI..."
  echo ""

  # Check for Node.js
  if ! command_exists node; then
    install_node
  fi

  # Verify Node.js version
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_VERSION" -lt 20 ]]; then
    error "Node.js >= 20 required (found v$(node -v))"
    error "Update Node.js: https://nodejs.org"
    exit 1
  fi

  # Install the CLI
  info "Installing @ash-ai/cli..."
  npm install -g @ash-ai/cli

  echo ""
  ok "Ash CLI installed successfully!"
  echo ""

  # Verify
  if command_exists ash; then
    echo -e "  ${DIM}Version:${NC} $(ash --version)"
  fi

  # Check Docker
  check_docker

  # Print next steps
  info "Quick start:"
  echo ""
  echo "  export ANTHROPIC_API_KEY=sk-..."
  echo "  ash start"
  echo "  ash deploy ./my-agent --name my-agent"
  echo "  ash session create my-agent"
  echo ""
  echo -e "  ${DIM}Docs: https://github.com/ash-ai-org/ash-ai${NC}"
  echo ""
}

main
