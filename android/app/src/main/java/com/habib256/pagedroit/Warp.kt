package com.habib256.pagedroit

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

object Warp {

    fun rotate90(src: Bitmap, clockwise: Boolean): Bitmap {
        val m = Matrix().apply { postRotate(if (clockwise) 90f else -90f) }
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }

    fun rip(src: Bitmap, corners: Array<FloatArray>, outW: Int, outH: Int): Bitmap {
        val sw = src.width
        val sh = src.height
        val spx = IntArray(sw * sh)
        src.getPixels(spx, 0, sw, 0, 0, sw, sh)
        val h = Homography.ofCorners(corners)
        val out = IntArray(outW * outH)
        val ow = (outW).toDouble()
        val oh = (outH).toDouble()
        for (y in 0 until outH) {
            val v = (y + 0.5) / oh
            val row = y * outW
            for (x in 0 until outW) {
                val u = (x + 0.5) / ow
                val (sx, sy) = Homography.apply(h, u, v)
                out[row + x] = sampleBilinear(spx, sw, sh, sx, sy)
            }
        }
        return Bitmap.createBitmap(out, outW, outH, Bitmap.Config.ARGB_8888)
    }

    private fun sampleBilinear(px: IntArray, w: Int, h: Int, x: Double, y: Double): Int {
        val cx = x.coerceIn(0.0, w - 1.0001)
        val cy = y.coerceIn(0.0, h - 1.0001)
        val x0 = cx.toInt()
        val y0 = cy.toInt()
        val x1 = if (x0 + 1 < w) x0 + 1 else x0
        val y1 = if (y0 + 1 < h) y0 + 1 else y0
        val fx = cx - x0
        val fy = cy - y0
        val c00 = px[y0 * w + x0]
        val c10 = px[y0 * w + x1]
        val c01 = px[y1 * w + x0]
        val c11 = px[y1 * w + x1]
        val w00 = (1 - fx) * (1 - fy)
        val w10 = fx * (1 - fy)
        val w01 = (1 - fx) * fy
        val w11 = fx * fy
        fun ch(c: Int, shift: Int) = (c ushr shift) and 0xFF
        fun mix(shift: Int): Int {
            val v = ch(c00, shift) * w00 + ch(c10, shift) * w10 +
                ch(c01, shift) * w01 + ch(c11, shift) * w11
            return v.roundToInt().coerceIn(0, 255)
        }
        return Color.argb(255, mix(16), mix(8), mix(0))
    }
}

/** Unsharp mask: out = src + amount * (src − boxBlur(src)). */
object Sharpen {

    fun unsharp(src: Bitmap, amount: Float): Bitmap {
        if (amount <= 0.01f) return src
        val w = src.width
        val h = src.height
        val px = IntArray(w * h)
        src.getPixels(px, 0, w, 0, 0, w, h)
        val blur = boxBlur(px, w, h, radius = 2, passes = 2)
        val out = IntArray(w * h)
        val a = amount.coerceIn(0f, 2.5f)
        for (i in px.indices) {
            val s = px[i]
            val b = blur[i]
            fun ch(c: Int, sh: Int) = (c ushr sh) and 0xFF
            fun mix(sh: Int): Int {
                val sv = ch(s, sh)
                val bv = ch(b, sh)
                return (sv + a * (sv - bv)).roundToInt().coerceIn(0, 255)
            }
            out[i] = Color.argb(255, mix(16), mix(8), mix(0))
        }
        return Bitmap.createBitmap(out, w, h, Bitmap.Config.ARGB_8888)
    }

    private fun boxBlur(src: IntArray, w: Int, h: Int, radius: Int, passes: Int): IntArray {
        var a = FloatArray(w * h * 3)
        val b = FloatArray(w * h * 3)
        for (p in 0 until w * h) {
            val c = src[p]
            a[p * 3] = ((c ushr 16) and 0xFF).toFloat()
            a[p * 3 + 1] = ((c ushr 8) and 0xFF).toFloat()
            a[p * 3 + 2] = (c and 0xFF).toFloat()
        }
        repeat(passes) {
            blurH(a, b, w, h, radius)
            blurV(b, a, w, h, radius)
        }
        val out = IntArray(w * h)
        for (p in 0 until w * h) {
            out[p] = Color.argb(
                255,
                a[p * 3].roundToInt().coerceIn(0, 255),
                a[p * 3 + 1].roundToInt().coerceIn(0, 255),
                a[p * 3 + 2].roundToInt().coerceIn(0, 255)
            )
        }
        return out
    }

    private fun idx(i: Int, n: Int) = max(0, min(n - 1, i))

    private fun blurH(inp: FloatArray, out: FloatArray, w: Int, h: Int, radius: Int) {
        val win = radius * 2 + 1f
        for (y in 0 until h) {
            val row = y * w
            for (c in 0..2) {
                var sum = 0f
                for (k in -radius..radius) sum += inp[(row + idx(k, w)) * 3 + c]
                for (x in 0 until w) {
                    out[(row + x) * 3 + c] = sum / win
                    val add = idx(x + radius + 1, w)
                    val sub = idx(x - radius, w)
                    sum += inp[(row + add) * 3 + c] - inp[(row + sub) * 3 + c]
                }
            }
        }
    }

    private fun blurV(inp: FloatArray, out: FloatArray, w: Int, h: Int, radius: Int) {
        val win = radius * 2 + 1f
        for (x in 0 until w) {
            for (c in 0..2) {
                var sum = 0f
                for (k in -radius..radius) sum += inp[(idx(k, h) * w + x) * 3 + c]
                for (y in 0 until h) {
                    out[(y * w + x) * 3 + c] = sum / win
                    val add = idx(y + radius + 1, h)
                    val sub = idx(y - radius, h)
                    sum += inp[(add * w + x) * 3 + c] - inp[(sub * w + x) * 3 + c]
                }
            }
        }
    }
}
