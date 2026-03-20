package com.shadow3.mydesktoppig

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

data class OverlayPermissionStatus(val granted: Boolean)
data class OverlayVisibleStatus(val visible: Boolean)

@TauriPlugin
class OverlayPlugin(private val activity: Activity) : Plugin(activity) {
  private fun canDrawOverlays(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(activity)
    } else {
      true
    }
  }

  @Command
  fun overlayPermissionStatus(invoke: Invoke) {
    invoke.resolveObject(OverlayPermissionStatus(canDrawOverlays()))
  }

  @Command
  fun requestOverlayPermission(invoke: Invoke) {
    if (canDrawOverlays()) {
      invoke.resolveObject(OverlayPermissionStatus(true))
      return
    }

    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${activity.packageName}"),
    )

    startActivityForResult(invoke, intent, "handleOverlayPermissionResult")
  }

  @ActivityCallback
  fun handleOverlayPermissionResult(invoke: Invoke, @Suppress("UNUSED_PARAMETER") _result: ActivityResult) {
    invoke.resolveObject(OverlayPermissionStatus(canDrawOverlays()))
  }

  @Command
  fun showOverlay(invoke: Invoke) {
    if (!canDrawOverlays()) {
      invoke.reject("overlay permission is not granted")
      return
    }

    OverlayController.show(activity.applicationContext)
    invoke.resolveObject(OverlayVisibleStatus(OverlayController.isVisible()))
  }

  @Command
  fun hideOverlay(invoke: Invoke) {
    OverlayController.hide(activity.applicationContext)
    invoke.resolveObject(OverlayVisibleStatus(OverlayController.isVisible()))
  }

  @Command
  fun overlayVisible(invoke: Invoke) {
    invoke.resolveObject(OverlayVisibleStatus(OverlayController.isVisible()))
  }
}
