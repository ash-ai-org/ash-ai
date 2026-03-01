#!/usr/bin/env python3
"""
Example: Python bot using the Ash Python SDK.

Deploys an agent, creates a session with SDK parity options
(system_prompt, model, effort, max_turns), has a multi-turn
conversation with SSE streaming, then cleans up.

Usage:
    python bot.py
    ASH_SERVER_URL=http://remote:4100 python bot.py
"""

import os
import sys
from pathlib import Path

# Allow running from the repo without installing the SDK package
sdk_path = Path(__file__).resolve().parent.parent.parent / "packages" / "sdk-python"
sys.path.insert(0, str(sdk_path))

from ash_sdk import AshClient
from ash_sdk.streaming import MessageEvent, TextDeltaEvent, DoneEvent, ErrorEvent


def extract_text(data: dict) -> str:
    """Extract text content from an SDK assistant message."""
    if data.get("type") != "assistant":
        return ""
    content = data.get("message", {}).get("content", [])
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "") for block in content if block.get("type") == "text"
        )
    return ""


def main():
    server_url = os.environ.get("ASH_SERVER_URL", "http://localhost:4100")
    agent_dir = str(Path(__file__).resolve().parent / "agent")
    agent_name = "python-bot"

    client = AshClient(server_url)

    # Check server health
    print(f"Connecting to {server_url}...")
    try:
        health = client.health()
        print(f"Server status: {health['status']} (uptime: {health['uptime']}s)")
    except Exception as e:
        print(f"Error: Cannot reach server at {server_url}: {e}")
        sys.exit(1)

    # Deploy agent
    print(f"\nDeploying agent '{agent_name}' from {agent_dir}...")
    agent = client.deploy_agent(agent_name, agent_dir)
    print(f"Deployed: {agent.name} v{agent.version}")

    # Create session with SDK parity options
    print("\nCreating session with custom settings...")
    session = client.create_session(
        agent_name,
        system_prompt="You are a concise programming tutor. Answer in 2-3 sentences max.",
        permission_mode="bypassPermissions",
        allowed_tools=["Read", "Write", "Bash"],
    )
    print(f"Session: {session.id} (status: {session.status})")

    # Multi-turn conversation with per-message options
    questions = [
        "What is a closure in programming?",
        "Give me a one-line example in Python.",
        "Thanks! How about in JavaScript?",
    ]

    try:
        for i, question in enumerate(questions, 1):
            print(f"\n--- Turn {i} ---")
            print(f"You: {question}")
            print("Bot: ", end="", flush=True)

            for event in client.send_message_stream(
                session.id,
                question,
                max_turns=1,
            ):
                if isinstance(event, MessageEvent):
                    text = extract_text(event.data)
                    if text:
                        print(text, end="", flush=True)
                elif isinstance(event, TextDeltaEvent):
                    # Incremental text when include_partial_messages=True
                    pass
                elif isinstance(event, ErrorEvent):
                    print(f"\n[Error: {event.error}]")
                elif isinstance(event, DoneEvent):
                    print()  # newline after streamed response

    finally:
        # Clean up
        print("\nEnding session...")
        ended = client.end_session(session.id)
        print(f"Session ended (status: {ended.status})")

        print("Cleaning up agent...")
        client.delete_agent(agent_name)
        print("Done.")


if __name__ == "__main__":
    main()
