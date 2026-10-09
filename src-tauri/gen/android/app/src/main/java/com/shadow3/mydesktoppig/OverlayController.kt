package com.shadow3.mydesktoppig

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.ComponentCallbacks
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import kotlin.math.hypot
import kotlin.math.roundToInt

/** Native overlay resources and input only. The bundled pet runtime owns all behavior/motion. */
object OverlayController {
  private const val TAG = "PigOverlay"
  private val handler = Handler(Looper.getMainLooper())
  private var webView: WebView? = null
  private var params: WindowManager.LayoutParams? = null
  private var windowManager: WindowManager? = null
  private var owner: Context? = null
  private var logicalSize = 120
  private var dragging = false
  private var generation = 0
  private var pageReady = false
  @Volatile private var contextJson = "{}"
  @Volatile private var musicActive = false
  private var audioManager: AudioManager? = null
  private var audioCallback: AudioManager.AudioPlaybackCallback? = null
  private var pendingMove: Pair<Int, Int>? = null

  private fun send(event: JSONObject) {
    if (pageReady) webView?.evaluateJavascript("window.petHost && window.petHost.receive($event)", null)
  }
  private fun contextEvent() = JSONObject().put("type", "context").put("context", JSONObject(contextJson))
  private fun refreshContext() {
    val view = webView ?: return
    val layout = params ?: return
    val metrics = view.resources.displayMetrics
    val screen = if (Build.VERSION.SDK_INT >= 30) windowManager?.currentWindowMetrics?.bounds else null
    contextJson = JSONObject()
      .put("position", JSONObject().put("x", layout.x).put("y", layout.y))
      .put("windowSize", JSONObject().put("width", layout.width).put("height", layout.height))
      .put("monitor", JSONObject().put("x", screen?.left ?: 0).put("y", screen?.top ?: 0)
        .put("width", screen?.width() ?: metrics.widthPixels).put("height", screen?.height() ?: metrics.heightPixels))
      .put("scaleFactor", metrics.density.toDouble()).toString()
  }
  private fun updateLayout() {
    val view = webView ?: return
    val layout = params ?: return
    try { windowManager?.updateViewLayout(view, layout); refreshContext() }
    catch (error: IllegalArgumentException) { Log.e(TAG, "Overlay layout unavailable", error) }
  }
  private val moveRunnable = Runnable {
    val point = pendingMove
    pendingMove = null
    if (!dragging && point != null) { params?.x = point.first; params?.y = point.second; updateLayout() }
  }
  private fun setMusic(active: Boolean) {
    if (musicActive == active) return
    musicActive = active
    send(JSONObject().put("type", "music").put("playing", active))
  }
  private fun startAudio(context: Context) {
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    audioManager = manager
    if (Build.VERSION.SDK_INT >= 26) {
      val callback = object : AudioManager.AudioPlaybackCallback() {
        override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>) {
          if (audioCallback !== this) return
          setMusic(configs.any { it.audioAttributes.usage == AudioAttributes.USAGE_MEDIA || it.audioAttributes.contentType == AudioAttributes.CONTENT_TYPE_MUSIC })
        }
      }
      audioCallback = callback
      manager.registerAudioPlaybackCallback(callback, handler)
      setMusic(manager.isMusicActive)
    } else handler.post(audioPoll)
  }
  private val audioPoll = object : Runnable {
    override fun run() { if (webView != null) { setMusic(audioManager?.isMusicActive == true); handler.postDelayed(this, 1200) } }
  }
  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      send(JSONObject().put("type", "suspend").put("suspended", intent?.action == Intent.ACTION_SCREEN_OFF))
    }
  }
  private val configurationCallback = object : ComponentCallbacks {
    override fun onConfigurationChanged(config: Configuration) {
      val density = webView?.resources?.displayMetrics?.density ?: return
      params?.width = (logicalSize * density).roundToInt()
      params?.height = (logicalSize * density).roundToInt()
      updateLayout()
      send(contextEvent())
    }
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onLowMemory() { webView?.clearCache(false) }
  }

  @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
  fun show(context: Context) {
    check(Looper.myLooper() == Looper.getMainLooper())
    if (webView != null) return
    owner = context
    windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val size = (logicalSize * context.resources.displayMetrics.density).roundToInt()
    params = WindowManager.LayoutParams(size, size,
      if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT)
      .apply { gravity = Gravity.TOP or Gravity.START; x = size; y = size * 2 }
    generation++
    val token = generation
    pageReady = false
    dragging = false
    val view = WebView(context).apply {
      setBackgroundColor(Color.TRANSPARENT)
      isVerticalScrollBarEnabled = false
      isHorizontalScrollBarEnabled = false
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = false
      settings.allowFileAccess = true
      settings.allowContentAccess = false
      settings.useWideViewPort = true
      setLayerType(View.LAYER_TYPE_HARDWARE, null)
      addJavascriptInterface(OverlayBridge(token), "PigOverlayBridge")
      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView?, request: android.webkit.WebResourceRequest?): Boolean = true
        override fun onPageFinished(view: WebView?, url: String?) {
          if (token != generation || view !== webView) return
          pageReady = true
          refreshContext()
          send(contextEvent())
          send(JSONObject().put("type", "music").put("playing", musicActive))
        }
      }
      setOnTouchListener(DragTouch())
    }
    webView = view
    refreshContext()
    try { windowManager?.addView(view, params) }
    catch (error: RuntimeException) { hide(context); throw error }
    startAudio(context)
    context.registerComponentCallbacks(configurationCallback)
    val filter = IntentFilter().apply { addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON) }
    if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    else @Suppress("DEPRECATION") context.registerReceiver(screenReceiver, filter)
    view.loadUrl("file:///android_asset/overlay/index.html")
  }
  fun action(action: String) {
    if (action in setOf("idle", "walk", "dance", "sleep", "wake", "toggle-sleep", "toggle-pause", "reduce"))
      send(JSONObject().put("type", "action").put("action", action))
  }
  fun hide(context: Context) {
    check(Looper.myLooper() == Looper.getMainLooper())
    val view = webView ?: return
    generation++
    pendingMove = null
    pageReady = false
    handler.removeCallbacks(moveRunnable)
    handler.removeCallbacks(audioPoll)
    if (Build.VERSION.SDK_INT >= 26) audioCallback?.let { audioManager?.unregisterAudioPlaybackCallback(it) }
    try { context.unregisterReceiver(screenReceiver) } catch (_: IllegalArgumentException) {}
    context.unregisterComponentCallbacks(configurationCallback)
    try { windowManager?.removeView(view) } catch (_: IllegalArgumentException) {}
    view.stopLoading()
    view.removeJavascriptInterface("PigOverlayBridge")
    view.loadUrl("about:blank")
    view.removeAllViews()
    view.destroy()
    webView = null
    params = null
    windowManager = null
    owner = null
    audioManager = null
    audioCallback = null
    musicActive = false
    dragging = false
  }
  fun isVisible() = webView != null

  private class DragTouch : View.OnTouchListener {
    private var startX = 0
    private var startY = 0
    private var touchX = 0f
    private var touchY = 0f
    private var lastTap = 0L
    override fun onTouch(view: View, event: MotionEvent): Boolean {
      val layout = params ?: return false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          dragging = true
          handler.removeCallbacks(moveRunnable)
          pendingMove = null
          startX = layout.x; startY = layout.y; touchX = event.rawX; touchY = event.rawY
          send(JSONObject().put("type", "drag-start"))
        }
        MotionEvent.ACTION_MOVE -> {
          layout.x = startX + (event.rawX - touchX).roundToInt()
          layout.y = startY + (event.rawY - touchY).roundToInt()
          updateLayout(); send(contextEvent())
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          dragging = false
          refreshContext()
          send(JSONObject().put("type", "drag-end").put("context", JSONObject(contextJson)))
          if (event.actionMasked == MotionEvent.ACTION_UP && hypot(event.rawX - touchX, event.rawY - touchY) < 8 * view.resources.displayMetrics.density) {
            val now = SystemClock.uptimeMillis()
            if (now - lastTap < 350) { action("toggle-sleep"); lastTap = 0 } else lastTap = now
          }
        }
        else -> return false
      }
      return true
    }
  }
  private class OverlayBridge(private val token: Int) {
    @JavascriptInterface fun context() = contextJson
    @JavascriptInterface fun musicPlaying() = musicActive
    @JavascriptInterface fun cancelMoves() {
      handler.post {
        if (token != generation) return@post
        pendingMove = null
        handler.removeCallbacks(moveRunnable)
      }
    }
    @JavascriptInterface fun moveTo(x: Double, y: Double) {
      if (!x.isFinite() || !y.isFinite()) return
      handler.post {
        if (token != generation || dragging) return@post
        pendingMove = Pair(x.roundToInt(), y.roundToInt())
        handler.removeCallbacks(moveRunnable)
        handler.post(moveRunnable)
      }
    }
    @JavascriptInterface fun resize(size: Int) {
      handler.post {
        if (token != generation) return@post
        logicalSize = size.coerceIn(80, 320)
        val density = webView?.resources?.displayMetrics?.density ?: return@post
        params?.width = (logicalSize * density).roundToInt(); params?.height = (logicalSize * density).roundToInt()
        updateLayout(); send(contextEvent())
      }
    }
  }
}
