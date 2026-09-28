package com.habib256.pagedroit

/**
 * Projective transform — port of js/util.js computeHomography / applyHomography.
 * Maps a normalised [0,1]×[0,1] rectangle onto four corners (TL, TR, BR, BL).
 */
object Homography {

    fun ofCorners(corners: Array<FloatArray>): DoubleArray {
        val from = arrayOf(
            doubleArrayOf(0.0, 0.0),
            doubleArrayOf(1.0, 0.0),
            doubleArrayOf(1.0, 1.0),
            doubleArrayOf(0.0, 1.0)
        )
        val to = Array(4) { i ->
            doubleArrayOf(corners[i][0].toDouble(), corners[i][1].toDouble())
        }
        return compute(from, to)
    }

    fun compute(from: Array<DoubleArray>, to: Array<DoubleArray>): DoubleArray {
        val a = Array(8) { DoubleArray(8) }
        val b = DoubleArray(8)
        for (i in 0 until 4) {
            val X = from[i][0]
            val Y = from[i][1]
            val x = to[i][0]
            val y = to[i][1]
            val r0 = i * 2
            val r1 = r0 + 1
            a[r0][0] = X; a[r0][1] = Y; a[r0][2] = 1.0
            a[r0][3] = 0.0; a[r0][4] = 0.0; a[r0][5] = 0.0
            a[r0][6] = -X * x; a[r0][7] = -Y * x
            b[r0] = x
            a[r1][0] = 0.0; a[r1][1] = 0.0; a[r1][2] = 0.0
            a[r1][3] = X; a[r1][4] = Y; a[r1][5] = 1.0
            a[r1][6] = -X * y; a[r1][7] = -Y * y
            b[r1] = y
        }
        val s = solve(a, b)
        return doubleArrayOf(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], 1.0)
    }

    fun apply(h: DoubleArray, x: Double, y: Double): Pair<Double, Double> {
        val d = h[6] * x + h[7] * y + h[8]
        return Pair((h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d)
    }

    private fun solve(aIn: Array<DoubleArray>, bIn: DoubleArray): DoubleArray {
        val n = bIn.size
        val m = Array(n) { i -> DoubleArray(n + 1) { j -> if (j < n) aIn[i][j] else bIn[i] } }
        for (col in 0 until n) {
            var piv = col
            for (r in col + 1 until n) {
                if (kotlin.math.abs(m[r][col]) > kotlin.math.abs(m[piv][col])) piv = r
            }
            val tmp = m[col]; m[col] = m[piv]; m[piv] = tmp
            var pv = m[col][col]
            if (kotlin.math.abs(pv) < 1e-12) pv = 1e-12
            for (c in col..n) m[col][c] /= pv
            for (r2 in 0 until n) {
                if (r2 == col) continue
                val f = m[r2][col]
                for (c2 in col..n) m[r2][c2] -= f * m[col][c2]
            }
        }
        return DoubleArray(n) { k -> m[k][n] }
    }

    fun defaultCorners(w: Int, h: Int): Array<FloatArray> {
        val mx = w * 0.12f
        val my = h * 0.12f
        return arrayOf(
            floatArrayOf(mx, my),
            floatArrayOf(w - mx, my),
            floatArrayOf(w - mx, h - my),
            floatArrayOf(mx, h - my)
        )
    }

    fun suggestSize(corners: Array<FloatArray>, maxSide: Int = 2000): Pair<Int, Int> {
        fun dist(a: FloatArray, b: FloatArray): Float {
            val dx = a[0] - b[0]; val dy = a[1] - b[1]
            return kotlin.math.hypot(dx, dy)
        }
        val w = (dist(corners[0], corners[1]) + dist(corners[3], corners[2])) / 2f
        val h = (dist(corners[0], corners[3]) + dist(corners[1], corners[2])) / 2f
        val scale = if (maxOf(w, h) > maxSide) maxSide / maxOf(w, h) else 1f
        return Pair(
            (w * scale).toInt().coerceIn(320, maxSide),
            (h * scale).toInt().coerceIn(320, maxSide)
        )
    }
}
