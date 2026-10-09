# 0.2.0 本地验收记录

本版本以 `a9396b0` 为基础，在隔离 checkout 中完成共享 SVG 运行时重构。保留原开发目录的未提交修改；本地备份、调试构建、日志和渲染截图随交接提供，不进入源码提交。尚未正式发布或部署。

## 资产与改动

用户提供的 `Downloads\pig-vector-source.zip` 已复制到任务 `handoff` 目录并实际解压、读取和渲染。ZIP SHA-256 为 `8BCD37AB051C335C93C25E48F1EA9C79C54EB9A41180C25776D62C7CCCC2FD7A`。交接信息标注 Library 版本 2、原型页面 03、commit `7221c52640989794d36c6540122a6c626e217191`；该 commit 来自交接信息，ZIP 本身未包含 Git 历史。

`frontend/src/pet/pig.svg` 与交接包一致，SHA-256 为 `D1D1ED9166785A0991F21D2131964C9473212D6F13DCFF6E4534978510975816`。保留圆头腿根、身体遮挡远侧腿、前后腿收在侧面的睡姿和自然接地的腹部。原型演示页控件没有进入桌面浮窗。

主要文件如下；完整设计见 [ARCHITECTURE.md](ARCHITECTURE.md)。

| 范围 | 改动文件 |
| --- | --- |
| 共享核心 | `frontend/src/pet/{types,behavior,motion,renderer,runtime,move-queue}.ts`、`pig.svg` |
| 宿主及入口 | `frontend/src/hosts/{tauri,android,browser}.ts`、`main.ts`、`overlay.ts`、`launcher.ts`、`styles.css` |
| 桌面原生层 | `src-tauri/src/{lib,anchor,overlay}.rs`、`capabilities/default.json` |
| Android 原生层 | `OverlayController.kt`、`OverlayPlugin.kt`、`app/build.gradle.kts` |
| 构建与依赖 | `package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock`、`tauri.conf.json`、`vite.config.ts`、`scripts/sync-overlay.mjs`、`.gitignore`、`NOTICE.txt` |
| 验证与说明 | `tests/core.test.mjs`、`OverlayRuntimeTest.kt`、README、`docs/` |

既有 Windows 媒体监测和窗口顶端睡眠吸附是此次产品行为的必要部分，已适配共享运行时。旧 Phaser 依赖、Android 六张精灵表和重复 Rust/JNI 状态机已退出运行路径。原来的未提交实现保留在原开发目录和本地交接备份。旧 root PNG 未打包到新应用，供历史资料保留。没有包含 IDE 配置、签名秘密、本机构建产物或无关归档文件变动。

## 检查结果

下表记录重构分支使用 npm 时的历史验收。当前构建命令已迁移到 Bun，迁移后的检查见文末。

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过，TypeScript 无错误 |
| `npm test` | 10/10 通过 |
| `npm run build` | 通过，桌面和 Android overlay 从同一源码生成 |
| `npm audit` | 0 个漏洞，使用兼容范围内的依赖修复 |
| `cargo test` | 通过；Rust 无单元测试，行为覆盖在共享 TypeScript 测试中 |
| `cargo clippy --all-targets -- -D warnings` | 通过 |
| Windows Tauri debug/no-bundle 构建 | 通过 |
| Android ARM64 与 x86_64 debug APK 构建 | 通过，0.2.0 / versionCode 2000 |
| Android 原生 WebView/浮窗集成测试 | 通过，`OK (1 test)`，11.858 秒 |
| `git diff --check` | 通过 |

核心测试覆盖睡眠/唤醒打断时姿态和速度连续、300 次意图切换、拖拽保持与排队、拖拽中的音乐事实、窗口顶端落地睡眠、转向/边界/不越过目标、DPR 逻辑速度、减少动态、移动请求合并/取消、无效 delta。

普通浏览器实际渲染并操作了 03 原型与新运行时：睡眠完整姿态、睡眠后 120ms 唤醒、暂停后 400ms SVG 属性完全冻结、暂停睡眠时拖拽恢复并转向、舞蹈变色、减少动态、80/120/240 尺寸和 360×740 视口。检查时未发现腿根矩形角、腹部下方堆叠睡眠腿或宿主错误。浏览器控制台无 warning/error；这不是实体移动浏览器验证。

Windows 可执行文件已在本机启动，真实 WebView 完成窗口/显示器/DPI 查询并报告 `Piggy frontend ready: SVG=1, state=Idle`。当前自动化环境无法操作 Windows 原生窗口，因此没有宣称托盘、系统媒体联动、原生拖拽及跨显示器切换完成手动验收。

Android APK 已在本任务创建的只读临时 Pixel_10a 模拟器中安装并运行成功；Android 17、x86_64、16 KB 内存页。集成测试通过了真实 Tauri 启动页权限查询 bridge、SVG 单实例、睡眠、暂停冻结、唤醒清除暂停、原生触摸拖拽、拖拽期间排队动作、舞蹈、减少动态、160dp/DPR 换算以及两轮隐藏/销毁/重建。测试中的触摸事件通过 Android View API 注入，不等同于实体手机手势测试。检查日志没有 AndroidRuntime、chromium 或 PigOverlay error。APK 解包确认包含 LICENSE、NOTICE、共享 pet.js/pet.css、ARM64 和 x86_64 原生库，不包含旧精灵表。

从真实 Android WebView 绘制结果导出的睡眠和舞蹈透明 PNG 已打开检查，并保存在本地交接报告中；完整动画也已在浏览器里实际查看。

## 构建位置与复现

任务 `build` 下提供以下文件，均为调试构建。没有生成正式发布安装包或使用 release 签名。Windows 需系统 WebView2；Android APK 包含 ARM64、x86_64，保留 debug symbols，因此约 232 MB。

| 文件 | SHA-256 |
| --- | --- |
| `MyDesktopPig-0.2.0-windows-debug.exe` | `ED31713FC717F8A4D6CBDD86C38B7304D2D1FF0601E5ECE7568925718A5C3701` |
| `MyDesktopPig-0.2.0-android-debug.apk` | `A665040AF3336AAD4679DBB9CBDABBD7ADEB92F8AF62C2DF93CBBF4F997F897B` |

证据：`build/windows-final.log`、`build/android-instrumentation.log`、`build/android-errors.log`、`build/qa-sleep.png`、`build/qa-dance.png`。源码仓库在独立 `checkout` 下，所有改动可用 Git 审阅。

```powershell
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
bun run tauri build --debug --no-bundle
bun run tauri android build --debug --target aarch64 x86_64 --apk --ci
```

Android 验证工具链为 JDK 21.0.8、SDK 36、NDK 27.0.12077973。构建前配置 `JAVA_HOME` 和 Android SDK 环境变量。

## Bun 迁移检查（2026-10-09）

项目使用 Bun 1.3.14 进行依赖安装、脚本执行和核心测试。`bun.lock` 从原 `package-lock.json` 迁移，逐项核对保留了 79 项依赖的锁定版本；仓库仅维护 `bun.lock`。Tauri 构建钩子、Gradle 前端任务及 Android Studio 的 Rust 构建回调均已改用 Bun。

| 检查 | 结果 |
| --- | --- |
| `bun install --frozen-lockfile` | 通过 |
| 隔离目录全新安装与核心测试 | 通过，未复用原 npm 的 `node_modules` |
| `bun run test` | 10/10 通过，使用 Bun 测试运行器 |
| `bun run build` | 通过，包括 TypeScript 检查、桌面资源及 Android overlay 生成 |
| `bun run dev --host 127.0.0.1` | 开发服务器启动成功 |
| `bun run tauri android android-studio-script --help` | Bun 正确转发 Android Studio 回调命令 |
| `bun run tauri build --debug --no-bundle` | Windows 调试构建通过，构建钩子使用 Bun |
| Gradle `buildSrc` 的 `compileKotlin --offline` | 通过，Android Studio 构建回调编译成功；保留既有 `project.exec` 弃用警告 |

以上检查不代表重新完成历史记录中的真机、模拟器或原生交互验收。

Android 集成测试在 Android 源工程目录执行 `:app:assembleUniversalDebugAndroidTest`，安装应用和测试 APK 后运行 `adb shell am instrument -w -e class com.shadow3.mydesktoppig.OverlayRuntimeTest com.shadow3.mydesktoppig.test/androidx.test.runner.AndroidJUnitRunner`。测试系统需事先授予本应用悬浮窗权限。此次只对临时模拟器授予权限，未连接或改动实体手机。

待真实设备/人工检查：Windows 系统音乐自动舞蹈、原生长按不松手、窗口顶端吸附睡眠、不同 DPI 显示器之间拖动；Android 真机权限页面往返、后台存活及厂商浮窗限制、实际媒体播放联动、屏幕旋转/锁屏恢复。当前未做长期 CPU/GPU/电量采样。运行时绘制上限为 30fps，并清理时钟、输入/媒体订阅、待移动请求和 WebView。

原开发目录的未提交修改没有被本次提交更改。旧 `pet.rs`、`RustPetBridge.kt` 实验已留在本地备份，不进入新运行时提交。
