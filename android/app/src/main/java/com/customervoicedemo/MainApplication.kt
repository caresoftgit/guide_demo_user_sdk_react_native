package com.customervoicedemo

import android.app.Application
import org.json.JSONObject
import vn.caresoft.customervoice.reactnative.VoiceBootstrap
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    val config=JSONObject(assets.open("voice_config.json").bufferedReader().use {it.readText()})
    if(config.optString("accountId").isNotBlank() && config.optString("appId").isNotBlank()) {
      VoiceBootstrap.initialize(this,config.getString("backendUrl"),config.getString("accountId"),config.getString("appId"),config.optString("supportName","Chăm sóc khách hàng"))
      val firebase=config.optJSONObject("firebase")
      if(firebase!=null && firebase.optString("appId").isNotBlank()) {
        if(FirebaseApp.getApps(this).isEmpty()) FirebaseApp.initializeApp(this,FirebaseOptions.Builder().setApplicationId(firebase.getString("appId")).setApiKey(firebase.getString("apiKey")).setProjectId(firebase.getString("projectId")).setGcmSenderId(firebase.getString("senderId")).build())
        FirebaseMessaging.getInstance().token.addOnSuccessListener {VoiceBootstrap.onNewPushToken(it)}
      }
    }
    loadReactNative(this)
  }
}
