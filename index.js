/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Inject requestTicket from your authenticated application root.
// See docs/host-bootstrap.md; the standalone screen does not sign in the business user.
AppRegistry.registerComponent(appName, () => App);
