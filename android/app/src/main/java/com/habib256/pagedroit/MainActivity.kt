package com.habib256.pagedroit

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.habib256.pagedroit.databinding.ActivityMainBinding
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var captureUri: Uri? = null

    private val takePicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) captureUri?.let { openCrop(it) }
        else Toast.makeText(this, R.string.capture_cancelled, Toast.LENGTH_SHORT).show()
    }

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) openCrop(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnCamera.setOnClickListener {
            val file = File(cacheDir, "capture.jpg")
            val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
            captureUri = uri
            takePicture.launch(uri)
        }
        binding.btnGallery.setOnClickListener {
            pickImage.launch("image/*")
        }
    }

    private fun openCrop(uri: Uri) {
        startActivity(Intent(this, CropActivity::class.java).putExtra(CropActivity.EXTRA_URI, uri.toString()))
    }
}
