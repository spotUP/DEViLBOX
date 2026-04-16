# Plan: Beat-Synced Scratches

## Problem
Scratch patterns sound off-beat and have pauses between cycles.

## Approach
1. Convert fixed-ms patterns to BPM-synced durationBeats
2. Phase-align pattern start to current beat position
3. Remove seek-back on pattern end — let music continue naturally
