import React from 'react';
import { Alert, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CustomerVoice } from '@caresoft/customer-voice-react-native';
import App from '../App';

const mockPreparation = {
  attemptId: 'attempt',
  installationId: 'installation',
  platform: 'android',
  applicationId: 'com.example.CustomerApp',
  pushEnvironment: 'default',
  codeChallenge: 'C'.repeat(43),
  codeChallengeMethod: 'S256',
};
let mockState: any;
jest.mock('../src/voice.config.json', () => ({
  backendUrl: 'https://gateway.example.com',
  bootstrapUrl: 'https://app.example.com/api/voice/bootstrap',
  accountId: '1',
  appId: 'example-app',
  businessNumber: '18001234',
  pushEnvironment: 'production',
}));
jest.mock('@caresoft/customer-voice-react-native', () => ({
  CustomerVoice: {
    subscribeState: (accept: (state: unknown) => void) => {
      accept(mockState);
      return () => {};
    },
    subscribeEvents: () => () => {},
    initialize: async () => {},
    synchronize: async () => mockState,
    canShowIncomingScreen: async () => true,
    prepareLogin: jest.fn(async () => mockPreparation),
    loginWithTicket: jest.fn(async () => {}),
    logout: jest.fn(async () => {}),
    checkReadiness: jest.fn(async () => ({ canCall: true })),
    resume: jest.fn(async () => {}),
    requestMicrophonePermission: jest.fn(async () => true),
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    revision: 1,
    sessionState: { status: 'loggedOut' },
    readiness: {
      canCall: false,
      canReceive: false,
      isLoggedIn: false,
      reasons: [],
    },
    calls: [],
    connectionStates: {},
    audioStates: {},
  };
});

test('Voice connects with the application ticket callback without collecting business credentials', async () => {
  const requestTicket = jest.fn(async () => 'T'.repeat(43));
  let tree: ReactTestRenderer;
  await act(async () => {
    tree = create(<App {...{ requestTicket }} />);
  });
  expect(tree!.root.findAllByType(TextInput)).toHaveLength(0);
  const button = tree!.root.findByProps({ testID: 'connect-voice' });
  await act(async () => {
    await button.props.onPress();
  });
  expect(CustomerVoice.prepareLogin).toHaveBeenCalledTimes(1);
  expect(requestTicket).toHaveBeenCalledWith(mockPreparation);
  expect(CustomerVoice.loginWithTicket).toHaveBeenCalledWith(
    'attempt',
    'T'.repeat(43),
  );
  await act(async () => tree!.unmount());
});

test('without the application callback the demo stays unconnected and never collects credentials', async () => {
  let tree: ReactTestRenderer;
  await act(async () => {
    tree = create(<App />);
  });
  expect(
    tree!.root.findByProps({ testID: 'connect-voice' }).props.disabled,
  ).toBe(true);
  expect(tree!.root.findAllByType(TextInput)).toHaveLength(0);
  expect(CustomerVoice.prepareLogin).not.toHaveBeenCalled();
  await act(async () => tree!.unmount());
});
test('Voice disconnect calls only native logout and does not call the application bootstrap', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  mockState = {
    ...mockState,
    sessionState: { status: 'authenticated', session: { userId: '42' } },
  };
  const requestTicket = jest.fn(async () => 'T'.repeat(43));
  let tree: ReactTestRenderer;
  await act(async () => {
    tree = create(<App requestTicket={requestTicket} />);
  });
  await act(async () => {
    tree!.root.findByProps({ testID: 'disconnect-voice' }).props.onPress();
  });
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => {
    await buttons[1].onPress!();
  });
  expect(CustomerVoice.logout).toHaveBeenCalledTimes(1);
  expect(requestTicket).not.toHaveBeenCalled();
  await act(async () => tree!.unmount());
  alert.mockRestore();
});
test('expired application session remains in the host application login flow', async () => {
  const requestTicket = async () => {
    throw Object.assign(new Error('HOST_LOGIN_REQUIRED'), {
      code: 'HOST_LOGIN_REQUIRED',
    });
  };
  let tree: ReactTestRenderer;
  await act(async () => {
    tree = create(<App requestTicket={requestTicket} />);
  });
  await act(async () => {
    await tree!.root.findByProps({ testID: 'connect-voice' }).props.onPress();
  });
  expect(CustomerVoice.loginWithTicket).not.toHaveBeenCalled();
  expect(tree!.root.findAllByType(TextInput)).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).toContain(
    'Đăng nhập ứng dụng doanh nghiệp trước khi kết nối Voice.',
  );
  await act(async () => tree!.unmount());
});
