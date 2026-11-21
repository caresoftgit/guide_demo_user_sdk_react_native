import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Modal,PermissionsAndroid,Platform,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {CustomerVoice,CustomerVoiceError,type VoiceState} from '@caresoft/customer-voice-react-native';
import config from './src/voice.config.json';
import {homeModel} from './src/home';
import {createCallAttempt} from './src/callAttempt';
import {createEnterpriseSession} from './src/enterpriseSession';

const enterprise=createEnterpriseSession(config.enterpriseBackendUrl,CustomerVoice);
const configured=!!config.accountId&&!!config.appId&&/^https:\/\//.test(config.backendUrl)&&/^\+?[0-9]{1,32}$/.test(config.businessNumber)&&/^https:\/\//.test(config.enterpriseBackendUrl);
const messages:Record<string,string>={HOST_LOGOUT_PENDING:'Đã đăng xuất Voice trên máy. Host chưa nhận yêu cầu thu hồi. Bấm thử lại khi có mạng.',ENTERPRISE_REQUEST_FAILED:'Đăng nhập doanh nghiệp thất bại. Kiểm tra tài khoản fixture hoặc kết nối host.',NATIVE_BOOTSTRAP_REQUIRED:'Ứng dụng chưa cấu hình Voice SDK. Hãy kiểm tra cấu hình native.',CONFIGURATION_MISMATCH:'Cấu hình ứng dụng và native chưa khớp. Hãy build lại.',LOGIN_REQUIRED:'Bạn cần đăng nhập để sử dụng.',UNAUTHORIZED:'Thông tin đăng nhập không hợp lệ.',MICROPHONE_PERMISSION_REQUIRED:'Bạn cần cấp quyền micro.',NETWORK_RECOVERY_TIMEOUT:'Cuộc gọi đã kết thúc vì không thể khôi phục kết nối.',LOGOUT_REVOKE_UNCONFIRMED:'Đã đăng xuất trên máy. Chưa xác nhận thu hồi phiên phía server.',NATIVE_MODULE_NOT_LINKED:'SDK native chưa được liên kết. Hãy cài Pods và build lại ứng dụng.'};
export default function App(){
 const [state,setState]=useState<VoiceState>();const [callBlocked,setCallBlocked]=useState(true);
 const acceptState=useCallback((next:VoiceState)=>setState(previous=>previous&&previous.revision>=next.revision?previous:next),[]);
 const attempt=useRef(createCallAttempt(()=>CustomerVoice.call(config.businessNumber),async()=>{acceptState(await CustomerVoice.synchronize())},setCallBlocked,true)).current;const [busy,setBusy]=useState(false);const lock=useRef(false);
 const [error,setError]=useState('');const [loginOpen,setLoginOpen]=useState(false);const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [fullScreen,setFullScreen]=useState(true);
 const model=homeModel(state,busy||callBlocked,configured);
 const showError=(e:unknown)=>setError(messages[(e as CustomerVoiceError)?.code]??'Không thực hiện được. Kiểm tra kết nối và thử lại.');
 async function action(operation:()=>Promise<unknown>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await operation()}catch(e){showError(e)}finally{lock.current=false;setBusy(false)}}
 const closeLogin=()=>{setPassword('');setLoginOpen(false)};
 useEffect(()=>{
  let off=()=>{};let events=()=>{};
  try{off=CustomerVoice.subscribeState(acceptState);events=CustomerVoice.subscribeEvents(e=>{if(e.type==='error')showError({code:e.code})});if(configured)void CustomerVoice.initialize({...config,pushEnvironment:config.pushEnvironment==='sandbox'?'sandbox':'production'}).then(()=>attempt.synchronize()).catch(e=>{if(e.code!=='LOGIN_REQUIRED')showError(e)})}catch(e){showError(e)}
  const sub=AppState.addEventListener('change',status=>{if(status==='active'&&configured){void CustomerVoice.resume().catch(showError);void CustomerVoice.canShowIncomingScreen().then(setFullScreen).catch(()=>{})}});
  void CustomerVoice.canShowIncomingScreen().then(setFullScreen).catch(()=>{});
  return()=>{off();events();sub.remove()};
 },[acceptState,attempt]);
 async function permissions(){
  await CustomerVoice.requestMicrophonePermission();
  if(Platform.OS==='android'&&Number(Platform.Version)>=33)await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  await CustomerVoice.resume();await CustomerVoice.checkReadiness();
 }
 return <SafeAreaView style={s.page}><StatusBar barStyle="dark-content"/><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <View style={s.brand}><Text style={s.logo}>caresoft</Text><Text style={s.subtitle}>Kết nối để phục vụ tốt hơn</Text></View>
  <Text style={s.title}>Trung tâm hỗ trợ</Text><Text style={s.description}>Trao đổi trực tiếp với bộ phận chăm sóc khách hàng.</Text>
  <View style={s.card}><View style={s.row}><View style={[s.dot,{backgroundColor:model.canCall?'#18a875':'#e6a443'}]}/><Text style={s.status}>{model.status}</Text></View>
   {state?.sessionState.status==='authenticated'&&<Text style={s.detail}>Khách hàng: {state.sessionState.session.userId}</Text>}
   <Text style={s.detail}>{model.activeCallId?'Cuộc gọi vẫn tiếp tục khi bạn rời màn hình gọi':model.canReceive?'Đã sẵn sàng nhận cuộc gọi':'Chưa sẵn sàng nhận cuộc gọi'}</Text>
   {model.showReadinessHint&&<Text style={s.hint}>Kiểm tra quyền micro, thông báo và kết nối để sẵn sàng.</Text>}
  </View>
  {model.activeCallId&&<Pressable accessibilityRole="button" testID="return-to-call" disabled={busy} style={s.call} onPress={()=>action(()=>CustomerVoice.showCall(model.activeCallId!))}><Text style={s.phone}>☎</Text><Text style={s.callLabel}>Quay lại cuộc gọi</Text><Text style={s.callHint}>Mở màn hình cuộc gọi đang diễn ra</Text></Pressable>}
  {!model.activeCallId&&<Pressable accessibilityRole="button" testID="call-support" disabled={!model.canCall} style={[s.call,!model.canCall&&s.disabled]} onPress={()=>action(()=>attempt.call())}><Text style={s.phone}>☎</Text><Text style={s.callLabel}>Gọi CSKH</Text><Text style={s.callHint}>Chúng tôi luôn sẵn sàng lắng nghe</Text></Pressable>}
  {!configured&&<Text style={s.hint}>Điền cấu hình của ứng dụng theo README, chạy npm run configure rồi build lại demo.</Text>}
  {callBlocked&&!busy&&model.loggedIn&&<Pressable style={s.secondary} onPress={()=>action(()=>attempt.synchronize())}><Text style={s.link}>Đồng bộ cuộc gọi trước khi gọi tiếp</Text></Pressable>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {busy&&<ActivityIndicator color="#1672d4"/>}
  <Pressable accessibilityRole="button" disabled={busy||!configured} style={s.secondary} onPress={()=>model.loggedIn?Alert.alert('Đăng xuất','Kết thúc phiên và các cuộc gọi trên thiết bị này?',[{text:'Hủy',style:'cancel'},{text:'Đăng xuất',style:'destructive',onPress:()=>action(()=>enterprise.logout())}]):setLoginOpen(true)}><Text style={s.link}>{model.loggedIn?'Đăng xuất':'Đăng nhập'}</Text></Pressable>
  {enterprise.pendingLogout&&<Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={()=>action(()=>enterprise.retryLogout())}><Text style={s.link}>Thử lại đăng xuất doanh nghiệp</Text></Pressable>}
  {configured&&<Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={()=>action(permissions)}><Text style={s.link}>Cấp quyền micro và thông báo</Text></Pressable>}
  {!fullScreen&&configured&&<Pressable style={s.secondary} onPress={()=>action(()=>CustomerVoice.requestIncomingScreenPermission())}><Text style={s.link}>Cho phép cuộc gọi trên màn hình khóa</Text></Pressable>}
  <Text style={s.footer}>Customer Voice · React Native · 0.5.0</Text>
 </ScrollView>
 <Modal visible={loginOpen} transparent animationType="fade" onRequestClose={closeLogin}><View style={s.overlay}><View style={s.dialog}><Text style={s.dialogTitle}>Đăng nhập doanh nghiệp</Text><Text style={s.description}>Tài khoản fixture phát triển được cấu hình trên host mô phỏng.</Text>
  <TextInput accessibilityLabel="Enterprise username" placeholder="Tên đăng nhập fixture" autoCapitalize="none" value={username} onChangeText={setUsername} style={s.input}/>
  <TextInput accessibilityLabel="Enterprise password" placeholder="Mật khẩu fixture" secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} style={s.input}/>
  <View style={s.row}><Pressable style={s.secondary} disabled={busy} onPress={closeLogin}><Text style={s.link}>Hủy</Text></Pressable><Pressable style={s.secondary} disabled={busy||!username||!password} onPress={()=>{const captured=password;closeLogin();void action(async()=>{await enterprise.login(username,captured);await attempt.synchronize()})}}><Text style={s.link}>Đăng nhập</Text></Pressable></View>
 </View></View></Modal></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f5f8fc'},content:{padding:24,paddingTop:36,maxWidth:560,width:'100%',alignSelf:'center',gap:18},brand:{alignItems:'center',paddingBottom:18},logo:{fontSize:35,fontWeight:'800',color:'#1473c9',letterSpacing:-1.5},subtitle:{fontSize:11,color:'#6c7b8d',marginTop:3},title:{fontSize:27,fontWeight:'700',color:'#172b46'},description:{fontSize:15,lineHeight:22,color:'#687a91'},card:{padding:21,borderRadius:20,backgroundColor:'#fff',gap:10},row:{flexDirection:'row',alignItems:'center',gap:10},dot:{width:9,height:9,borderRadius:5},status:{fontSize:16,fontWeight:'600',color:'#223852'},detail:{fontSize:14,color:'#60748d'},hint:{fontSize:13,color:'#73849b',lineHeight:20},call:{backgroundColor:'#1473c9',alignItems:'center',padding:26,borderRadius:24,gap:7},disabled:{opacity:0.4},phone:{color:'#fff',fontSize:36},callLabel:{fontSize:22,fontWeight:'700',color:'#fff'},callHint:{fontSize:13,color:'#e5f1fe'},secondary:{padding:12,alignItems:'center'},link:{color:'#1473c9',fontSize:15,fontWeight:'600'},error:{color:'#b12d3b',fontSize:14,lineHeight:21},footer:{fontSize:12,color:'#91a0b4',textAlign:'center',marginTop:15},overlay:{flex:1,backgroundColor:'#0008',justifyContent:'center',padding:24},dialog:{backgroundColor:'white',padding:24,borderRadius:22,gap:16},dialogTitle:{fontSize:21,fontWeight:'700',color:'#172b46'},input:{borderWidth:1,borderColor:'#d8e2ee',borderRadius:11,padding:14,fontSize:16,color:'#172b46'}});
