#!/usr/bin/env python3
"""BFS solver for the Forest Ruins sokoban levels.

Rules: one step at a time, at most one stone pushed per move,
no pulling, walls impassable. Exit passable only as a goal cell.
"""
import json
from collections import deque
import sys

DIRS = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}


def parse(grid):
    walls, stones, targets = set(), set(), set()
    player = exit_pos = None
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            if ch == "#":
                walls.add((r, c))
            elif ch == "S":
                stones.add((r, c))
            elif ch == "T":
                targets.add((r, c))
            elif ch == "P":
                player = (r, c)
            elif ch == "E":
                exit_pos = (r, c)
    return walls, frozenset(stones), frozenset(targets), player, exit_pos


def solve(grid, max_states=4000000):
    walls, stones, targets, start, exit_pos = parse(grid)
    h, w = len(grid), len(grid[0])
    if len(stones) != len(targets):
        return None, f"stone/target mismatch: {len(stones)} vs {len(targets)}"

    def solved(stones, pos):
        return pos == exit_pos and targets <= stones

    # The exit gate is sealed until every rune plate is lit.
    gate_open = targets <= stones
    q = deque([(start, stones, "")])
    seen = {(start, stones)}
    while q:
        pos, stones, path = q.popleft()
        if solved(stones, pos):
            return path, f"{len(seen)} states"
        if len(seen) > max_states:
            return None, "state limit reached"
        r, c = pos
        for name, (dr, dc) in DIRS.items():
            nr, nc = r + dr, c + dc
            if not (0 <= nr < h and 0 <= nc < w) or (nr, nc) in walls:
                continue
            if (nr, nc) == exit_pos and not targets <= stones:
                continue
            ns = stones
            if (nr, nc) in stones:
                br, bc = nr + dr, nc + dc
                if not (0 <= br < h and 0 <= bc < w):
                    continue
                if (br, bc) in walls or (br, bc) in stones or (br, bc) == exit_pos:
                    continue
                ns = frozenset((stones - {(nr, nc)}) | {(br, bc)})
            state = ((nr, nc), ns)
            if state in seen:
                continue
            seen.add(state)
            q.append(((nr, nc), ns, path + name))
    return None, f"unsolvable ({len(seen)} states)"


def replay(grid, path):
    walls, stones, targets, player, exit_pos = parse(grid)
    stones = set(stones)
    for i, mv in enumerate(path, 1):
        dr, dc = DIRS[mv]
        r, c = player
        nr, nc = r + dr, c + dc
        assert (nr, nc) not in walls, f"wall at step {i}"
        assert (nr, nc) != exit_pos or targets <= stones, f"sealed gate at step {i}"
        if (nr, nc) in stones:
            br, bc = nr + dr, nc + dc
            assert (br, bc) not in walls, f"wall push at step {i}"
            assert (br, bc) not in stones, f"double push at step {i}"
            stones.remove((nr, nc))
            stones.add((br, bc))
        player = (nr, nc)
    assert player == exit_pos, "player not at exit"
    assert targets <= stones, "not all targets covered"
    return True


if __name__ == "__main__":
    levels = json.load(open("tools/levels.json"))
    for i, lv in enumerate(levels, 1):
        path, info = solve(lv["grid"])
        print(f"{i}. {lv['name']}: {info}")
        if path:
            print(f"   moves={len(path)}")
            print(f"   {path}")
            print("   replay:", replay(lv["grid"], path))
        else:
            print("   FAILED")
