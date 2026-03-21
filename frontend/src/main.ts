import "./styles.css";

import Phaser from "phaser";
import { invoke } from "@tauri-apps/api/core";
import {
  LogicalSize,
  PhysicalPosition,
  currentMonitor,
  getCurrentWindow,
} from "@tauri-apps/api/window";

const root = document.getElementById("app");

if (!root) {
  throw new Error("app root not found");
}

root.className = "android-launcher";
root.innerHTML = `
  <section class="android-panel">
    <h1>正在启动小猪...</h1>
    <p class="android-status" data-role="status">正在识别运行平台。</p>
  </section>
`;

void bootstrap(root);

async function bootstrap(container: HTMLElement): Promise<void> {
  let platform = "desktop";

  try {
    platform = await invoke<string>("runtime_platform");
  } catch {
    if (/Android/i.test(navigator.userAgent)) {
      platform = "android";
    }
  }

  if (platform === "android") {
    await bootAndroidLauncher(container);
    return;
  }

  container.className = "pet-shell";
  container.innerHTML = "";
  bootDesktopPet();
}

async function bootAndroidLauncher(container: HTMLElement): Promise<void> {
  container.className = "android-launcher";
  container.innerHTML = `
    <section class="android-panel">
      <h1>小猪桌宠</h1>
      <p class="android-status" data-role="status">正在检查权限...</p>
      <div class="android-actions">
        <button type="button" data-action="request">申请悬浮窗权限</button>
        <button type="button" data-action="show">显示悬浮猪</button>
        <button type="button" data-action="hide">隐藏悬浮猪</button>
      </div>
    </section>
  `;

  const status = container.querySelector<HTMLElement>("[data-role=status]");
  const requestButton = container.querySelector<HTMLButtonElement>(
    "[data-action=request]",
  );
  const showButton = container.querySelector<HTMLButtonElement>(
    "[data-action=show]",
  );
  const hideButton = container.querySelector<HTMLButtonElement>(
    "[data-action=hide]",
  );

  if (!status || !requestButton || !showButton || !hideButton) {
    throw new Error("android launcher controls not found");
  }

  const refreshStatus = async (): Promise<void> => {
    try {
      const granted = await invoke<boolean>("overlay_permission_status");
      const visible = granted ? await invoke<boolean>("overlay_visible") : false;

      status.textContent = granted
        ? visible
          ? "权限已授予，悬浮猪显示中。"
          : "权限已授予，可以显示悬浮猪。"
        : "尚未授予悬浮窗权限。";
    } catch (error) {
      status.textContent = `状态检查失败：${String(error)}`;
    }
  };

  requestButton.addEventListener("click", async () => {
    try {
      const granted = await invoke<boolean>("request_overlay_permission");
      status.textContent = granted
        ? "权限已授予，可以显示悬浮猪。"
        : "请在系统设置里授予悬浮窗权限后再回来。";
    } catch (error) {
      status.textContent = `申请权限失败：${String(error)}`;
    }
  });

  showButton.addEventListener("click", async () => {
    try {
      const visible = await invoke<boolean>("show_overlay");
      status.textContent = visible
        ? "悬浮猪已显示，可拖动。"
        : "悬浮猪未显示。";
    } catch (error) {
      status.textContent = `显示悬浮猪失败：${String(error)}`;
    }
  });

  hideButton.addEventListener("click", async () => {
    try {
      await invoke<boolean>("hide_overlay");
      status.textContent = "悬浮猪已隐藏。";
    } catch (error) {
      status.textContent = `隐藏悬浮猪失败：${String(error)}`;
    }
  });

  await refreshStatus();
}

function bootDesktopPet(): void {
const WINDOW_SIZE = 120;
const FRAME_SIZE = 100;
const SPRITE_OFFSET = 10;
const WALK_SPEED = 120;
const ARRIVAL_DISTANCE = 4;
const ROAM_RADIUS = 220;
const SCREEN_PADDING = 16;
const IDLE_DURATION_MIN = 1.5;
const IDLE_DURATION_MAX = 3.5;
const SLEEP_CHANCE = 0.3;
const SLEEP_DURATION_MIN = 4;
const SLEEP_DURATION_MAX = 8;

type ActivityState =
  | "Idle"
  | "Walking"
  | "Dancing"
  | "Dragged"
  | "FallingAsleep"
  | "Sleeping"
  | "WakingUp";

type Facing = "Left" | "Right";
type ClipName =
  | "idle"
  | "walk"
  | "dance"
  | "dragged"
  | "fallAsleep"
  | "sleepLoop"
  | "wakeUp";

type Vec2 = {
  x: number;
  y: number;
};

type PetState = {
  activity: ActivityState;
  facing: Facing;
  position: Vec2;
  target: Vec2 | null;
  speed: number;
  stateTimer: number;
  currentClip: ClipName;
  windowWidth: number;
  windowHeight: number;
};

const appWindow = getCurrentWindow();
const pet: PetState = {
  activity: "Idle",
  facing: "Right",
  position: { x: 100, y: 100 },
  target: null,
  speed: WALK_SPEED,
  stateTimer: randomIdleDuration(),
  currentClip: "idle",
  windowWidth: WINDOW_SIZE,
  windowHeight: WINDOW_SIZE,
};

let idleDecisionPending = false;
let queuedWindowPosition: Vec2 | null = null;
let windowMoveInFlight = false;
let windowMoveRevision = 0;
let dragMoveSeen = false;
let dragLastMovedAt = 0;
let musicPlaying = false;

const DRAG_SETTLE_MS = 120;

async function normalizeDisplayScale(): Promise<void> {
  const scaleFactor = await appWindow.scaleFactor();
  const logicalWindowSize = WINDOW_SIZE / scaleFactor;

  document.documentElement.style.setProperty(
    "--pet-logical-size",
    `${logicalWindowSize}px`,
  );

  await appWindow.setSize(new LogicalSize(logicalWindowSize, logicalWindowSize));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomIdleDuration(): number {
  return randomBetween(IDLE_DURATION_MIN, IDLE_DURATION_MAX);
}

function randomSleepDuration(): number {
  return randomBetween(SLEEP_DURATION_MIN, SLEEP_DURATION_MAX);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function invalidateWindowMoveQueue(): void {
  windowMoveRevision += 1;
  queuedWindowPosition = null;
}

function queueWindowMove(position: Vec2): void {
  queuedWindowPosition = position;

  if (windowMoveInFlight) {
    return;
  }

  const next = queuedWindowPosition;
  if (!next) {
    return;
  }

  queuedWindowPosition = null;
  windowMoveInFlight = true;
  const revision = windowMoveRevision;

  void appWindow
    .setPosition(new PhysicalPosition(Math.round(next.x), Math.round(next.y)))
    .finally(() => {
      windowMoveInFlight = false;
      if (revision !== windowMoveRevision) {
        return;
      }

      if (queuedWindowPosition) {
        queueWindowMove(queuedWindowPosition);
      }
    });
}

async function syncWindowMetrics(): Promise<void> {
  const position = await appWindow.outerPosition();
  const size = await appWindow.outerSize();

  pet.position = { x: position.x, y: position.y };
  pet.windowWidth = size.width;
  pet.windowHeight = size.height;
}

async function chooseRoamTarget(): Promise<Vec2 | null> {
  const monitor = await currentMonitor();
  if (!monitor) {
    return null;
  }

  const minX = monitor.position.x + SCREEN_PADDING;
  const minY = monitor.position.y + SCREEN_PADDING;
  const maxX = monitor.position.x + monitor.size.width - pet.windowWidth - SCREEN_PADDING;
  const maxY = monitor.position.y + monitor.size.height - pet.windowHeight - SCREEN_PADDING;

  if (maxX <= minX || maxY <= minY) {
    return null;
  }

  return {
    x: randomBetween(
      clamp(pet.position.x - ROAM_RADIUS, minX, maxX),
      clamp(pet.position.x + ROAM_RADIUS, minX, maxX),
    ),
    y: randomBetween(
      clamp(pet.position.y - ROAM_RADIUS, minY, maxY),
      clamp(pet.position.y + ROAM_RADIUS, minY, maxY),
    ),
  };
}

class PetScene extends Phaser.Scene {
  private sprite!: Phaser.GameObjects.Sprite;

  constructor() {
    super("pet");
  }

  preload(): void {
    this.load.spritesheet("dance", "/dance.png", {
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
    });
    this.load.spritesheet("dragged", "/dragged.png", {
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
    });
    this.load.spritesheet("walk", "/walk.png", {
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
    });
    this.load.spritesheet("fallAsleep", "/fall_asleep.png", {
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
    });
    this.load.spritesheet("sleepLoop", "/sleep_loop.png", {
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
    });
    this.load.spritesheet("wakeUp", "/wake_up.png", {
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
    });
  }

  create(): void {
    this.anims.create({
      key: "idle",
      frames: [{ key: "walk", frame: 4 }],
      frameRate: 1,
      repeat: -1,
    });
    this.anims.create({
      key: "walk",
      frames: this.anims.generateFrameNumbers("walk", { start: 0, end: 8 }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: "dance",
      frames: this.anims.generateFrameNumbers("dance", { start: 0, end: 9 }),
      frameRate: 20,
      repeat: -1,
    });
    this.anims.create({
      key: "dragged",
      frames: this.anims.generateFrameNumbers("dragged", { start: 0, end: 8 }),
      frameRate: 18,
      repeat: -1,
    });
    this.anims.create({
      key: "fallAsleep",
      frames: this.anims.generateFrameNumbers("fallAsleep", { start: 0, end: 8 }),
      frameRate: 10,
      repeat: 0,
    });
    this.anims.create({
      key: "sleepLoop",
      frames: this.anims.generateFrameNumbers("sleepLoop", { start: 0, end: 8 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "wakeUp",
      frames: this.anims.generateFrameNumbers("wakeUp", { start: 0, end: 8 }),
      frameRate: 10,
      repeat: 0,
    });

    this.sprite = this.add.sprite(SPRITE_OFFSET, SPRITE_OFFSET, "walk", 4);
    this.sprite.setOrigin(0, 0);
    this.sprite.setInteractive({
      cursor: "default",
      pixelPerfect: true,
    });

    this.sprite.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) {
        return;
      }

      invalidateWindowMoveQueue();
      dragMoveSeen = false;
      dragLastMovedAt = performance.now();
      pet.target = null;
      pet.activity = "Dragged";
      this.syncAnimation();
      void appWindow.startDragging().catch((error: unknown) => {
        console.error("failed to start dragging", error);
      });
    });

    this.sprite.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (_animation: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
        const key = frame.textureKey;

        if (pet.activity === "FallingAsleep" && key === "fallAsleep") {
          pet.activity = "Sleeping";
          pet.stateTimer = randomSleepDuration();
          this.syncAnimation();
        } else if (pet.activity === "WakingUp" && key === "wakeUp") {
          this.enterIdle();
        }
      },
    );

    void normalizeDisplayScale().then(() => {
      void syncWindowMetrics().then(() => {
        this.syncAnimation();
        this.renderFacing();
      });
    });

    void appWindow.onMoved(({ payload }) => {
      pet.position = { x: payload.x, y: payload.y };

      if (pet.activity === "Dragged") {
        dragMoveSeen = true;
        dragLastMovedAt = performance.now();
      }
    });

    void appWindow.listen<{ playing: boolean }>("pet://music-state", (event) => {
      musicPlaying = event.payload.playing;

      if (pet.activity === "Dragged") {
        return;
      }

      if (musicPlaying) {
        this.enterDance();
      } else if (pet.activity === "Dancing") {
        this.enterIdle();
      }
    });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);

    switch (pet.activity) {
      case "Idle":
        this.updateIdle(dt);
        break;
      case "Walking":
        this.updateWalking(dt);
        break;
      case "Dancing":
        break;
      case "Sleeping":
        this.updateSleeping(dt);
        break;
      case "Dragged":
        this.updateDragged();
        break;
      case "FallingAsleep":
      case "WakingUp":
        break;
    }

    this.renderFacing();
  }

  private enterIdle(): void {
    pet.activity = "Idle";
    pet.target = null;
    pet.stateTimer = randomIdleDuration();
    this.syncAnimation();
  }

  private enterDance(): void {
    pet.activity = "Dancing";
    pet.target = null;
    this.syncAnimation();
  }

  private syncAnimation(): void {
    const next = this.clipForState(pet.activity);

    if (pet.currentClip === next && this.sprite.anims.currentAnim?.key === next) {
      return;
    }

    pet.currentClip = next;
    this.sprite.play(next, true);
  }

  private clipForState(activity: ActivityState): ClipName {
    switch (activity) {
      case "Walking":
        return "walk";
      case "Dancing":
        return "dance";
      case "Dragged":
        return "dragged";
      case "FallingAsleep":
        return "fallAsleep";
      case "Sleeping":
        return "sleepLoop";
      case "WakingUp":
        return "wakeUp";
      case "Idle":
        return "idle";
    }
  }

  private renderFacing(): void {
    this.sprite.setFlipX(pet.facing === "Right");
  }

  private updateIdle(dt: number): void {
    if (musicPlaying) {
      this.enterDance();
      return;
    }

    pet.stateTimer -= dt;

    if (pet.stateTimer > 0 || idleDecisionPending) {
      return;
    }

    idleDecisionPending = true;
    void this.decideIdleAction().finally(() => {
      idleDecisionPending = false;
    });
  }

  private async decideIdleAction(): Promise<void> {
    if (pet.activity !== "Idle") {
      return;
    }

    if (musicPlaying) {
      this.enterDance();
      return;
    }

    if (Math.random() < SLEEP_CHANCE) {
      pet.activity = "FallingAsleep";
      this.syncAnimation();
      return;
    }

    const target = await chooseRoamTarget();

    if (!target) {
      pet.stateTimer = randomIdleDuration();
      return;
    }

    pet.target = target;
    pet.activity = "Walking";
    this.syncAnimation();
  }

  private updateWalking(dt: number): void {
    if (musicPlaying) {
      this.enterDance();
      return;
    }

    if (!pet.target) {
      this.enterIdle();
      return;
    }

    const dx = pet.target.x - pet.position.x;
    const dy = pet.target.y - pet.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= ARRIVAL_DISTANCE) {
      pet.position = { ...pet.target };
      queueWindowMove(pet.position);
      this.enterIdle();
      return;
    }

    const directionX = dx / distance;
    const directionY = dy / distance;
    const step = Math.min(distance, pet.speed * dt);

    pet.position = {
      x: pet.position.x + directionX * step,
      y: pet.position.y + directionY * step,
    };

    if (directionX > 0.01) {
      pet.facing = "Right";
    } else if (directionX < -0.01) {
      pet.facing = "Left";
    }

    queueWindowMove(pet.position);
  }

  private updateSleeping(dt: number): void {
    if (musicPlaying) {
      this.enterDance();
      return;
    }

    pet.stateTimer -= dt;

    if (pet.stateTimer <= 0) {
      pet.activity = "WakingUp";
      this.syncAnimation();
    }
  }

  private updateDragged(): void {
    if (!dragMoveSeen) {
      return;
    }

    if (performance.now() - dragLastMovedAt < DRAG_SETTLE_MS) {
      return;
    }

    dragMoveSeen = false;
    void syncWindowMetrics().then(() => {
      if (musicPlaying) {
        this.enterDance();
      } else {
        this.enterIdle();
      }
    });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: WINDOW_SIZE,
  height: WINDOW_SIZE,
  transparent: true,
  backgroundColor: "#00000000",
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
  },
  scene: [PetScene],
  input: {
    mouse: {
      preventDefaultWheel: false,
    },
  },
  render: {
    transparent: true,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
});

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

game.canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("beforeunload", () => {
  game.destroy(true);
});
}
