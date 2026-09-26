# AGENTS.md

先读 README.md 的「二次开发约定」。补充给 agent 的硬规则：

- 每个 agent 只改自己负责的 `src/films/<film>/partN.ts`、`src/films/<film>/partN/` 子目录和 `docs/shots/<film>-partN.md`。
  **不要改** `src/engine/`、`src/fx/`、`src/three/`、`src/theme.ts`、其他 part 文件；需要的通用能力先在自己的 part 目录里实现，并在镜头表末尾「建议上提到共享库」一节里写明。
- 每个镜头写完必须 `pnpm snap <film> <秒...>` 对照原片，并读图检查。
- `pnpm typecheck` 只需保证自己的文件无错（其他 agent 可能正在改别的文件）。
