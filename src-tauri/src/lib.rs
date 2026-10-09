mod overlay;

use serde::{Deserialize, Serialize};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
#[cfg(windows)]
use tauri::Emitter;
use tauri::{AppHandle, Manager, State};
#[cfg(windows)]
use windows::{
    Win32::{
        Foundation::{HWND, LPARAM, RECT},
        UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON},
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
        },
    },
    core::BOOL,
};

/** Native facts only. Behavior and timing are shared TypeScript, never a second state machine. */
struct NativeState {
    music: AtomicBool,
    stopping: Arc<AtomicBool>,
}
#[derive(Clone, Copy, Deserialize, Serialize)]
struct Vec2 {
    x: f64,
    y: f64,
}
#[derive(Clone, Copy, Deserialize)]
#[cfg_attr(not(windows), allow(dead_code))]
struct Size {
    width: f64,
    height: f64,
}
#[derive(Clone, Copy, Deserialize)]
#[cfg_attr(not(windows), allow(dead_code))]
struct MonitorBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
#[derive(Clone, Copy, Deserialize)]
#[cfg_attr(not(windows), allow(dead_code))]
#[serde(rename_all = "camelCase")]
struct PetContext {
    position: Vec2,
    window_size: Size,
    monitor: Option<MonitorBounds>,
}

#[cfg(windows)]
const WINDOW_SLEEP_ATTACH_PADDING: f64 = 12.0;
#[cfg(windows)]
const WINDOW_SLEEP_SCREEN_PADDING: f64 = 8.0;
#[cfg(windows)]
const WINDOW_SLEEP_DROP_Y_DISTANCE: f64 = 56.0;
#[cfg(windows)]
const WINDOW_SLEEP_DROP_X_PADDING: f64 = 28.0;
#[cfg(windows)]
const WINDOW_SLEEP_ATTACH_MIN_WIDTH: f64 = 180.0;
#[cfg(windows)]
const WINDOW_SLEEP_ATTACH_MIN_HEIGHT: f64 = 100.0;
include!("anchor.rs");

#[tauri::command]
fn runtime_platform() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else {
        "desktop"
    }
}
#[tauri::command]
fn pet_music_playing(state: State<'_, NativeState>) -> bool {
    state.music.load(Ordering::Relaxed)
}
#[tauri::command]
fn pet_pointer_pressed() -> bool {
    #[cfg(windows)]
    {
        unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) < 0 }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
fn pet_frontend_ready(state: String, svg_count: u32) {
    #[cfg(debug_assertions)]
    eprintln!("Piggy frontend ready: SVG={svg_count}, state={state}");
    #[cfg(not(debug_assertions))]
    let _ = (state, svg_count);
}
#[tauri::command]
fn pet_find_drag_sleep_anchor(state: State<'_, NativeState>, context: PetContext) -> Option<Vec2> {
    if state.music.load(Ordering::Relaxed) {
        return None;
    }
    #[cfg(windows)]
    {
        choose_drag_sleep_anchor(&context)
    }
    #[cfg(not(windows))]
    {
        let _ = context;
        None
    }
}

#[cfg(windows)]
fn start_music_monitor(app: AppHandle, stopping: Arc<AtomicBool>) {
    use windows::{
        Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        },
        Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize},
    };
    std::thread::spawn(move || {
        if unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.is_err() {
            return;
        }
        while !stopping.load(Ordering::Relaxed) {
            let playing = (|| -> windows::core::Result<bool> {
                let manager =
                    GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.join()?;
                let sessions = manager.GetSessions()?;
                for index in 0..sessions.Size()? {
                    if sessions.GetAt(index)?.GetPlaybackInfo()?.PlaybackStatus()?
                        == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
                    {
                        return Ok(true);
                    }
                }
                Ok(false)
            })()
            .unwrap_or(false);
            let state = app.state::<NativeState>();
            if state.music.swap(playing, Ordering::Relaxed) != playing
                && let Some(window) = app.get_webview_window("main")
            {
                let _ = window.emit("pet://music-state", serde_json::json!({"playing": playing}));
            }
            std::thread::sleep(std::time::Duration::from_millis(1200));
        }
        unsafe {
            RoUninitialize();
        }
    });
}
#[cfg(not(windows))]
fn start_music_monitor(_app: AppHandle, _stopping: Arc<AtomicBool>) {}

#[cfg(desktop)]
fn setup_desktop(app: &mut tauri::App) -> tauri::Result<()> {
    use tauri::{
        Emitter,
        menu::{MenuBuilder, MenuItemBuilder},
        tray::TrayIconBuilder,
    };
    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("idle", "待机").build(app)?)
        .item(&MenuItemBuilder::with_id("walk", "散步").build(app)?)
        .item(&MenuItemBuilder::with_id("dance", "跳舞").build(app)?)
        .item(&MenuItemBuilder::with_id("sleep", "睡觉").build(app)?)
        .item(&MenuItemBuilder::with_id("wake", "唤醒").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("toggle-pause", "暂停 / 继续").build(app)?)
        .item(&MenuItemBuilder::with_id("reduce", "减少动态 / 恢复").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("size-80", "小号 (80)").build(app)?)
        .item(&MenuItemBuilder::with_id("size-120", "标准 (120)").build(app)?)
        .item(&MenuItemBuilder::with_id("size-160", "大号 (160)").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("quit", "退出").build(app)?)
        .build()?;
    let tray = TrayIconBuilder::new()
        .tooltip("Piggy 0.2 — SVG")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon(app.default_window_icon().expect("app icon").clone())
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "quit" {
                app.exit(0);
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let payload = if let Some(size) = id
                    .strip_prefix("size-")
                    .and_then(|text| text.parse::<u32>().ok())
                {
                    serde_json::json!({"type": "size", "size": size})
                } else {
                    serde_json::json!({"type": "action", "action": id})
                };
                let _ = window.emit("pet://host", payload);
            }
        })
        .build(app)?;
    app.manage(tray);
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
    }
    Ok(())
}
#[cfg(not(desktop))]
fn setup_desktop(_app: &mut tauri::App) -> tauri::Result<()> {
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let stopping = Arc::new(AtomicBool::new(false));
    tauri::Builder::default()
        .manage(NativeState {
            music: AtomicBool::new(false),
            stopping: stopping.clone(),
        })
        .plugin(overlay::init())
        .invoke_handler(tauri::generate_handler![
            runtime_platform,
            pet_music_playing,
            pet_pointer_pressed,
            pet_frontend_ready,
            pet_find_drag_sleep_anchor,
            overlay::overlay_permission_status,
            overlay::request_overlay_permission,
            overlay::show_overlay,
            overlay::hide_overlay,
            overlay::overlay_visible,
            overlay::overlay_action
        ])
        .setup(move |app| {
            setup_desktop(app)?;
            start_music_monitor(app.handle().clone(), stopping);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Piggy")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<NativeState>()
                    .stopping
                    .store(true, Ordering::Relaxed);
            }
        });
}
