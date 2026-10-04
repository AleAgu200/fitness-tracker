package com.pulsofitness.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.pulsofitness.wear.data.WatchRepository
import com.pulsofitness.wear.ui.PulsoWearScreen

class MainActivity : ComponentActivity() {
    private val repository by lazy { WatchRepository.get(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { PulsoWearScreen(repository) }
    }

    override fun onStart() {
        super.onStart()
        repository.start()
    }

    override fun onStop() {
        repository.stop()
        super.onStop()
    }
}
