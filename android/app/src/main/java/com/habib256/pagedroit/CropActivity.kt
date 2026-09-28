package com.habib256.pagedroit

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.habib256.pagedroit.databinding.ActivityCropBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max

class CropActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCropBinding
    private var source: Bitmap? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCropBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val uri = intent.getStringExtra(EXTRA_URI)?.let { Uri.parse(it) }
        if (uri == null) {
            finish()
            return
        }

        lifecycleScope.launch {
            val bmp = withContext(Dispatchers.IO) { decodeSampled(uri, 2400) }
            if (bmp == null) {
                Toast.makeText(this@CropActivity, R.string.load_failed, Toast.LENGTH_LONG).show()
                finish()
                return@launch
            }
            source = bmp
            binding.quad.bitmap = bmp
        }

        binding.btnReset.setOnClickListener { binding.quad.resetCorners() }
        binding.btnStraighten.setOnClickListener { straighten() }
    }

    private fun straighten() {
        val bmp = source ?: return
        val corners = binding.quad.corners ?: return
        binding.progress.visibility = View.VISIBLE
        binding.btnStraighten.isEnabled = false
        lifecycleScope.launch {
            val file = withContext(Dispatchers.Default) {
                val (ow, oh) = Homography.suggestSize(corners, 2000)
                val copy = Array(4) { i -> floatArrayOf(corners[i][0], corners[i][1]) }
                val warped = Warp.rip(bmp, copy, ow, oh)
                val out = File(cacheDir, "warped.png")
                FileOutputStream(out).use { warped.compress(Bitmap.CompressFormat.PNG, 100, it) }
                warped.recycle()
                out
            }
            binding.progress.visibility = View.GONE
            binding.btnStraighten.isEnabled = true
            startActivity(
                Intent(this@CropActivity, ResultActivity::class.java)
                    .putExtra(ResultActivity.EXTRA_PATH, file.absolutePath)
            )
        }
    }

    private fun decodeSampled(uri: Uri, maxSide: Int): Bitmap? {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            val side = max(bounds.outWidth, bounds.outHeight)
            while (side / sample > maxSide) sample *= 2
            val opts = BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        const val EXTRA_URI = "uri"
    }
}
