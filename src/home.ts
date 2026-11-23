import type {VoiceState} from '@caresoft/customer-voice-react-native';
export function homeModel(state:VoiceState|undefined,busy:boolean,configured:boolean){
 const loggedIn=state?.sessionState.status==='authenticated';
 const activeCallId=state?.calls.filter(call=>call.presentable).at(-1)?.callId;
 const reconnecting=Object.values(state?.connectionStates??{}).includes('RECONNECTING');
 return {
  loggedIn,activeCallId,
  canCall:configured&&!busy&&!activeCallId&&!!state?.readiness.canCall,
  status:!configured?'Cần cấu hình ứng dụng':reconnecting?'Đang kết nối lại…':activeCallId?'Đang trong cuộc gọi':!loggedIn?'Chưa kết nối Voice':state?.readiness.canCall?'Sẵn sàng gọi CSKH':'Đang kiểm tra kết nối',
  canReceive:!!state?.readiness.canReceive,
  showReadinessHint:loggedIn&&!!state?.readiness.reasons?.some(reason=>reason!=='CALL_IN_PROGRESS'),
 };
}
