package com.habib256.pagedroit

import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/** Keep all chrome above the system nav / status bars (3-button bar included). */
fun ComponentActivity.padForSystemBars(root: View) {
    enableEdgeToEdge()
    val extra = (10 * resources.displayMetrics.density).toInt()
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
        v.setPadding(bars.left, bars.top, bars.right, bars.bottom + extra)
        insets
    }
    ViewCompat.requestApplyInsets(root)
}
