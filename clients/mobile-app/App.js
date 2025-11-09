import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { AuthProvider } from './src/contexts/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import MainNavigator from './src/navigation/MainNavigator';

const Stack = createStackNavigator();

export default function App() {
  return (
    <PaperProvider>
      <AuthProvider>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Main" component={MainNavigator} />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </PaperProvider>
  );
}

