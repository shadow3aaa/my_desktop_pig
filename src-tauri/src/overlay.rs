use tauri::{
    AppHandle, Runtime,
    plugin::{Builder as PluginBuilder, TauriPlugin},
};

#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
pub struct OverlayPlugin<R: Runtime>(pub tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "android")]
#[derive(serde::Deserialize)]
struct PermissionStatus {
    granted: bool,
}

#[cfg(target_os = "android")]
#[derive(serde::Deserialize)]
struct VisibleStatus {
    visible: bool,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("overlay")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    _api.register_android_plugin("com.shadow3.mydesktoppig", "OverlayPlugin")?;
                _app.manage(OverlayPlugin(handle));
            }

            Ok(())
        })
        .build()
}

#[cfg(target_os = "android")]
fn android_overlay_plugin<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri::State<'_, OverlayPlugin<R>>, String> {
    app.try_state::<OverlayPlugin<R>>()
        .ok_or_else(|| "overlay plugin is not initialized".to_string())
}

#[tauri::command]
pub fn overlay_permission_status<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        let plugin = android_overlay_plugin(&app)?;
        let response: PermissionStatus = plugin
            .0
            .run_mobile_plugin("overlayPermissionStatus", ())
            .map_err(|error| error.to_string())?;
        Ok(response.granted)
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
pub fn request_overlay_permission<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        let plugin = android_overlay_plugin(&app)?;
        let response: PermissionStatus = plugin
            .0
            .run_mobile_plugin("requestOverlayPermission", ())
            .map_err(|error| error.to_string())?;
        Ok(response.granted)
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("overlay permission is only available on Android".to_string())
    }
}

#[tauri::command]
pub fn show_overlay<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        let plugin = android_overlay_plugin(&app)?;
        let response: VisibleStatus = plugin
            .0
            .run_mobile_plugin("showOverlay", ())
            .map_err(|error| error.to_string())?;
        Ok(response.visible)
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("overlay is only available on Android".to_string())
    }
}

#[tauri::command]
pub fn hide_overlay<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        let plugin = android_overlay_plugin(&app)?;
        let response: VisibleStatus = plugin
            .0
            .run_mobile_plugin("hideOverlay", ())
            .map_err(|error| error.to_string())?;
        Ok(response.visible)
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("overlay is only available on Android".to_string())
    }
}

#[tauri::command]
pub fn overlay_visible<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        let plugin = android_overlay_plugin(&app)?;
        let response: VisibleStatus = plugin
            .0
            .run_mobile_plugin("overlayVisible", ())
            .map_err(|error| error.to_string())?;
        Ok(response.visible)
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(false)
    }
}
