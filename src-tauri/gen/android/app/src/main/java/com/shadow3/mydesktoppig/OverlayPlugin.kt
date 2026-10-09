package com.shadow3.mydesktoppig

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

data class OverlayPermissionStatus(val granted: Boolean)
data class OverlayVisibleStatus(val visible: Boolean)
@InvokeArg
class OverlayActionArgs { var action: String = "idle" }

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

    activity.runOnUiThread {
      try { OverlayController.show(activity.applicationContext); invoke.resolveObject(OverlayVisibleStatus(OverlayController.isVisible())) }
      catch (error: RuntimeException) { invoke.reject(error.message ?: "Unable to show overlay") }
    }
  }

  @Command
  fun hideOverlay(invoke: Invoke) {
    activity.runOnUiThread {
      OverlayController.hide(activity.applicationContext)
      invoke.resolveObject(OverlayVisibleStatus(OverlayController.isVisible()))
    }
  }

  @Command
  fun overlayVisible(invoke: Invoke) {
    invoke.resolveObject(OverlayVisibleStatus(OverlayController.isVisible()))
  }

  @Command
  fun overlayAction(invoke: Invoke) {
    val args = invoke.parseArgs(OverlayActionArgs::class.java)
    activity.runOnUiThread { OverlayController.action(args.action); invoke.resolveObject(OverlayVisibleStatus(OverlayController.isVisible())) }
  }
}
