import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {CustomerVoice} from '@caresoft/customer-voice-react-native';
import App from '../App';

const mockState={revision:1,sessionState:{status:'authenticated',session:{userId:'42'}},readiness:{canCall:false,canReceive:false,isLoggedIn:true,reasons:['CALL_IN_PROGRESS']},calls:[{callId:'current',presentable:true}],connectionStates:{},audioStates:{}};
jest.mock('../src/voice.config.json',()=>({backendUrl:'https://gateway.example.invalid',enterpriseBackendUrl:'https://enterprise.example.invalid',accountId:'example-account',appId:'example-app',businessNumber:'18001234',pushEnvironment:'production'}));
jest.mock('@caresoft/customer-voice-react-native',()=>({CustomerVoice:{
 subscribeState:(accept:(state:unknown)=>void)=>{accept(mockState);return()=>{}},subscribeEvents:()=>()=>{},initialize:async()=>{},synchronize:async()=>mockState,canShowIncomingScreen:async()=>true,
 showCall:jest.fn(async()=>{}),call:jest.fn(),
}}));

test('Home opens the current native call instead of creating or answering another call',async()=>{
 let tree:ReactTestRenderer;
 await act(async()=>{tree=create(<App/>)});
 const buttons=tree!.root.findAllByProps({testID:'return-to-call'});
 expect(buttons.length).toBeGreaterThan(0);
 expect(tree!.root.findAllByProps({testID:'call-support'})).toHaveLength(0);
 await act(async()=>{await buttons[0].props.onPress()});
 expect(CustomerVoice.showCall).toHaveBeenCalledWith('current');
 expect(CustomerVoice.call).not.toHaveBeenCalled();
 await act(async()=>tree!.unmount());
});
