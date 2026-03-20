use tauri::{
    Emitter,
    Manager,
    menu::{MenuBuilder, MenuEvent, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle,
};
use serde::Serialize;
use std::{thread, time::Duration};

#[allow(dead_code)]
struct TrayState(tauri::tray::TrayIcon);

#[derive(Clone, Serialize)]
struct MusicStatePayload {
    playing: bool,
}

#[cfg(windows)]
fn start_music_monitor(app: AppHandle) {
    thread::spawn(move || {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        };
        use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize};

        match unsafe { RoInitialize(RO_INIT_MULTITHREADED) } {
            Ok(()) => {}
            Err(error) => {
                eprintln!("failed to initialize Windows media monitor: {error}");
                return;
            }
        }

        let mut last_playing = None;

        loop {
            let playing = (|| -> windows::core::Result<bool> {
                let manager =
                    GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.join()?;
                let sessions = manager.GetSessions()?;

                for index in 0..sessions.Size()? {
                    let session = sessions.GetAt(index)?;
                    let playback_info = session.GetPlaybackInfo()?;

                    if playback_info.PlaybackStatus()?
                        == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
                    {
                        return Ok(true);
                    }
                }

                Ok(false)
            })()
            .unwrap_or(false);

            if last_playing != Some(playing) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit(
                        "pet://music-state",
                        MusicStatePayload { playing },
                    );
                }

                last_playing = Some(playing);
            }

            thread::sleep(Duration::from_millis(1200));
        }
    });
}

#[cfg(not(windows))]
fn start_music_monitor(_app: AppHandle) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app).item(&quit).build()?;

            let tray = TrayIconBuilder::new()
                .tooltip("Piggy")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app: &AppHandle<_>, event: MenuEvent| {
                    match event.id().as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .icon(app.default_window_icon().expect("default icon must exist").clone())
                .build(app)?;

            app.manage(TrayState(tray));

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            start_music_monitor(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
