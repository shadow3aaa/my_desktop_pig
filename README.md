# 小猪桌面宠物

<video src="https://github.com/user-attachments/assets/919a52a3-522c-47b9-bc15-3abf69efbbaf" controls muted playsinline width="360"></video>

一个简单的小猪桌面宠物，基于 Tauri。

小猪形象基于 Google 的 Noto Emoji（猪表情）素材改编。

来源：<https://github.com/googlefonts/noto-emoji>

Noto Emoji 的大多数 SVG/PNG 图像资源采用 Apache License 2.0 许可。本项目对相关素材进行了二次使用与改编。

## SVG 新版本 0.2.0

共享行为状态机、连续姿态动画与 SVG 渲染已替换精灵表运行时。架构与构建步骤见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，验证结果见 [docs/QA.md](docs/QA.md)。

## 开发与构建

使用 Bun 1.3.14（版本固定在 `package.json` 的 `packageManager` 中），依赖锁定在 `bun.lock`。安装方式见 [Bun 官方文档](https://bun.sh/docs/installation)。桌面开发还需 Rust 与 Tauri 对应平台的构建工具。

```powershell
bun install --frozen-lockfile
bun run dev
bun run test
bun run build
bun run tauri dev
```

`bunfig.toml` 让 Vite、TypeScript 和 Tauri CLI 默认使用 Bun 运行。桌面与 Android 的构建入口均调用同一套 Bun 脚本。
