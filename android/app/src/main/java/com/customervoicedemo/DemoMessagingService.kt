package com.customervoicedemo
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import vn.caresoft.customervoice.reactnative.VoiceBootstrap
class DemoMessagingService: FirebaseMessagingService() {
 override fun onMessageReceived(message: RemoteMessage) {if(!VoiceBootstrap.handleRemoteMessage(message.data)){/* Dispatch non-voice data to host features. */}}
 override fun onNewToken(token: String) {VoiceBootstrap.onNewPushToken(token)}
}
