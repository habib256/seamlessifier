package com.habib256.pagedroit

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.hypot

/**
 * Draws the photo letterboxed and a 4-handle quad in bitmap coordinates
 * (TL, TR, BR, BL) — same convention as the web Ripper.
 */
class QuadOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    var bitmap: Bitmap? = null
        set(value) {
            field = value
            if (value != null && (corners == null || corners!!.isEmpty())) {
                corners = Homography.defaultCorners(value.width, value.height)
            }
            invalidate()
        }

    var corners: Array<FloatArray>? = null
        private set

    private val dst = android.graphics.RectF()
    private var drag = -1
    private val handleR = 18f * resources.displayMetrics.density

    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF4F9DFF.toInt()
        style = Paint.Style.STROKE
        strokeWidth = 3f * resources.displayMetrics.density
    }
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x594F9DFF
        style = Paint.Style.STROKE
        strokeWidth = resources.displayMetrics.density
    }
    private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF4F9DFF.toInt()
        style = Paint.Style.FILL
    }
    private val handleHot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        style = Paint.Style.FILL
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        textSize = 12f * resources.displayMetrics.density
    }

    fun resetCorners() {
        val b = bitmap ?: return
        corners = Homography.defaultCorners(b.width, b.height)
        invalidate()
    }

    private fun layoutImage() {
        val b = bitmap ?: return
        val vw = width.toFloat()
        val vh = height.toFloat()
        if (vw <= 0 || vh <= 0) return
        val scale = minOf(vw / b.width, vh / b.height)
        val dw = b.width * scale
        val dh = b.height * scale
        dst.set((vw - dw) / 2f, (vh - dh) / 2f, (vw + dw) / 2f, (vh + dh) / 2f)
    }

    private fun toView(px: Float, py: Float): Pair<Float, Float> {
        val b = bitmap ?: return Pair(px, py)
        val x = dst.left + (px / b.width) * dst.width()
        val y = dst.top + (py / b.height) * dst.height()
        return Pair(x, y)
    }

    private fun toBitmap(vx: Float, vy: Float): Pair<Float, Float> {
        val b = bitmap ?: return Pair(vx, vy)
        val x = ((vx - dst.left) / dst.width() * b.width).coerceIn(0f, b.width.toFloat())
        val y = ((vy - dst.top) / dst.height() * b.height).coerceIn(0f, b.height.toFloat())
        return Pair(x, y)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val b = bitmap ?: return
        val c = corners ?: return
        layoutImage()
        canvas.drawBitmap(b, null, dst, bitmapPaint)

        val pts = Array(4) { i -> toView(c[i][0], c[i][1]) }
        val path = Path()
        path.moveTo(pts[0].first, pts[0].second)
        for (i in 1..3) path.lineTo(pts[i].first, pts[i].second)
        path.close()
        canvas.drawPath(path, linePaint)

        val n = 4
        for (i in 1 until n) {
            val gp = Path()
            for (j in 0..12) {
                val u = i / n.toFloat()
                val v = j / 12f
                val top = lerp(pts[0], pts[1], u)
                val bot = lerp(pts[3], pts[2], u)
                val p = lerp(top, bot, v)
                if (j == 0) gp.moveTo(p.first, p.second) else gp.lineTo(p.first, p.second)
            }
            canvas.drawPath(gp, gridPaint)
            val gq = Path()
            for (k in 0..12) {
                val u = k / 12f
                val v = i / n.toFloat()
                val top = lerp(pts[0], pts[1], u)
                val bot = lerp(pts[3], pts[2], u)
                val p = lerp(top, bot, v)
                if (k == 0) gq.moveTo(p.first, p.second) else gq.lineTo(p.first, p.second)
            }
            canvas.drawPath(gq, gridPaint)
        }

        val labels = arrayOf("HG", "HD", "BD", "BG")
        pts.forEachIndexed { i, p ->
            canvas.drawCircle(p.first, p.second, handleR, if (i == drag) handleHot else handlePaint)
            canvas.drawText(labels[i], p.first + handleR + 4, p.second - 6, labelPaint)
        }
    }

    private fun lerp(a: Pair<Float, Float>, b: Pair<Float, Float>, t: Float) =
        Pair(a.first + (b.first - a.first) * t, a.second + (b.second - a.second) * t)

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val c = corners ?: return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                var best = -1
                var bd = handleR * 1.8f
                c.forEachIndexed { i, p ->
                    val (vx, vy) = toView(p[0], p[1])
                    val d = hypot(event.x - vx, event.y - vy)
                    if (d < bd) { bd = d; best = i }
                }
                drag = best
                invalidate()
                return best >= 0
            }
            MotionEvent.ACTION_MOVE -> {
                if (drag >= 0) {
                    val (bx, by) = toBitmap(event.x, event.y)
                    c[drag][0] = bx
                    c[drag][1] = by
                    invalidate()
                }
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                drag = -1
                invalidate()
                return true
            }
        }
        return super.onTouchEvent(event)
    }
}
