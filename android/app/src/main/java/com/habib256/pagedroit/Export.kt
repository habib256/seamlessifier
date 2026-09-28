package com.habib256.pagedroit

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Export {

    private fun stamp(): String =
        SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())

    fun savePng(context: Context, bmp: Bitmap): Uri? {
        val name = "PageDroit_${stamp()}.png"
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
            if (Build.VERSION.SDK_INT >= 29) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/PageDroit")
            }
        }
        val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            ?: return null
        context.contentResolver.openOutputStream(uri)?.use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            ?: return null
        return uri
    }

    fun savePdf(context: Context, bmp: Bitmap): Uri? {
        val name = "PageDroit_${stamp()}.pdf"
        val doc = PdfDocument()
        val pageW = 595
        val pageH = 842
        val page = doc.startPage(PdfDocument.PageInfo.Builder(pageW, pageH, 1).create())
        val margin = 28f
        val availW = pageW - margin * 2
        val availH = pageH - margin * 2
        val scale = minOf(availW / bmp.width, availH / bmp.height)
        val dw = bmp.width * scale
        val dh = bmp.height * scale
        val left = margin + (availW - dw) / 2f
        val top = margin + (availH - dh) / 2f
        page.canvas.drawBitmap(
            bmp,
            null,
            android.graphics.RectF(left, top, left + dw, top + dh),
            Paint(Paint.FILTER_BITMAP_FLAG)
        )
        doc.finishPage(page)

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
            if (Build.VERSION.SDK_INT >= 29) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOCUMENTS + "/PageDroit")
            }
        }
        val collection = if (Build.VERSION.SDK_INT >= 29) {
            MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        } else {
            MediaStore.Files.getContentUri("external")
        }
        val uri = context.contentResolver.insert(collection, values) ?: run {
            doc.close()
            return null
        }
        context.contentResolver.openOutputStream(uri)?.use { doc.writeTo(it) }
        doc.close()
        return uri
    }

    fun cachePng(context: Context, bmp: Bitmap): Uri {
        val file = File(context.cacheDir, "share_${stamp()}.png")
        FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    }

    fun cachePdf(context: Context, bmp: Bitmap): Uri {
        val file = File(context.cacheDir, "share_${stamp()}.pdf")
        val doc = PdfDocument()
        val pageW = 595
        val pageH = 842
        val page = doc.startPage(PdfDocument.PageInfo.Builder(pageW, pageH, 1).create())
        val margin = 28f
        val availW = pageW - margin * 2
        val availH = pageH - margin * 2
        val scale = minOf(availW / bmp.width, availH / bmp.height)
        val dw = bmp.width * scale
        val dh = bmp.height * scale
        val left = margin + (availW - dw) / 2f
        val top = margin + (availH - dh) / 2f
        page.canvas.drawBitmap(
            bmp,
            null,
            android.graphics.RectF(left, top, left + dw, top + dh),
            Paint(Paint.FILTER_BITMAP_FLAG)
        )
        doc.finishPage(page)
        FileOutputStream(file).use { doc.writeTo(it) }
        doc.close()
        return FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    }

    fun share(context: Context, uri: Uri, mime: String, subject: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, subject)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, context.getString(R.string.send_via)))
    }
}
