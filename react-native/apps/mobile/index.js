import React from 'react';
import { AppRegistry } from 'react-native';
import App from './src/App';
import { LanguageProvider } from './src/LanguageContext';

const appName = 'BudgetManager';

function Root() {
  return (
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}

AppRegistry.registerComponent(appName, () => Root);
