package com.habib256.pagedroit

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.widget.SeekBar
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.habib256.pagedroit.databinding.ActivityResultBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ResultActivity : AppCompatActivity() {

    private lateinit var binding: ActivityResultBinding
    private var warped: Bitmap? = null
    private var shown: Bitmap? = null
    private var sharpenJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityResultBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val path = intent.getStringExtra(EXTRA_PATH) ?: run { finish(); return }
        warped = BitmapFactory.decodeFile(path)
        if (warped == null) {
            Toast.makeText(this, R.string.load_failed, Toast.LENGTH_LONG).show()
            finish()
            return
        }
        binding.lblSharp.text = getString(R.string.sharpness, binding.seekSharp.progress)
        applySharpen(binding.seekSharp.progress / 100f)

        binding.seekSharp.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) {
                binding.lblSharp.text = getString(R.string.sharpness, p)
                if (fromUser) applySharpen(p / 100f)
            }
            override fun onStartTrackingTouch(s: SeekBar?) {}
            override fun onStopTrackingTouch(s: SeekBar?) {}
        })

        binding.btnPng.setOnClickListener {
            val bmp = shown ?: return@setOnClickListener
            val uri = Export.savePng(this, bmp)
            toastSaved(uri != null, getString(R.string.saved_png))
        }
        binding.btnPdf.setOnClickListener {
            val bmp = shown ?: return@setOnClickListener
            val uri = Export.savePdf(this, bmp)
            toastSaved(uri != null, getString(R.string.saved_pdf))
        }
        binding.btnEmail.setOnClickListener {
            val bmp = shown ?: return@setOnClickListener
            val asPdf = binding.chkPdf.isChecked
            val uri = if (asPdf) Export.cachePdf(this, bmp) else Export.cachePng(this, bmp)
            val mime = if (asPdf) "application/pdf" else "image/png"
            Export.share(this, uri, mime, getString(R.string.email_subject))
        }
        binding.btnAgain.setOnClickListener { finish() }
    }

    private fun applySharpen(amount: Float) {
        val src = warped ?: return
        sharpenJob?.cancel()
        sharpenJob = lifecycleScope.launch {
            val out = withContext(Dispatchers.Default) { Sharpen.unsharp(src, amount * 1.6f) }
            shown?.takeIf { it !== src && it !== out }?.recycle()
            shown = out
            binding.preview.setImageBitmap(out)
        }
    }

    private fun toastSaved(ok: Boolean, msg: String) {
        Toast.makeText(this, if (ok) msg else getString(R.string.save_failed), Toast.LENGTH_LONG).show()
    }

    companion object {
        const val EXTRA_PATH = "path"
    }
}
