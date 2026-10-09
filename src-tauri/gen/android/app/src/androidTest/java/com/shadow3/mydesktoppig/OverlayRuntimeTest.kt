package com.shadow3.mydesktoppig

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.SystemClock
import android.provider.Settings
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Runs against the real native overlay and WebView, in a disposable emulator/device. */
@RunWith(AndroidJUnit4::class)
class OverlayRuntimeTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val context = instrumentation.targetContext
  private fun ui(action: () -> Unit) = instrumentation.runOnMainSync(action)
  private fun overlay(): WebView = OverlayController::class.java.getDeclaredField("webView")
    .apply { isAccessible = true }.get(null) as WebView
  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) for (i in 0 until view.childCount) findWebView(view.getChildAt(i))?.let { return it }
    return null
  }
  private fun js(view: WebView, expression: String): String {
    val done = CountDownLatch(1)
    var value = "null"
    ui { view.evaluateJavascript(expression) { value = it; done.countDown() } }
    check(done.await(5, TimeUnit.SECONDS)) { "WebView evaluation timed out" }
    return value
  }
  private fun text(view: WebView, expression: String) = JSONTokener(js(view, expression)).nextValue().toString()
  private fun awaitState(view: WebView, expected: String) = awaitValue {
    text(view, "document.getElementById('app').dataset.state") == expected
  }
  private fun awaitValue(condition: () -> Boolean) {
    val deadline = SystemClock.uptimeMillis() + 6000
    while (!condition()) {
      check(SystemClock.uptimeMillis() < deadline) { "Native WebView did not reach expected state" }
      SystemClock.sleep(60)
    }
  }
  private fun capture(view: WebView, name: String) = ui {
    val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
    view.draw(Canvas(bitmap))
    File(context.filesDir, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
  }
  private fun touch(view: WebView, action: Int, x: Float, y: Float) = ui {
    val event = MotionEvent.obtain(SystemClock.uptimeMillis(), SystemClock.uptimeMillis(), action, x, y, 0)
    try { assertTrue(view.dispatchTouchEvent(event)) } finally { event.recycle() }
  }

  @Test fun nativeOverlayInterruptionsAndLifecycle() {
    assertTrue("Grant overlay permission in the test guest before running", Settings.canDrawOverlays(context))
    context.assets.open("overlay/NOTICE.txt").use { assertTrue(it.readBytes().isNotEmpty()) }
    context.assets.open("overlay/LICENSE").use { assertTrue(it.readBytes().isNotEmpty()) }
    val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
    try {
      var launcher: WebView? = null
      awaitValue {
        ui {
          val activity = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)
            .filterIsInstance<MainActivity>().firstOrNull()
          launcher = activity?.window?.decorView?.let { findWebView(it) }
        }
        launcher != null
      }
      awaitValue { js(launcher!!, "!!document.querySelector('.android-launcher .android-status')") == "true" }
      awaitValue { text(launcher!!, "document.querySelector('.android-status').textContent").contains("权限已授予") }
      ui { OverlayController.show(context) }
      val view = overlay()
      awaitValue { js(view, "document.querySelectorAll('#app svg').length") == "1" }
      assertEquals("undefined", text(view, "typeof window.Phaser"))
      ui { OverlayController.action("sleep") }
      awaitState(view, "Sleeping")
      capture(view, "qa-sleep.png")
      ui { OverlayController.action("toggle-pause") }
      assertEquals("true", text(view, "document.getElementById('app').dataset.paused"))
      val pose = js(view, "document.querySelector('#app svg').outerHTML")
      SystemClock.sleep(220)
      assertEquals("Pause must freeze all SVG attributes", pose, js(view, "document.querySelector('#app svg').outerHTML"))
      ui { OverlayController.action("wake") }
      awaitState(view, "WakingUp")
      assertEquals("false", text(view, "document.getElementById('app').dataset.paused"))
      touch(view, MotionEvent.ACTION_DOWN, 45f, 45f)
      awaitState(view, "Dragged")
      ui { OverlayController.action("dance") }
      SystemClock.sleep(180)
      awaitState(view, "Dragged")
      touch(view, MotionEvent.ACTION_MOVE, 105f, 155f)
      touch(view, MotionEvent.ACTION_UP, 105f, 155f)
      awaitState(view, "Dancing")
      SystemClock.sleep(1600)
      capture(view, "qa-dance.png")
      ui { OverlayController.action("reduce") }
      assertEquals("hue-rotate(0deg)", text(view, "document.getElementById('palette').style.filter"))
      js(view, "PigOverlayBridge.resize(160)")
      awaitValue {
        val geometry = JSONObject(text(view, "PigOverlayBridge.context()"))
        kotlin.math.abs(geometry.getJSONObject("windowSize").getDouble("width") / geometry.getDouble("scaleFactor") - 160) < 1
      }
      assertEquals("undefined", text(view, "typeof document.getElementById('app').dataset.error"))
      repeat(2) {
        ui { OverlayController.hide(context) }
        assertFalse(OverlayController.isVisible())
        ui { OverlayController.show(context) }
        val fresh = overlay()
        assertNotSame(view, fresh)
        awaitValue { js(fresh, "document.querySelectorAll('#app svg').length") == "1" }
      }
    } finally { ui { OverlayController.hide(context) } }
  }
}
