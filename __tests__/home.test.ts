import {homeModel} from '../src/home';
const state:any={sessionState:{status:'authenticated',session:{userId:'42'}},readiness:{canCall:true,isLoggedIn:true,canReceive:false},connectionStates:{},calls:[]};
test('readiness and in-flight action gate CSKH, authenticated session still allows logout offline',()=>{expect(homeModel(state,false,true).canCall).toBe(true);expect(homeModel(state,true,true).canCall).toBe(false);expect(homeModel({...state,readiness:{...state.readiness,canCall:false,isLoggedIn:false}},false,true).loggedIn).toBe(true)});
test('reconnecting is visible and loginrequired returns to host login',()=>{expect(homeModel({...state,connectionStates:{call:'RECONNECTING'}},false,true).status).toBe('Đang kết nối lại…');expect(homeModel({...state,sessionState:{status:'loginRequired'}},false,true).loggedIn).toBe(false)});
test('unconfigured demo never enables login or call',()=>{expect(homeModel(state,false,false).canCall).toBe(false);expect(homeModel(state,false,false).status).toBe('Cần cấu hình ứng dụng')});

test('a presentable call remains reachable from home without creating another call',()=>{
 const active={...state,readiness:{...state.readiness,canCall:false,canReceive:false,reasons:['CALL_IN_PROGRESS']},calls:[{callId:'ended',presentable:false},{callId:'current',state:'ACTIVE',presentable:true}]};
 const model=homeModel(active,false,true);
 expect(model.activeCallId).toBe('current');
 expect(model.status).toBe('Đang trong cuộc gọi');
 expect(model.canCall).toBe(false);
 expect(model.showReadinessHint).toBe(false);
});
test('terminal or locally stopped calls cannot be reopened',()=>{
 const model=homeModel({...state,calls:[{callId:'old',state:'ACTIVE',presentable:false}],readiness:{...state.readiness,reasons:['MICROPHONE_PERMISSION_REQUIRED']}},false,true);
 expect(model.activeCallId).toBeUndefined();
 expect(model.showReadinessHint).toBe(true);
});
test('recovering calls can be reopened while call creation is blocked',()=>{
 const model=homeModel({...state,calls:[{callId:'current',presentable:true}],connectionStates:{current:'RECONNECTING'}},true,true);
 expect(model.activeCallId).toBe('current');
 expect(model.status).toBe('Đang kết nối lại…');
});
