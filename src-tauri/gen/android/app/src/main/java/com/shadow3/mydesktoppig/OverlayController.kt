package com.shadow3.mydesktoppig

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.random.Random

object OverlayController {
  private const val WALK_SPEED = 90f
  private const val SCREEN_PADDING = 16f
  private const val ARRIVAL_DISTANCE = 4f
  private const val MIN_TRAVEL_DISTANCE = 40f

  private var overlayView: View? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var overlayActivity: String = "Idle"
  private var posX = 120f
  private var posY = 240f
  private var facing = "Left"
  private var walkTargetX: Float? = null
  private var dragging = false
  private var musicPlaying = false
  private var pauseAutoUntilMs = 0L
  private var lastFrameAtMs = 0L
  private var audioManager: AudioManager? = null
  private var playbackCallback: AudioManager.AudioPlaybackCallback? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private val movementRunnable = object : Runnable {
    override fun run() {
      val view = overlayView
      val params = layoutParams
      if (view == null || params == null) {
        return
      }

      val now = SystemClock.uptimeMillis()
      val deltaSeconds =
        if (lastFrameAtMs == 0L) 0f else ((now - lastFrameAtMs).coerceAtMost(48) / 1000f)
      lastFrameAtMs = now

      if (
        overlayActivity == "Walking" &&
        !dragging &&
        now >= pauseAutoUntilMs
      ) {
        val metrics = view.resources.displayMetrics
        if (walkTargetX == null) {
          walkTargetX = chooseWalkTargetX(metrics.widthPixels, params.width)
          updateFacing(if ((walkTargetX ?: posX) >= posX) "Right" else "Left")
        }

        val targetX = walkTargetX ?: posX
        val deltaX = targetX - posX

        if (abs(deltaX) <= ARRIVAL_DISTANCE) {
          posX = targetX
          params.x = posX.roundToInt()
          params.y = posY.roundToInt()
          try {
            (view.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager)
              .updateViewLayout(view, params)
          } catch (_: IllegalArgumentException) {
            return
          }
          walkTargetX = null
          overlayActivity = "Idle"
          dispatchToOverlay("window.finishWalk && window.finishWalk()")
        } else {
          val step = minOf(abs(deltaX), WALK_SPEED * deltaSeconds)
          posX += if (deltaX > 0f) step else -step
          params.x = posX.roundToInt()
          params.y = posY.roundToInt()
          try {
            (view.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager)
              .updateViewLayout(view, params)
          } catch (_: IllegalArgumentException) {
            return
          }
        }
      }

      mainHandler.postDelayed(this, 16)
    }
  }

  private fun dispatchToOverlay(script: String) {
    val webView = overlayView as? WebView ?: return
    webView.post {
      webView.evaluateJavascript(script, null)
    }
  }

  private fun pushDragState() {
    dispatchToOverlay("window.setDragActive(${if (dragging) "true" else "false"})")
  }

  private fun pushMusicState() {
    dispatchToOverlay("window.setMusicActive(${if (musicPlaying) "true" else "false"})")
  }

  private fun pushFacingState() {
    dispatchToOverlay("window.setFacing(\"$facing\")")
  }

  private fun syncOverlayState() {
    pushDragState()
    pushMusicState()
    pushFacingState()
  }

  private fun updateFacing(nextFacing: String) {
    if (facing == nextFacing) {
      return
    }

    facing = nextFacing
    pushFacingState()
  }

  private fun updateFacingFromVelocity() {
    updateFacing(if ((walkTargetX ?: posX) >= posX) "Right" else "Left")
  }

  private fun chooseWalkTargetX(screenWidth: Int, windowWidth: Int): Float {
    val minX = SCREEN_PADDING
    val maxX = max(screenWidth - windowWidth, 0).toFloat() - SCREEN_PADDING

    if (maxX <= minX) {
      return posX
    }

    repeat(6) {
      val candidate = Random.nextFloat() * (maxX - minX) + minX
      if (abs(candidate - posX) >= MIN_TRAVEL_DISTANCE) {
        return candidate
      }
    }

    return if (posX < (minX + maxX) * 0.5f) maxX else minX
  }

  private fun setMusicPlaying(active: Boolean) {
    if (musicPlaying == active) {
      return
    }

    musicPlaying = active
    pushMusicState()
  }

  private fun configLooksLikeMusic(config: AudioPlaybackConfiguration): Boolean {
    val attributes = config.audioAttributes
    return attributes.usage == AudioAttributes.USAGE_MEDIA ||
      attributes.contentType == AudioAttributes.CONTENT_TYPE_MUSIC
  }

  private fun resolveMusicPlaying(configurations: List<AudioPlaybackConfiguration>): Boolean {
    return configurations.any { config ->
      configLooksLikeMusic(config)
    }
  }

  private fun startPlaybackMonitoring(context: Context) {
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    audioManager = manager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val callback = object : AudioManager.AudioPlaybackCallback() {
        override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>) {
          setMusicPlaying(resolveMusicPlaying(configs))
        }
      }

      playbackCallback = callback
      manager.registerAudioPlaybackCallback(callback, mainHandler)
      setMusicPlaying(resolveMusicPlaying(manager.activePlaybackConfigurations))
      return
    }

    setMusicPlaying(manager.isMusicActive)
  }

  private fun stopPlaybackMonitoring() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = audioManager
      val callback = playbackCallback
      if (manager != null && callback != null) {
        manager.unregisterAudioPlaybackCallback(callback)
      }
    }

    audioManager = null
    playbackCallback = null
    musicPlaying = false
  }

  @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
  fun show(context: Context) {
    if (overlayView != null) {
      return
    }

    val windowManager =
      context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    val sizePx = 120

    layoutParams = WindowManager.LayoutParams(
      sizePx,
      sizePx,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      },
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = 120
      y = 240
    }
    posX = layoutParams?.x?.toFloat() ?: 120f
    posY = layoutParams?.y?.toFloat() ?: 240f
    overlayActivity = "Idle"
    facing = "Left"
    walkTargetX = null
    dragging = false
    musicPlaying = false
    pauseAutoUntilMs = 0L
    lastFrameAtMs = 0L

    val webView = WebView(context).apply {
      setBackgroundColor(Color.TRANSPARENT)
      isVerticalScrollBarEnabled = false
      isHorizontalScrollBarEnabled = false
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = false
      settings.cacheMode = WebSettings.LOAD_NO_CACHE
      settings.allowFileAccess = true
      settings.allowContentAccess = false
      settings.useWideViewPort = true
      settings.loadWithOverviewMode = false
      setLayerType(View.LAYER_TYPE_HARDWARE, null)
      webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView?, url: String?) {
          syncOverlayState()
        }
      }
      addJavascriptInterface(OverlayJavascriptBridge(), "PigOverlayBridge")
      setOnTouchListener(DragTouchListener(windowManager))
      loadUrl("file:///android_asset/overlay/index.html")
    }

    overlayView = webView
    windowManager.addView(webView, layoutParams)
    startPlaybackMonitoring(context)
    mainHandler.removeCallbacks(movementRunnable)
    mainHandler.post(movementRunnable)
  }

  fun hide(context: Context) {
    val view = overlayView ?: return
    val windowManager =
      context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    mainHandler.removeCallbacks(movementRunnable)
    stopPlaybackMonitoring()
    windowManager.removeView(view)
    overlayView = null
    layoutParams = null
    overlayActivity = "Idle"
  }

  fun isVisible(): Boolean {
    return overlayView != null
  }

  private class DragTouchListener(
    private val windowManager: WindowManager,
  ) : View.OnTouchListener {
    private var startX = 0
    private var startY = 0
    private var touchX = 0f
    private var touchY = 0f

    override fun onTouch(view: View, event: MotionEvent): Boolean {
      val params = layoutParams ?: return false

      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          dragging = true
          walkTargetX = null
          pushDragState()
          startX = params.x
          startY = params.y
          touchX = event.rawX
          touchY = event.rawY
          return true
        }

        MotionEvent.ACTION_MOVE -> {
          val deltaX = event.rawX - touchX
          params.x = startX + (event.rawX - touchX).roundToInt()
          params.y = startY + (event.rawY - touchY).roundToInt()
          posX = params.x.toFloat()
          posY = params.y.toFloat()
          if (deltaX >= 2f) {
            updateFacing("Right")
          } else if (deltaX <= -2f) {
            updateFacing("Left")
          }
          windowManager.updateViewLayout(view, params)
          return true
        }

        MotionEvent.ACTION_UP,
        MotionEvent.ACTION_CANCEL -> {
          dragging = false
          walkTargetX = null
          pushDragState()
          posX = params.x.toFloat()
          posY = params.y.toFloat()
          pauseAutoUntilMs = SystemClock.uptimeMillis() + 2500
          return true
        }
      }

      return false
    }
  }

  private class OverlayJavascriptBridge {
    @JavascriptInterface
    fun setActivity(activity: String) {
      overlayActivity = activity
      if (overlayActivity == "Walking") {
        walkTargetX = null
        updateFacingFromVelocity()
      }
    }
  }
}
