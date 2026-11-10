// GENERATED from frontend/tokens/tokens.json by tools/gen-tokens.mjs. Do not edit by hand.
// The same semantic tokens as frontend/src/assets/tokens.css, for Jetpack Compose, Glance (widget)
// and the View-based capture overlay. The Android app copies this file unchanged.
package com.agenticreach.runway.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class Font { SANS, SERIF, MONO } // res/font: space_grotesk, fraunces_italic, jetbrains_mono

data class TypeToken(val font: Font, val weight: Int, val size: TextUnit, val lineHeight: Float, val trackingEm: Float)

object RunwayTokens {
    object Light {
        val bg = Color(0xFFFBF6EE) // #fbf6ee
        val surface = Color(0xFFFFFFFF) // #ffffff
        val sunk = Color(0xFFF4ECE0) // #f4ece0
        val cool = Color(0xFFF1EEF4) // #f1eef4
        val text = Color(0xFF1B1428) // #1b1428
        val mute = Color(0x9E1B1428) // #1b1428 @ 62%
        val soft = Color(0x661B1428) // #1b1428 @ 40%
        val rule = Color(0x1A1B1428) // #1b1428 @ 10%
        val ruleStrong = Color(0x331B1428) // #1b1428 @ 20%
        val hover = Color(0x0A1B1428) // #1b1428 @ 4%
        val press = Color(0x0D1B1428) // #1b1428 @ 5%
        val focus = Color(0x1F3D2B5C) // #3d2b5c @ 12%
        val select = Color(0x2E3D2B5C) // #3d2b5c @ 18%
        val accent = Color(0xFF3D2B5C) // #3d2b5c
        val action = Color(0xFFFF7A6B) // #ff7a6b
        val onAction = Color(0xFF1B1428) // #1b1428
        val marker = Color(0xFFF4C84A) // #f4c84a
        val overdue = Color(0xFFA45150) // #a45150
        val overdueMark = Color(0xFFFF7A6B) // #ff7a6b
        val overdueEdge = Color(0xFFFF7A6B) // #ff7a6b
        val strike = Color(0xFFFF7A6B) // #ff7a6b
        val inverse = Color(0xFF1B1428) // #1b1428
        val onInverse = Color(0xFFFBF6EE) // #fbf6ee
        val inverseAction = Color(0xFFFF7A6B) // #ff7a6b
        val inkA = Color(0xFFFF7A6B) // #ff7a6b
        val inkB = Color(0xFF3D2B5C) // #3d2b5c
        val scrim = Color(0x661B1428) // #1b1428 @ 40%
        val kbd = Color(0xFFE5DDD3) // #e5ddd3
        val key = Color(0xFFFFFFFF) // #ffffff
        val swipe = Color(0xFFFCE2D9) // #fce2d9
    }

    object Dark {
        val bg = Color(0xFF1B1428) // #1b1428
        val surface = Color(0xFF2B2436) // #2b2436
        val sunk = Color(0xFF241D30) // #241d30
        val cool = Color(0xFF271C3A) // #271c3a
        val text = Color(0xFFFBF6EE) // #fbf6ee
        val mute = Color(0xB3FBF6EE) // #fbf6ee @ 70%
        val soft = Color(0x80FBF6EE) // #fbf6ee @ 50%
        val rule = Color(0x1FFBF6EE) // #fbf6ee @ 12%
        val ruleStrong = Color(0x38FBF6EE) // #fbf6ee @ 22%
        val hover = Color(0x0DFBF6EE) // #fbf6ee @ 5%
        val press = Color(0x0FFBF6EE) // #fbf6ee @ 6%
        val focus = Color(0x29A69BAC) // #a69bac @ 16%
        val select = Color(0x57A69BAC) // #a69bac @ 34%
        val accent = Color(0xFFA69BAC) // #a69bac
        val action = Color(0xFFFF7A6B) // #ff7a6b
        val onAction = Color(0xFF1B1428) // #1b1428
        val marker = Color(0xFFF4C84A) // #f4c84a
        val overdue = Color(0xFFFF7A6B) // #ff7a6b
        val overdueMark = Color(0xFFFF7A6B) // #ff7a6b
        val overdueEdge = Color(0xFFFF7A6B) // #ff7a6b
        val strike = Color(0xFFFF7A6B) // #ff7a6b
        val inverse = Color(0xFFFBF6EE) // #fbf6ee
        val onInverse = Color(0xFF1B1428) // #1b1428
        val inverseAction = Color(0xFFA45150) // #a45150
        val inkA = Color(0xFFFF7A6B) // #ff7a6b
        val inkB = Color(0xFFA69BAC) // #a69bac
        val scrim = Color(0xB31B1428) // #1b1428 @ 70%
        val kbd = Color(0xFF2F283A) // #2f283a
        val key = Color(0xFF413A4A) // #413a4a
        val swipe = Color(0xFF4D2A37) // #4d2a37
    }

    object Type {
        val display = TypeToken(Font.SANS, 500, 32.sp, 1.04f, -0.03f)
        val title = TypeToken(Font.SANS, 500, 22.sp, 1.2f, -0.015f)
        val row = TypeToken(Font.SANS, 400, 16.sp, 1.4f, -0.005f)
        val body = TypeToken(Font.SANS, 400, 15.sp, 1.55f, 0f)
        val meta = TypeToken(Font.MONO, 400, 12.sp, 1.35f, 0.02f)
        val eyebrow = TypeToken(Font.MONO, 400, 11.sp, 1.3f, 0.06f)
    }

    object Radius {
        val sm = 8.dp
        val md = 12.dp
        val lg = 18.dp
        val xl = 22.dp
        // pill = RoundedCornerShape(percent = 50)
    }

    object Size {
        val row = 56.dp
        val touch = 48.dp
        val ring = 22.dp
    }

    object Motion {
        val ease = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)
        const val FAST_MS = 120
        const val BASE_MS = 180
        const val SLOW_MS = 260
        const val STRIKE_MS = 260
        const val STRIKE_HOLD_MS = 380
        const val COLLAPSE_MS = 180
        const val NOTICE_MS = 120
        const val UNDO_MS = 6000
        const val BLOOM_MS = 2400
        const val SETTLE_MS = 800
    }
}
