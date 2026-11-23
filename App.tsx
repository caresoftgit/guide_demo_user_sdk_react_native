import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CustomerVoice,
  CustomerVoiceError,
  type VoiceState,
} from '@caresoft/customer-voice-react-native';
import config from './src/voice.config.json';
import { homeModel } from './src/home';
import { createCallAttempt } from './src/callAttempt';
import type { RequestTicket } from './src/hostBackend';

const configured =
  !!config.accountId &&
  !!config.appId &&
  /^https:\/\//.test(config.backendUrl) &&
  /^\+?[0-9]{1,32}$/.test(config.businessNumber) &&
  /^https:\/\//.test(config.bootstrapUrl);
const messages: Record<string, string> = {
  HOST_LOGIN_REQUIRED:
    'Đăng nhập ứng dụng doanh nghiệp trước khi kết nối Voice.',
  HOST_CLIENT_REQUIRED:
    'Cung cấp HTTP client đã xác thực của ứng dụng để kết nối Voice.',
  BOOTSTRAP_REQUEST_FAILED:
    'Không thể xin ticket Voice. Kiểm tra phiên ứng dụng và kết nối.',
  INVALID_BOOTSTRAP_RESPONSE: 'Phản hồi bootstrap không hợp lệ.',
  INVALID_PREPARATION: 'Không thể chuẩn bị kết nối Voice.',
  HTTPS_HOST_REQUIRED: 'Bootstrap yêu cầu endpoint HTTPS hợp lệ.',
  NATIVE_BOOTSTRAP_REQUIRED:
    'Ứng dụng chưa cấu hình Voice SDK. Hãy kiểm tra cấu hình native.',
  CONFIGURATION_MISMATCH:
    'Cấu hình ứng dụng và native chưa khớp. Hãy build lại.',
  LOGIN_REQUIRED: 'Kết nối Voice bằng phiên ứng dụng hiện có.',
  UNAUTHORIZED: 'Phiên Voice không còn hợp lệ.',
  MICROPHONE_PERMISSION_REQUIRED: 'Bạn cần cấp quyền micro.',
  NETWORK_RECOVERY_TIMEOUT:
    'Cuộc gọi đã kết thúc vì không thể khôi phục kết nối.',
  LOGOUT_REVOKE_UNCONFIRMED:
    'Đã ngắt Voice trên máy. Chưa xác nhận thu hồi phiên phía server.',
  NATIVE_MODULE_NOT_LINKED:
    'SDK native chưa được liên kết. Hãy cài Pods và build lại ứng dụng.',
};
export type AppProps = { requestTicket?: RequestTicket };
export default function App({ requestTicket }: AppProps = {}) {
  const [state, setState] = useState<VoiceState>();
  const [callBlocked, setCallBlocked] = useState(true);
  const acceptState = useCallback(
    (next: VoiceState) =>
      setState(previous =>
        previous && previous.revision >= next.revision ? previous : next,
      ),
    [],
  );
  const attempt = useRef(
    createCallAttempt(
      () => CustomerVoice.call(config.businessNumber),
      async () => {
        acceptState(await CustomerVoice.synchronize());
      },
      setCallBlocked,
      true,
    ),
  ).current;
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [fullScreen, setFullScreen] = useState(true);
  const model = homeModel(state, busy || callBlocked, configured);
  const showError = (e: unknown) =>
    setError(
      messages[(e as CustomerVoiceError)?.code] ??
        'Không thực hiện được. Kiểm tra kết nối và thử lại.',
    );
  async function action(operation: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (e) {
      showError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let off = () => {};
    let events = () => {};
    try {
      off = CustomerVoice.subscribeState(acceptState);
      events = CustomerVoice.subscribeEvents(e => {
        if (e.type === 'error') showError({ code: e.code });
      });
      if (configured)
        void CustomerVoice.initialize({
          ...config,
          pushEnvironment:
            config.pushEnvironment === 'sandbox' ? 'sandbox' : 'production',
        })
          .then(() => attempt.synchronize())
          .catch(e => {
            if (e.code !== 'LOGIN_REQUIRED') showError(e);
          });
    } catch (e) {
      showError(e);
    }
    const sub = AppState.addEventListener('change', status => {
      if (status === 'active' && configured) {
        void CustomerVoice.resume().catch(showError);
        void CustomerVoice.canShowIncomingScreen()
          .then(setFullScreen)
          .catch(() => {});
      }
    });
    void CustomerVoice.canShowIncomingScreen()
      .then(setFullScreen)
      .catch(() => {});
    return () => {
      off();
      events();
      sub.remove();
    };
  }, [acceptState, attempt]);
  async function permissions() {
    await CustomerVoice.requestMicrophonePermission();
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33)
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
    await CustomerVoice.resume();
    await CustomerVoice.checkReadiness();
  }
  async function connect() {
    if (!requestTicket)
      throw Object.assign(new Error('HOST_CLIENT_REQUIRED'), {
        code: 'HOST_CLIENT_REQUIRED',
      });
    const preparation = await CustomerVoice.prepareLogin();
    const ticket = await requestTicket(preparation);
    await CustomerVoice.loginWithTicket(preparation.attemptId, ticket);
    await attempt.synchronize();
  }
  return (
    <SafeAreaView style={s.page}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.brand}>
          <Text style={s.logo}>caresoft</Text>
          <Text style={s.subtitle}>Kết nối để phục vụ tốt hơn</Text>
        </View>
        <Text style={s.title}>Trung tâm hỗ trợ</Text>
        <Text style={s.description}>
          Trao đổi trực tiếp với bộ phận chăm sóc khách hàng.
        </Text>
        <View style={s.card}>
          <View style={s.row}>
            <View
              style={[
                s.dot,
                { backgroundColor: model.canCall ? '#18a875' : '#e6a443' },
              ]}
            />
            <Text style={s.status}>{model.status}</Text>
          </View>
          {state?.sessionState.status === 'authenticated' && (
            <Text style={s.detail}>
              Khách hàng: {state.sessionState.session.userId}
            </Text>
          )}
          <Text style={s.detail}>
            {model.activeCallId
              ? 'Cuộc gọi vẫn tiếp tục khi bạn rời màn hình gọi'
              : model.canReceive
              ? 'Đã sẵn sàng nhận cuộc gọi'
              : 'Chưa sẵn sàng nhận cuộc gọi'}
          </Text>
          {model.showReadinessHint && (
            <Text style={s.hint}>
              Kiểm tra quyền micro, thông báo và kết nối để sẵn sàng.
            </Text>
          )}
        </View>
        {model.activeCallId && (
          <Pressable
            accessibilityRole="button"
            testID="return-to-call"
            disabled={busy}
            style={s.call}
            onPress={() =>
              action(() => CustomerVoice.showCall(model.activeCallId!))
            }
          >
            <Text style={s.phone}>☎</Text>
            <Text style={s.callLabel}>Quay lại cuộc gọi</Text>
            <Text style={s.callHint}>Mở màn hình cuộc gọi đang diễn ra</Text>
          </Pressable>
        )}
        {!model.activeCallId && (
          <Pressable
            accessibilityRole="button"
            testID="call-support"
            disabled={!model.canCall}
            style={[s.call, !model.canCall && s.disabled]}
            onPress={() => action(() => attempt.call())}
          >
            <Text style={s.phone}>☎</Text>
            <Text style={s.callLabel}>Gọi CSKH</Text>
            <Text style={s.callHint}>Chúng tôi luôn sẵn sàng lắng nghe</Text>
          </Pressable>
        )}
        {!configured && (
          <Text style={s.hint}>
            Điền cấu hình của ứng dụng theo README, chạy npm run configure rồi
            build lại demo.
          </Text>
        )}
        {callBlocked && !busy && model.loggedIn && (
          <Pressable
            style={s.secondary}
            onPress={() => action(() => attempt.synchronize())}
          >
            <Text style={s.link}>Đồng bộ cuộc gọi trước khi gọi tiếp</Text>
          </Pressable>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {busy && <ActivityIndicator color="#1672d4" />}
        {!requestTicket && !model.loggedIn && (
          <Text style={s.hint}>
            Ứng dụng cần truyền callback xin ticket bằng phiên đăng nhập hiện
            có. Demo không đăng nhập tài khoản doanh nghiệp.
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          testID={model.loggedIn ? 'disconnect-voice' : 'connect-voice'}
          disabled={busy || !configured || (!model.loggedIn && !requestTicket)}
          style={s.secondary}
          onPress={() =>
            model.loggedIn
              ? Alert.alert(
                  'Ngắt Voice',
                  'Kết thúc phiên Voice và các cuộc gọi trên thiết bị này?',
                  [
                    { text: 'Hủy', style: 'cancel' },
                    {
                      text: 'Ngắt Voice',
                      style: 'destructive',
                      onPress: () => action(() => CustomerVoice.logout()),
                    },
                  ],
                )
              : action(connect)
          }
        >
          <Text style={s.link}>
            {model.loggedIn ? 'Ngắt Voice' : 'Kết nối Voice'}
          </Text>
        </Pressable>
        {configured && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={s.secondary}
            onPress={() => action(permissions)}
          >
            <Text style={s.link}>Cấp quyền micro và thông báo</Text>
          </Pressable>
        )}
        {!fullScreen && configured && (
          <Pressable
            style={s.secondary}
            onPress={() =>
              action(() => CustomerVoice.requestIncomingScreenPermission())
            }
          >
            <Text style={s.link}>Cho phép cuộc gọi trên màn hình khóa</Text>
          </Pressable>
        )}
        <Text style={s.footer}>Customer Voice · React Native · 0.5.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f8fc' },
  content: {
    padding: 24,
    paddingTop: 36,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    gap: 18,
  },
  brand: { alignItems: 'center', paddingBottom: 18 },
  logo: {
    fontSize: 35,
    fontWeight: '800',
    color: '#1473c9',
    letterSpacing: -1.5,
  },
  subtitle: { fontSize: 11, color: '#6c7b8d', marginTop: 3 },
  title: { fontSize: 27, fontWeight: '700', color: '#172b46' },
  description: { fontSize: 15, lineHeight: 22, color: '#687a91' },
  card: { padding: 21, borderRadius: 20, backgroundColor: '#fff', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  status: { fontSize: 16, fontWeight: '600', color: '#223852' },
  detail: { fontSize: 14, color: '#60748d' },
  hint: { fontSize: 13, color: '#73849b', lineHeight: 20 },
  call: {
    backgroundColor: '#1473c9',
    alignItems: 'center',
    padding: 26,
    borderRadius: 24,
    gap: 7,
  },
  disabled: { opacity: 0.4 },
  phone: { color: '#fff', fontSize: 36 },
  callLabel: { fontSize: 22, fontWeight: '700', color: '#fff' },
  callHint: { fontSize: 13, color: '#e5f1fe' },
  secondary: { padding: 12, alignItems: 'center' },
  link: { color: '#1473c9', fontSize: 15, fontWeight: '600' },
  error: { color: '#b12d3b', fontSize: 14, lineHeight: 21 },
  footer: {
    fontSize: 12,
    color: '#91a0b4',
    textAlign: 'center',
    marginTop: 15,
  },
});
