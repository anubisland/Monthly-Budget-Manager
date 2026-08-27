import { AppRegistry } from 'react-native';
import App from './src/App';

const appName = 'BudgetManager';

// App itself renders BudgetProvider, which owns the locale as part of the
// stored budget -- so there is no separate language provider to wrap here.
AppRegistry.registerComponent(appName, () => App);
