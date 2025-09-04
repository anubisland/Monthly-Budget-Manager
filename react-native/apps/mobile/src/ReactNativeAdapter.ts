import { BudgetDoc, serialize, deserialize } from '@monthly-budget/shared';
import { Alert, Platform, Share } from 'react-native';
import RNFS from 'react-native-fs';
import { pick } from '@react-native-documents/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define the adapter interface locally since we have import issues
interface BudgetAdapter {
  openJSON(): Promise<BudgetDoc | null>;
  saveJSON(doc: BudgetDoc): Promise<void>;
  exportXLSX(doc: BudgetDoc): Promise<void>;
}

const STORAGE_KEY = '@MonthlyBudget:current_budget';

export class ReactNativeAdapter implements BudgetAdapter {
  
  async openJSON(): Promise<BudgetDoc | null> {
    try {
      const result = await pick({
        type: 'application/json',
        presentationStyle: 'formSheet',
        transitionStyle: 'coverVertical',
      });
      
      if (result && result.length > 0) {
        const file = result[0];
        const content = await RNFS.readFile(file.uri, 'utf8');
        const budget = deserialize(content);
        
        // Save to local storage for persistence
        await AsyncStorage.setItem(STORAGE_KEY, serialize(budget));
        
        return budget;
      }
      
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage !== 'User canceled document picking') {
        Alert.alert('Error', 'Failed to open file: ' + errorMessage);
      }
      return null;
    }
  }

  async saveJSON(doc: BudgetDoc): Promise<void> {
    try {
      // Update saved_at timestamp
      const docWithTimestamp = {
        ...doc,
        meta: {
          ...doc.meta,
          saved_at: new Date().toISOString(),
        },
      };
      
      const content = serialize(docWithTimestamp);
      const filename = `budget_${docWithTimestamp.meta.year}_${docWithTimestamp.meta.month.toString().padStart(2, '0')}.json`;
      
      // Save to local storage
      await AsyncStorage.setItem(STORAGE_KEY, content);
      
      // Ask user how they want to save
      Alert.alert(
        'Save Budget',
        'How would you like to save your budget?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Quick Save',
            onPress: async () => {
              try {
                // Save to app's documents directory
                const path = `${RNFS.DocumentDirectoryPath}/${filename}`;
                await RNFS.writeFile(path, content, 'utf8');
                
                Alert.alert(
                  'Success', 
                  `Budget saved successfully!\nLocation: ${Platform.OS === 'ios' ? 'Files app > On My iPhone/iPad > Monthly Budget Manager' : 'Documents folder'}\nFilename: ${filename}`
                );
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                Alert.alert('Error', 'Failed to save file: ' + errorMessage);
              }
            },
          },
          {
            text: 'Share & Save',
            onPress: async () => {
              try {
                // Create temporary file for sharing
                const tempPath = `${RNFS.CachesDirectoryPath}/${filename}`;
                await RNFS.writeFile(tempPath, content, 'utf8');
                
                // Share the file so user can choose where to save
                const shareResult = await Share.share({
                  url: Platform.OS === 'ios' ? `file://${tempPath}` : tempPath,
                  title: 'Save Budget File',
                  message: 'Save your budget file to your preferred location',
                }, {
                  dialogTitle: 'Choose where to save your budget',
                  subject: 'Monthly Budget File',
                });
                
                // Clean up temp file after a delay
                setTimeout(async () => {
                  try {
                    await RNFS.unlink(tempPath);
                  } catch (cleanupError) {
                    console.warn('Failed to clean up temp file:', cleanupError);
                  }
                }, 5000);
                
                if (shareResult.action === Share.sharedAction) {
                  Alert.alert('Success', 'Budget file shared successfully!');
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                Alert.alert('Error', 'Failed to share file: ' + errorMessage);
              }
            },
          },
        ]
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', 'Failed to save file: ' + errorMessage);
    }
  }

  async exportXLSX(doc: BudgetDoc): Promise<void> {
    try {
      // For now, export as JSON with readable formatting
      // TODO: Could be extended to actual XLSX format with a library like xlsx
      const docWithTimestamp = {
        ...doc,
        meta: {
          ...doc.meta,
          exported_at: new Date().toISOString(),
        },
      };
      
      const content = serialize(docWithTimestamp);
      const filename = `budget_export_${docWithTimestamp.meta.year}_${docWithTimestamp.meta.month.toString().padStart(2, '0')}.json`;
      
      // Ask user how they want to export
      Alert.alert(
        'Export Budget',
        'How would you like to export your budget?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Quick Export',
            onPress: async () => {
              try {
                // Save to app's documents directory
                const path = `${RNFS.DocumentDirectoryPath}/${filename}`;
                await RNFS.writeFile(path, content, 'utf8');
                
                Alert.alert(
                  'Export Complete', 
                  `Budget exported successfully!\nLocation: ${Platform.OS === 'ios' ? 'Files app > On My iPhone/iPad > Monthly Budget Manager' : 'Documents folder'}\nFilename: ${filename}`
                );
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                Alert.alert('Error', 'Failed to export file: ' + errorMessage);
              }
            },
          },
          {
            text: 'Share & Export',
            onPress: async () => {
              try {
                // Create temporary file for sharing
                const tempPath = `${RNFS.CachesDirectoryPath}/${filename}`;
                await RNFS.writeFile(tempPath, content, 'utf8');
                
                // Share the file so user can choose where to export
                const shareResult = await Share.share({
                  url: Platform.OS === 'ios' ? `file://${tempPath}` : tempPath,
                  title: 'Export Budget File',
                  message: 'Export your budget file to your preferred location',
                }, {
                  dialogTitle: 'Choose where to export your budget',
                  subject: 'Monthly Budget Export',
                });
                
                // Clean up temp file after a delay
                setTimeout(async () => {
                  try {
                    await RNFS.unlink(tempPath);
                  } catch (cleanupError) {
                    console.warn('Failed to clean up temp file:', cleanupError);
                  }
                }, 5000);
                
                if (shareResult.action === Share.sharedAction) {
                  Alert.alert('Success', 'Budget file exported successfully!');
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                Alert.alert('Error', 'Failed to share file: ' + errorMessage);
              }
            },
          },
        ]
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', 'Failed to export file: ' + errorMessage);
    }
  }

  // Additional method to load from local storage
  async loadFromStorage(): Promise<BudgetDoc | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        return deserialize(stored);
      }
      return null;
    } catch (error) {
      console.error('Failed to load from storage:', error);
      return null;
    }
  }

  // Additional method to save to local storage only
  async saveToStorage(doc: BudgetDoc): Promise<void> {
    try {
      const content = serialize(doc);
      await AsyncStorage.setItem(STORAGE_KEY, content);
    } catch (error) {
      console.error('Failed to save to storage:', error);
    }
  }
}