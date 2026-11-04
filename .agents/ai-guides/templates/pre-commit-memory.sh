#!/bin/bash
# ai-guides: auto-staging de memórias antes do commit
if [ -f "./.claude/sync-claude-memory.sh" ]; then
  ./.claude/sync-claude-memory.sh pull >/dev/null 2>&1 || true
fi
if [ -f "./.gemini/sync-memory.sh" ]; then
  ./.gemini/sync-memory.sh pull >/dev/null 2>&1 || true
fi
