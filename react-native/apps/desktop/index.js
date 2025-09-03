import { AppRegistry, Platform } from 'react-native';
import App from './src/App';

const appName = Platform.OS === 'windows' ? 'DesktopApp' : 'DesktopApp';
AppRegistry.registerComponent(appName, () => App);
